import uuid
from collections import Counter, defaultdict
from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.db.models import BooleanField, Count, Exists, OuterRef, Q, Value
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.igdb import services as igdb_services
from apps.igdb.client import IGDBClient, IGDBError, IGDBNotConfigured

from .models import (
    Friendship,
    Game,
    GameList,
    GameListLike,
    PlaytimeSnapshot,
    Post,
    PostComment,
    PostLike,
    UserGame,
)
from .permissions import IsOwnerOrReadOnly
from .platforms import canonical_platform
from .serializers import (
    FriendshipSerializer,
    GameListCardSerializer,
    GameListCommentSerializer,
    GameListSerializer,
    GameReviewSerializer,
    GameSerializer,
    LoginSerializer,
    PostCommentSerializer,
    PostSerializer,
    PublicUserSerializer,
    RegisterSerializer,
    ReviewCommentSerializer,
    UserGameSerializer,
    UserSerializer,
)

User = get_user_model()


def tokens_for(user):
    """Devuelve el par de tokens JWT (access + refresh) para un usuario."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


# ---------------------------------------------------------------------------
# Autenticación
# ---------------------------------------------------------------------------
class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok", "service": "gametrackr-backend"})


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"user": UserSerializer(user).data, **tokens_for(user)},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        return Response({"user": UserSerializer(user).data, **tokens_for(user)})


class MeView(RetrieveUpdateAPIView):
    """Devuelve (GET) y permite actualizar (PATCH) el perfil del usuario actual."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


class UploadView(APIView):
    """Sube una imagen y devuelve su URL. La usan avatar, portadas y posts."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get("file")
        if file is None:
            return Response({"detail": "No se ha enviado ningún archivo."}, status=status.HTTP_400_BAD_REQUEST)
        ext = ALLOWED_IMAGE_TYPES.get(file.content_type)
        if ext is None:
            return Response(
                {"detail": "Formato no admitido. Usa JPG, PNG, WEBP o GIF."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if file.size > settings.MAX_UPLOAD_SIZE:
            mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
            return Response(
                {"detail": f"La imagen supera el tamaño máximo de {mb} MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = default_storage.save(f"uploads/{uuid.uuid4().hex}.{ext}", file)
        url = request.build_absolute_uri(default_storage.url(name))
        return Response({"url": url}, status=status.HTTP_201_CREATED)


class ChangePasswordView(APIView):
    """Cambia la contraseña del usuario autenticado."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.data.get("current_password") or ""
        new = request.data.get("new_password") or ""
        if not request.user.check_password(current):
            return Response({"detail": "La contraseña actual no es correcta."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new, request.user)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        return Response({"detail": "Contraseña actualizada."})


# ---------------------------------------------------------------------------
# ViewSets de la API
# ---------------------------------------------------------------------------
# Porciones con nombre del donut de géneros; el resto se agrupa en una sola
# para que el gráfico represente el total y no solo su parte visible.
GENRE_CHART_SLICES = 8
OTHER_GENRES_LABEL = "Otros"
# Cuota mínima para merecer porción propia: por debajo del 1 % la etiqueta se
# lee como un "0 %" y ocupa un hueco sin aportar nada legible al gráfico.
GENRE_MIN_SHARE = 0.01


def _next_month_start(dt):
    """Primer instante del mes siguiente al de `dt`, en su misma zona horaria."""
    year, month = (dt.year + 1, 1) if dt.month == 12 else (dt.year, dt.month + 1)
    return dt.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)


def _spread_hours_over_months(hours, start, end):
    """Reparte `hours` entre los meses del intervalo (start, end].

    Cuando dos lecturas del contador caen en meses distintos no hay forma de
    saber qué día se jugó cada hora, así que se reparten en proporción al tiempo
    transcurrido en cada mes. Si el intervalo no cruza ningún cambio de mes -lo
    habitual si se sincroniza con cierta frecuencia- todo va a parar a un único
    mes y el dato es exacto. Devuelve pares (clave "YYYY-MM", horas).
    """
    start, end = timezone.localtime(start), timezone.localtime(end)
    if end <= start:
        return [(end.strftime("%Y-%m"), hours)]
    total = (end - start).total_seconds()
    parts = []
    cursor = start
    while cursor < end:
        boundary = min(_next_month_start(cursor), end)
        share = (boundary - cursor).total_seconds() / total
        parts.append((cursor.strftime("%Y-%m"), hours * share))
        cursor = boundary
    return parts


