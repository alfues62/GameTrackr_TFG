from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import (
    Friendship,
    Game,
    GameList,
    GameListComment,
    Post,
    PostComment,
    ReviewComment,
    UserGame,
)
from .validators import game_not_released, validate_email_domain

User = get_user_model()


# ---------------------------------------------------------------------------
# Usuario y autenticación
# ---------------------------------------------------------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "avatar_url",
            "bio",
            "steam_id",
            "is_steam_linked",
            "psn_online_id",
            "is_psn_linked",
            "is_public_profile",
            "has_completed_onboarding",
            "created_at",
        )
        read_only_fields = (
            "id",
            "steam_id",
            "is_steam_linked",
            "psn_online_id",
            "is_psn_linked",
            "created_at",
        )


class PublicUserSerializer(serializers.ModelSerializer):
    """Datos públicos de un usuario, con la marca de si lo sigues."""

    is_following = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "avatar_url", "bio", "is_following")

    def get_is_following(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return Friendship.objects.filter(from_user=request.user, to_user=obj).exists()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ("id", "username", "email", "password")
        extra_kwargs = {"username": {"required": False}}

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Ya existe un usuario con este email.")
        validate_email_domain(value)
        return value

    def _unique_username(self, base):
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists():
            username = f"{base}{suffix}"
            suffix += 1
        return username

    def create(self, validated_data):
        password = validated_data.pop("password")
        email = validated_data["email"]
        username = validated_data.get("username") or email.split("@")[0]
        username = self._unique_username(username)

        user = User(username=username, email=email)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            user = User.objects.get(email__iexact=attrs["email"])
        except User.DoesNotExist:
            raise serializers.ValidationError("Credenciales incorrectas.")

        if not user.check_password(attrs["password"]) or not user.is_active:
            raise serializers.ValidationError("Credenciales incorrectas.")

        attrs["user"] = user
        return attrs


# ---------------------------------------------------------------------------
# Juegos y biblioteca
# ---------------------------------------------------------------------------
class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = (
            "id",
            "igdb_id",
            "title",
            "cover_url",
            "description",
            "release_date",
            "genres",
            "platforms",
            "igdb_rating",
            "category",
        )


class UserGameSerializer(serializers.ModelSerializer):
    game = GameSerializer(read_only=True)
    # En la creación se identifica el juego por su id de IGDB; la vista lo
    # resuelve (o lo descarga) y asigna el FK `game`.
    igdb_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = UserGame
        fields = (
            "id",
            "game",
            "igdb_id",
            "status",
            "hours_played",
            "completion_percentage",
            "user_rating",
            "review",
            "platform",
            "is_from_steam",
            "sync_source",
            "last_synced",
            "added_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_from_steam", "sync_source", "last_synced", "added_at", "updated_at")

    def validate(self, attrs):
        if self.instance is None:
            # Creación: el juego llega por contexto (la vista ya lo resolvió
            # antes de instanciar el serializer). Si no se manda `status`, DRF
            # no lo mete en `attrs` — hay que asumir el default del modelo a
            # mano, porque ese default también debe respetar la restricción.
            effective_status = attrs.get("status", UserGame.Status.BACKLOG)
            game = self.context.get("game")
        else:
            # Edición: solo se valida si el cliente toca `status` de verdad;
            # no se revalidan el resto de campos sobre un estado que ya
            # existía de antes (p. ej. seguir anotando horas de una beta).
            if "status" not in attrs:
                return attrs
            effective_status = attrs["status"]
            game = self.instance.game

        if effective_status != UserGame.Status.WISHLIST and game is not None and game_not_released(game):
            raise serializers.ValidationError(
                {"status": "Este juego aún no ha salido: solo puedes añadirlo a tu lista de deseos."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("igdb_id", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("igdb_id", None)
        return super().update(instance, validated_data)


class GameReviewSerializer(serializers.ModelSerializer):
    """Reseña pública de un juego (a partir del UserGame de cada usuario)."""

    user = UserSerializer(read_only=True)
    comments_count = serializers.SerializerMethodField()

    class Meta:
        model = UserGame
        fields = ("id", "user", "user_rating", "review", "comments_count", "updated_at")

    def get_comments_count(self, obj):
        return obj.comments.count()


class ReviewCommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    replies_count = serializers.SerializerMethodField()

    class Meta:
        model = ReviewComment
        fields = ("id", "review", "user", "content", "parent", "replies_count", "created_at")
        # `parent` se resuelve en la vista (comment_thread_response), no aquí.
        read_only_fields = ("id", "user", "parent", "created_at")

    def get_replies_count(self, obj):
        return obj.replies.count()


class GameListSerializer(serializers.ModelSerializer):
    games = GameSerializer(many=True, read_only=True)
    game_ids = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(),
        source="games",
        many=True,
        write_only=True,
        required=False,
    )
    user = UserSerializer(read_only=True)
    comments_count = serializers.SerializerMethodField()
    # Anotados por views.annotate_lists para evitar el N+1 en los listados; si
    # la instancia no viene anotada se calculan al vuelo.
    likes_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = GameList
        fields = (
            "id",
            "user",
            "name",
            "description",
            "cover_url",
            "is_public",
            "games",
            "game_ids",
            "comments_count",
            "likes_count",
            "is_liked",
            "created_at",
        )
        read_only_fields = ("id", "user", "created_at")

    def get_comments_count(self, obj):
        value = getattr(obj, "comments_count", None)
        return value if value is not None else obj.comments.count()

    def get_likes_count(self, obj):
        value = getattr(obj, "likes_count", None)
        return value if value is not None else obj.likes.count()

    def get_is_liked(self, obj):
        value = getattr(obj, "is_liked", None)
        if value is not None:
            return bool(value)
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class GameListCommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    replies_count = serializers.SerializerMethodField()

    class Meta:
        model = GameListComment
        fields = ("id", "game_list", "user", "content", "parent", "replies_count", "created_at")
        read_only_fields = ("id", "user", "parent", "created_at")

    def get_replies_count(self, obj):
        return obj.replies.count()


# ---------------------------------------------------------------------------
# Feed social
# ---------------------------------------------------------------------------
class PostCommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    replies_count = serializers.SerializerMethodField()

    class Meta:
        model = PostComment
        fields = ("id", "post", "user", "content", "parent", "replies_count", "created_at")
        read_only_fields = ("id", "user", "parent", "created_at")

    def get_replies_count(self, obj):
        return obj.replies.count()


class GameListCardSerializer(serializers.ModelSerializer):
    """Version ligera de una lista, para el carrusel y para el feed.

    GameListSerializer trae todos los juegos con su ficha completa, que en un
    carrusel o en un feed de veinte publicaciones seria una carga inutil: aqui
    basta con el nombre, el recuento y unas pocas portadas para el mosaico.
    """

    user = UserSerializer(read_only=True)
    games_count = serializers.SerializerMethodField()
    preview_covers = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = GameList
        fields = (
            "id",
            "user",
            "name",
            "cover_url",
            "is_public",
            "games_count",
            "preview_covers",
            "likes_count",
            "is_liked",
        )

    def get_games_count(self, obj):
        value = getattr(obj, "games_count", None)
        return value if value is not None else obj.games.count()

    def get_preview_covers(self, obj):
        # Cuatro portadas bastan para el mosaico de la tarjeta.
        return [g.cover_url for g in obj.games.all()[:4] if g.cover_url]

    def get_likes_count(self, obj):
        value = getattr(obj, "likes_count", None)
        return value if value is not None else obj.likes.count()

    def get_is_liked(self, obj):
        value = getattr(obj, "is_liked", None)
        if value is not None:
            return bool(value)
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class PostSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    related_game = GameSerializer(read_only=True)
    related_game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(),
        source="related_game",
        write_only=True,
        required=False,
        allow_null=True,
    )
    # Solo viene relleno en los posts de tipo "list", que se crean desde el
    # endpoint /api/lists/{id}/share/ y no desde este serializer.
    related_list = GameListCardSerializer(read_only=True)
    # Estos tres se sirven desde anotaciones del queryset (ver views.annotate_posts)
    # para evitar N+1 en el feed. Si la instancia no viene anotada (p. ej. tras
    # crear un post), se recurre a un cálculo directo.
    likes_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = (
            "id",
            "user",
            "content",
            "image_url",
            "related_game",
            "related_game_id",
            "related_list",
            "post_type",
            "likes_count",
            "comments_count",
            "is_liked",
            "created_at",
        )
        read_only_fields = ("id", "user", "created_at")

    def get_likes_count(self, obj):
        value = getattr(obj, "likes_count", None)
        return value if value is not None else obj.likes.count()

    def get_comments_count(self, obj):
        value = getattr(obj, "comments_count", None)
        return value if value is not None else obj.comments.count()

    def get_is_liked(self, obj):
        value = getattr(obj, "is_liked", None)
        if value is not None:
            return bool(value)
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


# ---------------------------------------------------------------------------
# Amistades
# ---------------------------------------------------------------------------
class FriendshipSerializer(serializers.ModelSerializer):
    from_user = UserSerializer(read_only=True)
    to_user = UserSerializer(read_only=True)
    to_user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source="to_user", write_only=True
    )

    class Meta:
        model = Friendship
        fields = ("id", "from_user", "to_user", "to_user_id", "status", "created_at")
        read_only_fields = ("id", "from_user", "status", "created_at")
