from urllib.parse import urlencode

from django.conf import settings
from django.shortcuts import redirect
from social_core.pipeline.partial import partial

from .views import tokens_for


@partial
def ask_steam_account_link(strategy, backend, user=None, current_partial=None, *args, **kwargs):

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
            from apps.steam.services import trigger_auto_sync

            trigger_auto_sync(user)


def set_avatar_from_google(backend, user, response, *args, **kwargs):
    if backend.name == "google-oauth2" and user is not None and not user.avatar_url:
        picture = response.get("picture")
        if picture:
            user.avatar_url = picture
            user.save(update_fields=["avatar_url"])


def issue_jwt_and_redirect(strategy, user, *args, **kwargs):
    if user is None:
        return None
    frontend = getattr(settings, "SOCIAL_AUTH_FRONTEND_URL", "http://localhost:3000")
    params = urlencode(tokens_for(user))
    return redirect(f"{frontend}/auth/social?{params}")