class StatsDashboardView(APIView):
    """Estadísticas agregadas de la biblioteca del usuario para el dashboard."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        all_ugs = list(UserGame.objects.filter(user=request.user).select_related("game"))
        by_status = Counter(ug.status for ug in all_ugs)
        # La lista de deseos son juegos que todavia no se tienen, asi que no
        # forman parte de la biblioteca ni entran en ninguna metrica de abajo.
        ugs = [ug for ug in all_ugs if ug.status != UserGame.Status.WISHLIST]
        total = len(ugs)
        total_hours = round(sum(ug.hours_played or 0 for ug in ugs), 1)
        completed_90 = sum(1 for ug in ugs if (ug.completion_percentage or 0) >= 90)
        completion_index = round(completed_90 / total * 100, 1) if total else 0

        # Horas por género (top 8)
        genre_hours = defaultdict(float)
        for ug in ugs:
            for genre in ug.game.genres or []:
                genre_hours[genre] += ug.hours_played or 0
        # Un género sin horas no aporta nada a un gráfico de horas: se descarta
        # antes de recortar para no gastar una porción en un cero.
        ranked_genres = sorted(
            ((g, h) for g, h in genre_hours.items() if h > 0),
            key=lambda x: x[1],
            reverse=True,
        )
        # Reciben porción propia los géneros más jugados que además superen la
        # cuota mínima; los demás caen en "Otros", que así representa de verdad
        # todo lo que no se ve y evita que los porcentajes se inflen.
        total_genre_hours = sum(h for _, h in ranked_genres)
        min_hours = total_genre_hours * GENRE_MIN_SHARE
        named_genres = [
            (g, h) for g, h in ranked_genres[:GENRE_CHART_SLICES] if h >= min_hours
        ]
        hours_by_genre = [{"genre": g, "hours": round(h, 1)} for g, h in named_genres]
        rest_hours = total_genre_hours - sum(h for _, h in named_genres)
        if round(rest_hours, 1) > 0:
            hours_by_genre.append({"genre": OTHER_GENRES_LABEL, "hours": round(rest_hours, 1)})

        # Distribución por plataforma (la del usuario o la principal del juego)
        # Se unifica el nombre antes de contar: "PC" y "PC (Microsoft Windows)"
        # son la misma plataforma aunque las escriba distinto cada fuente.
        plat_counter = Counter()
        for ug in ugs:
            platform = ug.platform or (ug.game.platforms[0] if ug.game.platforms else "Desconocida")
            plat_counter[canonical_platform(platform)] += 1
        platform_distribution = [{"platform": p, "count": c} for p, c in plat_counter.most_common(8)]

        # Actividad mensual (últimos 12 meses) a partir del historial de horas.
        today = date.today()
        months = []
        y, m = today.year, today.month
        for _ in range(12):
            months.append(f"{y:04d}-{m:02d}")
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        months.reverse()
        # Las horas de cada mes salen de restar lecturas consecutivas del
        # contador de cada juego, repartiendo la diferencia entre los meses que
        # abarca el intervalo. La primera lectura es la línea base (horas
        # anteriores al registro), así que no cuenta; y las diferencias
        # negativas -correcciones a la baja- se ignoran en lugar de restar
        # actividad real de otros meses.
        month_hours = defaultdict(float)
        snapshots = (
            PlaytimeSnapshot.objects.filter(user_game__user=request.user)
            .exclude(user_game__status=UserGame.Status.WISHLIST)
            .order_by("user_game_id", "recorded_at", "pk")
            .values_list("user_game_id", "hours", "recorded_at")
        )
        current_id = None
        previous_hours = 0.0
        previous_at = None
        for ug_id, hours, recorded_at in snapshots:
            if ug_id != current_id:
                current_id, previous_hours, previous_at = ug_id, hours, recorded_at
                continue
            delta = hours - previous_hours
            if delta > 0:
                for month_key, part in _spread_hours_over_months(delta, previous_at, recorded_at):
                    month_hours[month_key] += part
            previous_hours, previous_at = hours, recorded_at
        playtime_over_time = [{"month": mk, "hours": round(month_hours.get(mk, 0), 1)} for mk in months]

        def brief(ug):
            return {
                "title": ug.game.title,
                "hours": round(ug.hours_played or 0, 1),
                "completion_pct": round(ug.completion_percentage or 0, 1),
                "cover_url": ug.game.cover_url,
            }

        top_by_completion = [brief(ug) for ug in sorted(ugs, key=lambda u: u.completion_percentage or 0, reverse=True)[:5]]
        top_by_hours = [brief(ug) for ug in sorted(ugs, key=lambda u: u.hours_played or 0, reverse=True)[:5]]
        recent = [
            {
                "title": ug.game.title,
                "status": ug.status,
                "hours": round(ug.hours_played or 0, 1),
                "updated_at": ug.updated_at,
                "cover_url": ug.game.cover_url,
            }
            for ug in sorted(ugs, key=lambda u: u.updated_at, reverse=True)[:5]
        ]

        return Response({
            "total_games": total,
            "completed_games": by_status.get("completed", 0),
            "playing_games": by_status.get("playing", 0),
            "backlog_games": by_status.get("backlog", 0),
            "wishlist_games": by_status.get("wishlist", 0),
            "total_hours": total_hours,
            "completion_index": completion_index,
            "games_by_status": {
                "playing": by_status.get("playing", 0),
                "completed": by_status.get("completed", 0),
                "backlog": by_status.get("backlog", 0),
                "abandoned": by_status.get("abandoned", 0),
            },
            "hours_by_genre": hours_by_genre,
            # Total real de géneros con horas: hours_by_genre viene recortado.
            "genre_count": len(ranked_genres),
            "platform_distribution": platform_distribution,
            "playtime_over_time": playtime_over_time,
            "top_games_by_completion": top_by_completion,
            "top_games_by_hours": top_by_hours,
            "recent_games": recent,
        })


def _int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class GameViewSet(viewsets.ModelViewSet):
    queryset = Game.objects.all()
    serializer_class = GameSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "igdb_id"

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(title__icontains=search)
        return qs

    # -- Integración con IGDB ------------------------------------------------
    def _igdb_list(self, fetch):
        """Ejecuta una consulta a IGDB, cachea los resultados y los serializa.

        Devuelve (data, error_response): si hay error, data es None.
        """
        try:
            items = fetch()
        except IGDBNotConfigured:
            return None, Response(
                {"detail": "IGDB no está configurado. Añade IGDB_CLIENT_ID e "
                           "IGDB_CLIENT_SECRET al entorno."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except IGDBError:
            return None, Response(
                {"detail": "No se pudo contactar con IGDB."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        games = igdb_services.cache_games(items)
        return self.get_serializer(games, many=True).data, None

    def retrieve(self, request, igdb_id=None):
        """Detalle de un juego: primero en la BD local, si no, en IGDB."""
        game = Game.objects.filter(igdb_id=igdb_id).first()
        if game is None:
            try:
                data = IGDBClient().get_game(igdb_id)
            except IGDBNotConfigured:
                return Response(
                    {"detail": "IGDB no está configurado."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except IGDBError:
                return Response(
                    {"detail": "No se pudo contactar con IGDB."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            if not data:
                return Response(
                    {"detail": "Juego no encontrado."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            game = igdb_services.cache_game(data)
        return Response(self.get_serializer(game).data)

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Búsqueda por subcadena con ranking: empieza-por > contiene.

        Sirve resultados de la caché local aunque IGDB no responda; solo
        devuelve error si no hay nada que mostrar.
        """
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response([])
        limit = _int(request.query_params.get("limit"), 20)
        offset = _int(request.query_params.get("offset"), 0)
        games, igdb_error = igdb_services.search_games_ranked(query, limit=limit, offset=offset)
        if not games and igdb_error is not None:
            return _igdb_error_response(igdb_error)
        return Response(self.get_serializer(games, many=True).data)

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        limit = _int(request.query_params.get("limit"), 10)
        offset = _int(request.query_params.get("offset"), 0)
        data, error = self._igdb_list(
            lambda: IGDBClient().get_upcoming_games(limit=limit, offset=offset)
        )
        return error or Response(data)

    @action(detail=False, methods=["get"])
    def popular(self, request):
        limit = _int(request.query_params.get("limit"), 12)
        offset = _int(request.query_params.get("offset"), 0)
        data, error = self._igdb_list(
            lambda: IGDBClient().get_popular_games(limit=limit, offset=offset)
        )
        return error or Response(data)

    @action(detail=False, methods=["get"], url_path="top-rated")
    def top_rated(self, request):
        limit = _int(request.query_params.get("limit"), 12)
        offset = _int(request.query_params.get("offset"), 0)
        data, error = self._igdb_list(
            lambda: IGDBClient().get_top_rated_games(limit=limit, offset=offset)
        )
        return error or Response(data)

    @action(detail=True, methods=["get"])
    def reviews(self, request, igdb_id=None):
        """Reseñas y valoraciones de la comunidad para un juego.

        Incluye tanto los UserGame con reseña escrita como los que solo
        llevan una nota (0-10) sin texto: estos últimos no aparecen en el
        listado de reseñas del frontend, pero sí deben contar en la media
        de valoración de la comunidad, que se calcula sobre esta misma lista.
        """
        game = Game.objects.filter(igdb_id=igdb_id).first()
        if game is None:
            return Response([])
        qs = (
            UserGame.objects.filter(game=game)
            .filter(Q(user_rating__isnull=False) | (~Q(review__isnull=True) & ~Q(review="")))
            .select_related("user")
            .order_by("-updated_at")
        )
        return Response(GameReviewSerializer(qs, many=True).data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path=r"reviews/(?P<review_id>\d+)/comments",
    )
    def review_comments(self, request, igdb_id=None, review_id=None):
        """Comentarios sobre la reseña (UserGame.review) de otro usuario."""
        review = get_object_or_404(
            UserGame.objects.exclude(review__isnull=True).exclude(review=""),
            pk=review_id,
            game__igdb_id=igdb_id,
        )
        return comment_thread_response(request, review.comments, ReviewCommentSerializer)


