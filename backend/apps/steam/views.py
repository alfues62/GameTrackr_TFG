from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from social_django.models import Partial, UserSocialAuth

from django.core.cache import cache

from .services import (
    normalize_steam_input,
    sync_progress_key,
    sync_user_library,
    trigger_auto_sync,
)
from .steam_client import SteamClient, SteamError, SteamNotConfigured

User = get_user_model()


class SteamLinkView(APIView):
    """Vincula la cuenta de Steam del usuario (acepta Steam ID, vanity o URL)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw = (request.data.get("steam_id_or_vanity") or "").strip()
        if not raw:
            return Response({"detail": "Indica tu Steam ID o la URL de tu perfil."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            steam_id = normalize_steam_input(raw, SteamClient())
        except SteamNotConfigured:
            return Response({"detail": "Steam no está configurado en el servidor."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except SteamError:
            return Response({"detail": "No se pudo contactar con Steam."}, status=status.HTTP_502_BAD_GATEWAY)

        if not steam_id:
            return Response({"detail": "No se encontró ese perfil de Steam."}, status=status.HTTP_404_NOT_FOUND)

        if User.objects.filter(steam_id=steam_id).exclude(pk=request.user.pk).exists():
            return Response({"detail": "Ese Steam ID ya está vinculado a otra cuenta."}, status=status.HTTP_409_CONFLICT)

        # Asociación de LOGIN: Steam no expone el email, así que la única forma
        # de que «Entrar con Steam» lleve a ESTA cuenta es registrar aquí la
        # asociación social (uid = SteamID de 17 dígitos).
        social = UserSocialAuth.objects.filter(provider="steam", uid=steam_id).first()
        if social is not None and social.user_id != request.user.pk:
            return Response(
                {"detail": "Esa cuenta de Steam ya se usa para iniciar sesión en otro usuario."},
                status=status.HTTP_409_CONFLICT,
            )
        if social is None:
            UserSocialAuth.objects.create(provider="steam", uid=steam_id, user=request.user)

        request.user.steam_id = steam_id
        request.user.is_steam_linked = True
        request.user.save(update_fields=["steam_id", "is_steam_linked"])
        trigger_auto_sync(request.user)  # importación inicial en segundo plano
        return Response({"steam_id": steam_id, "is_steam_linked": True, "auto_sync": True})

    def delete(self, request):
        """Desvincula la cuenta de Steam del usuario (sync y login)."""
        UserSocialAuth.objects.filter(provider="steam", user=request.user).delete()
        request.user.steam_id = None
        request.user.is_steam_linked = False
        request.user.save(update_fields=["steam_id", "is_steam_linked"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SteamClaimPartialView(APIView):
    """Vincula a la cuenta autenticada un login de Steam pausado (partial).

    Cuando alguien entra con un Steam sin vincular, el pipeline se pausa y el
    frontend muestra /auth/steam-link. Si el usuario elige «vincular a mi
    cuenta», se identifica y envía aquí el partial_token: extraemos el SteamID
    del estado pausado, creamos la asociación de login y descartamos el partial.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = (request.data.get("partial_token") or "").strip()
        if not token:
            return Response({"detail": "Falta el token de vinculación."}, status=status.HTTP_400_BAD_REQUEST)

        partial = Partial.objects.filter(token=token, backend="steam").first()
        if partial is None:
            return Response(
                {"detail": "La vinculación ha caducado. Vuelve a entrar con Steam."},
                status=status.HTTP_404_NOT_FOUND,
            )

        uid = str((partial.data.get("kwargs") or {}).get("uid") or "")
        if not uid:
            partial.delete()
            return Response({"detail": "No se pudo recuperar la cuenta de Steam."}, status=status.HTTP_400_BAD_REQUEST)

        if UserSocialAuth.objects.filter(provider="steam", uid=uid).exclude(user=request.user).exists():
            return Response(
                {"detail": "Esa cuenta de Steam ya está vinculada a otro usuario."},
                status=status.HTTP_409_CONFLICT,
            )
        if User.objects.filter(steam_id=uid).exclude(pk=request.user.pk).exists():
            return Response(
                {"detail": "Ese Steam ID ya está vinculado a otra cuenta."},
                status=status.HTTP_409_CONFLICT,
            )

        UserSocialAuth.objects.get_or_create(provider="steam", uid=uid, defaults={"user": request.user})
        request.user.steam_id = uid
        request.user.is_steam_linked = True
        request.user.save(update_fields=["steam_id", "is_steam_linked"])
        partial.delete()
        trigger_auto_sync(request.user)  # importación inicial en segundo plano
        return Response({"steam_id": uid, "is_steam_linked": True, "auto_sync": True})


class SteamSyncStatusView(APIView):
    """Estado de la sincronización en curso (para la barra de progreso).

    Respuestas: {"status": "idle"} · {"status": "running", "done", "total"}
    · {"status": "done", "synced", "new", "updated", "errors"} · {"status": "error"}.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = cache.get(sync_progress_key(request.user.pk)) or {"status": "idle"}
        return Response(data)


class SteamSyncView(APIView):
    """Sincroniza la biblioteca de Steam del usuario autenticado."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.steam_id:
            return Response({"detail": "Primero vincula tu cuenta de Steam."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            summary = sync_user_library(request.user)
        except SteamNotConfigured:
            return Response({"detail": "Steam no está configurado en el servidor."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except SteamError:
            return Response(
                {"detail": "No se pudo contactar con Steam. ¿Tu perfil es público?"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(summary)
