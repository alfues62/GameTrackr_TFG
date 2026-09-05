"""
Pasos personalizados del pipeline de social-auth.

- `discard_stale_session`: ignora cualquier sesión de Django ya autenticada
  al empezar un login social nuevo.
- `ask_steam_account_link`: si alguien entra con un Steam sin vincular, pausa
  el pipeline y pregunta si quiere vincularlo a una cuenta existente.
- `link_steam_account`: al entrar con Steam (OpenID 2.0), guarda el steam_id.
- `set_avatar_from_google`: al entrar con Google, copia la foto de perfil.
- `issue_jwt_and_redirect`: paso final que emite tokens JWT y redirige al
  frontend con ellos en la query string, para un flujo de login headless.
"""
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import logout
from django.shortcuts import redirect
from social_core.pipeline.partial import partial

from .views import tokens_for


def discard_stale_session(strategy, user=None, *args, **kwargs):
    """Descarta cualquier usuario ya logueado por sesión de Django al arrancar
    un login social.

    Esta app es "headless": el frontend guarda el JWT y no depende de la
    sesión de Django, pero `social_django` sí abre una sesión de Django al
    terminar el pipeline (`login()`). Sin este paso, esa sesión se quedaba
    viva en el navegador y, al iniciar sesión social OTRA VEZ (incluso
    eligiendo una cuenta de Google distinta), el pipeline arrancaba con
    `user=request.user` ya puesto a la cuenta de la sesión anterior y
    terminaba asociando el login nuevo a esa cuenta vieja en vez de a la que
    correspondía por email/UID. Al forzar `user=None` aquí, cada login social
    se resuelve limpio contra la cuenta que le toca.
    """
    if user is not None:
        logout(strategy.request)
        return {'user': None}
    return None


@partial
def ask_steam_account_link(strategy, backend, user=None, current_partial=None, *args, **kwargs):
    """Primer login con un Steam sin vincular: preguntar antes de crear cuenta.

    Steam solo entrega el SteamID (Valve nunca expone el email), así que es
    imposible casarlo automáticamente con una cuenta existente. En lugar de
    crear una cuenta nueva en silencio, se PAUSA el pipeline (partial) y se
    envía al usuario a /auth/steam-link del frontend, donde elige:

    - Vincular a su cuenta: se identifica y el frontend llama a
      POST /api/steam/claim-partial/ con el token, que crea la asociación.
    - Crear cuenta nueva: el navegador reanuda el pipeline en
      /api/social/complete/steam/?partial_token=...&create_account=1
      y este paso, al ver la marca, deja continuar hacia create_user.

    Google no necesita nada de esto: su email verificado ya casa con
    associate_by_email en el paso anterior.
    """
    if backend.name != "steam" or user is not None:
        return None
    if strategy.request_data().get("create_account"):
        return None  # decisión tomada: continuar y crear la cuenta

    frontend = getattr(settings, "SOCIAL_AUTH_FRONTEND_URL", "http://localhost:3000")
    return strategy.redirect(
        f"{frontend}/auth/steam-link?{urlencode({'partial_token': current_partial.token})}"
    )


def link_steam_account(backend, user, response, *args, **kwargs):
    if backend.name == "steam" and user is not None:
        steam_id = kwargs.get("uid") or response.get("player", {}).get("steamid")
        if steam_id and user.steam_id != str(steam_id):
            user.steam_id = str(steam_id)
            user.is_steam_linked = True
            user.save(update_fields=["steam_id", "is_steam_linked"])
            # Steam recién vinculado (cuenta nueva creada con Steam, o primer
            # login tras asociar): importar su biblioteca en segundo plano.
            from apps.steam.services import trigger_auto_sync

            trigger_auto_sync(user)


def set_avatar_from_google(backend, user, response, *args, **kwargs):
    if backend.name == "google-oauth2" and user is not None and not user.avatar_url:
        picture = response.get("picture")
        if picture:
            user.avatar_url = picture
            user.save(update_fields=["avatar_url"])


def issue_jwt_and_redirect(strategy, user, *args, **kwargs):
    """Emite JWT y redirige al frontend: /auth/social?access=...&refresh=..."""
    if user is None:
        return None
    frontend = getattr(settings, "SOCIAL_AUTH_FRONTEND_URL", "http://localhost:3000")
    params = urlencode(tokens_for(user))
    return redirect(f"{frontend}/auth/social?{params}")