def comment_thread_response(request, related_manager, serializer_cls):
    """Lógica común de un hilo de comentarios con un nivel de respuestas (patrón
    YouTube): sin `?parent=`, GET trae los comentarios de primer nivel; con
    `?parent=<id>`, trae las respuestas de ese comentario. POST crea un
    comentario, o una respuesta si se envía `parent` (que debe ser, a su vez,
    un comentario de primer nivel: no se anidan respuestas de respuestas).

    `related_manager` es el manager inverso ya filtrado al padre correcto
    (post, lista o reseña), p. ej. `post.comments`.
    """
    if request.method == "POST":
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response(
                {"detail": "El comentario no puede estar vacío."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        parent = None
        parent_id = request.data.get("parent")
        if parent_id:
            parent = related_manager.filter(pk=parent_id, parent__isnull=True).first()
            if parent is None:
                return Response(
                    {"detail": "Comentario padre no válido."}, status=status.HTTP_400_BAD_REQUEST
                )
        comment = related_manager.create(content=content, user=request.user, parent=parent)
        return Response(serializer_cls(comment).data, status=status.HTTP_201_CREATED)

    qs = related_manager.select_related("user").all()
    parent_id = request.query_params.get("parent")
    qs = qs.filter(parent_id=parent_id) if parent_id else qs.filter(parent__isnull=True)
    return Response(serializer_cls(qs, many=True).data)


def _igdb_error_response(error):
    """Traduce el código devuelto por get_or_fetch_game a una Response."""
    if error == 503:
        return Response({"detail": "IGDB no está configurado."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if error == 502:
        return Response({"detail": "No se pudo contactar con IGDB."}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"detail": "Juego no encontrado."}, status=status.HTTP_404_NOT_FOUND)


def create_achievement_post(usergame):
    """Crea un post automático de logro cuando un juego se marca como completado."""
    at_100 = (usergame.completion_percentage or 0) >= 100
    completed = at_100 or usergame.status == UserGame.Status.COMPLETED
    if not completed:
        return
    already = Post.objects.filter(
        user=usergame.user, related_game=usergame.game, post_type=Post.PostType.ACHIEVEMENT
    ).exists()
    if not already:
        # Solo se afirma "al 100%" cuando la completitud lo respalda; si el logro
        # viene de marcar el estado como "completado", se omite ese matiz.
        content = (
            f"Ha completado {usergame.game.title} al 100%"
            if at_100
            else f"Ha completado {usergame.game.title}"
        )
        Post.objects.create(
            user=usergame.user,
            related_game=usergame.game,
            post_type=Post.PostType.ACHIEVEMENT,
            content=content,
        )


class UserGameViewSet(viewsets.ModelViewSet):
    serializer_class = UserGameSerializer
    permission_classes = [IsAuthenticated]

    SORT_FIELDS = {
        "hours": "-hours_played",
        "title": "game__title",
        "added_at": "-added_at",
        "rating": "-user_rating",
    }

    def get_queryset(self):
        qs = UserGame.objects.filter(user=self.request.user).select_related("game")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        game_filter = self.request.query_params.get("game")
        if game_filter:
            qs = qs.filter(game__igdb_id=game_filter)
        sort = self.request.query_params.get("sort")
        return qs.order_by(self.SORT_FIELDS.get(sort, "-updated_at"))

    def create(self, request, *args, **kwargs):
        igdb_id = request.data.get("igdb_id")
        if igdb_id in (None, ""):
            return Response({"detail": "Falta igdb_id."}, status=status.HTTP_400_BAD_REQUEST)

        game, error = igdb_services.get_or_fetch_game(igdb_id)
        if error is not None:
            return _igdb_error_response(error)

        existing = UserGame.objects.filter(user=request.user, game=game).first()
        if existing is not None:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data, context={**self.get_serializer_context(), "game": game})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, game=game)
        create_achievement_post(serializer.instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = serializer.save()
        create_achievement_post(instance)


# Cuantas listas devuelve el carrusel de "mejor valoradas" de la comunidad.
TOP_LISTS_LIMIT = 12


def annotate_lists(qs, user):
    """Anota likes_count, comments_count e is_liked para evitar el N+1.

    distinct=True porque las dos cuentas se resuelven con JOINs y sin él cada
    una multiplicaría a la otra.
    """
    if user and user.is_authenticated:
        liked = Exists(GameListLike.objects.filter(game_list=OuterRef("pk"), user=user))
    else:
        liked = Value(False, output_field=BooleanField())
    return qs.annotate(
        likes_count=Count("likes", distinct=True),
        comments_count=Count("comments", distinct=True),
        is_liked=liked,
    )


class GameListViewSet(viewsets.ModelViewSet):
    serializer_class = GameListSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrReadOnly]

    def get_permissions(self):
        # Comentar una lista no exige ser su propietario, solo poder verla
        # (get_queryset ya filtra las privadas ajenas).
        if self.action in ("comments", "like", "top"):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        qs = GameList.objects.filter(Q(is_public=True) | Q(user=user)).distinct()
        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)
        return annotate_lists(qs, user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="games")
    def add_game(self, request, pk=None):
        game_list = self.get_object()
        game, error = igdb_services.get_or_fetch_game(request.data.get("igdb_id"))
        if error is not None:
            return _igdb_error_response(error)
        game_list.games.add(game)
        return Response(self.get_serializer(game_list).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], url_path=r"games/(?P<game_id>[^/.]+)")
    def remove_game(self, request, pk=None, game_id=None):
        game_list = self.get_object()
        game_list.games.remove(game_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post", "delete"])
    def like(self, request, pk=None):
        """Me gusta sobre una lista: la señal que ordena el carrusel."""
        game_list = self.get_object()
        if request.method == "DELETE":
            GameListLike.objects.filter(game_list=game_list, user=request.user).delete()
            return Response({"liked": False, "likes_count": game_list.likes.count()})
        GameListLike.objects.get_or_create(game_list=game_list, user=request.user)
        return Response({"liked": True, "likes_count": game_list.likes.count()})

    @action(detail=False, methods=["get"])
    def top(self, request):
        """Listas públicas mejor valoradas, para el carrusel de la comunidad.

        Se excluyen las vacías: una tarjeta sin portadas no dice nada.
        """
        qs = (
            GameList.objects.filter(is_public=True, games__isnull=False)
            .select_related("user")
            .prefetch_related("games")
            .distinct()
        )
        qs = annotate_lists(qs, request.user).order_by("-likes_count", "-created_at")
        serializer = GameListCardSerializer(
            qs[:TOP_LISTS_LIMIT], many=True, context={"request": request}
        )
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def share(self, request, pk=None):
        """Publica la lista en el feed. Es un acto deliberado del autor: hacerla
        pública la muestra en el carrusel, pero no la difunde por sí solo."""
        game_list = self.get_object()
        if not game_list.is_public:
            return Response(
                {"detail": "Haz la lista pública antes de compartirla en el feed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Post.objects.filter(related_list=game_list, post_type=Post.PostType.LIST).exists():
            return Response(
                {"detail": "Esta lista ya está publicada en el feed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        content = (request.data.get("content") or "").strip()
        post = Post.objects.create(
            user=request.user,
            related_list=game_list,
            post_type=Post.PostType.LIST,
            content=content or f"Ha publicado la lista {game_list.name}",
        )
        return Response(
            PostSerializer(post, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        game_list = self.get_object()
        return comment_thread_response(request, game_list.comments, GameListCommentSerializer)


def POSTS_WITH_RELATIONS():
    """Queryset base de publicaciones con todo lo que pinta la tarjeta.

    related_list trae su autor y sus juegos porque la tarjeta de lista dibuja
    un mosaico de portadas; sin el prefetch serían dos consultas por post.
    """
    return Post.objects.select_related("user", "related_game", "related_list").prefetch_related(
        "related_list__games", "related_list__user"
    )


def annotate_posts(qs, user):
    """Anota likes_count, comments_count e is_liked para evitar el N+1 al
    serializar posts (una sola consulta en lugar de 3 por publicación)."""
    if user and user.is_authenticated:
        liked = Exists(PostLike.objects.filter(post=OuterRef("pk"), user=user))
    else:
        liked = Value(False, output_field=BooleanField())
    # order_by explícito: la anotación con Count añade GROUP BY y anula el orden
    # por defecto del Meta, y la paginación necesita un orden determinista.
    return qs.annotate(
        likes_count=Count("likes", distinct=True),
        comments_count=Count("comments", distinct=True),
        is_liked=liked,
    ).order_by("-created_at")


class FeedPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"


class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = FeedPagination

    def get_permissions(self):
        # Solo el autor puede editar o borrar su post; el resto requiere login.
        if self.action in ("update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsOwnerOrReadOnly()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = POSTS_WITH_RELATIONS()
        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)
        return annotate_posts(qs, self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"])
    def feed(self, request):
        """Feed cronológico único de la comunidad.

        Por defecto trae todas las publicaciones; ?scope=following lo limita a
        la gente que sigues (la interfaz ya no ofrece esa distinción, pero el
        filtro se conserva porque no estorba y puede servir en el perfil).
        """
        qs = POSTS_WITH_RELATIONS()
        if request.query_params.get("scope", "all") == "following":
            following_ids = Friendship.objects.filter(
                from_user=request.user, status=Friendship.Status.ACCEPTED
            ).values_list("to_user_id", flat=True)
            qs = qs.filter(Q(user__in=following_ids) | Q(user=request.user))
        qs = annotate_posts(qs, request.user)
        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["post", "delete"])
    def like(self, request, pk=None):
        post = self.get_object()
        if request.method == "DELETE":
            PostLike.objects.filter(post=post, user=request.user).delete()
            return Response({"liked": False, "likes_count": post.likes.count()})
        PostLike.objects.get_or_create(post=post, user=request.user)
        return Response({"liked": True, "likes_count": post.likes.count()})

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        post = self.get_object()
        return comment_thread_response(request, post.comments, PostCommentSerializer)


class PostCommentViewSet(viewsets.ModelViewSet):
    serializer_class = PostCommentSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrReadOnly]

    def get_queryset(self):
        qs = PostComment.objects.select_related("user", "post")
        post_id = self.request.query_params.get("post")
        if post_id:
            qs = qs.filter(post_id=post_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class FriendshipViewSet(viewsets.ModelViewSet):
    serializer_class = FriendshipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Friendship.objects.filter(Q(from_user=user) | Q(to_user=user))

    def perform_create(self, serializer):
        serializer.save(from_user=self.request.user)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        friendship = self.get_object()
        if friendship.to_user != request.user:
            return Response(
                {"detail": "Solo el destinatario puede aceptar la solicitud."},
                status=status.HTTP_403_FORBIDDEN,
            )
        friendship.status = Friendship.Status.ACCEPTED
        friendship.save(update_fields=["status"])
        return Response(self.get_serializer(friendship).data)


# ---------------------------------------------------------------------------
# Social: seguir, dejar de seguir, amigos, búsqueda y perfil público
# ---------------------------------------------------------------------------
class FollowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if int(user_id) == request.user.id:
            return Response({"detail": "No puedes seguirte a ti mismo."}, status=status.HTTP_400_BAD_REQUEST)
        target = get_object_or_404(User, pk=user_id)
        Friendship.objects.get_or_create(
            from_user=request.user, to_user=target,
            defaults={"status": Friendship.Status.ACCEPTED},
        )
        return Response({"following": True})


class UnfollowView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        Friendship.objects.filter(from_user=request.user, to_user_id=user_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FriendsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ids = Friendship.objects.filter(from_user=request.user).values_list("to_user_id", flat=True)
        users = User.objects.filter(id__in=ids)
        return Response(PublicUserSerializer(users, many=True, context={"request": request}).data)


class UserSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        users = (
            User.objects.filter(username__icontains=q).exclude(pk=request.user.pk)[:20]
            if q else User.objects.none()
        )
        return Response(PublicUserSerializer(users, many=True, context={"request": request}).data)


class PublicProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, username):
        target = get_object_or_404(User, username=username)
        is_owner = target == request.user
        locked = not target.is_public_profile and not is_owner
        user_data = PublicUserSerializer(target, context={"request": request}).data

        # Perfil privado (estilo Instagram): se devuelve la identidad para pintar
        # la cabecera, pero se oculta el resto (stats, y con ellas listas/posts en
        # el frontend). La bio se considera contenido del perfil, así que también.
        if locked:
            user_data["bio"] = None
            return Response({"user": user_data, "stats": None, "is_private": True})

        # La lista de deseos no cuenta como juegos de la biblioteca.
        ugs = UserGame.objects.filter(user=target).exclude(status=UserGame.Status.WISHLIST)
        stats = {
            "total_games": ugs.count(),
            "completed_games": ugs.filter(status=UserGame.Status.COMPLETED).count(),
            "total_hours": round(sum(u.hours_played or 0 for u in ugs), 1),
        }
        return Response({"user": user_data, "stats": stats, "is_private": False})
