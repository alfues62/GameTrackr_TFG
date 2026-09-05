"""
Tests de la sincronización con Steam.

Se mockea el cliente Steamworks (SteamClient) para no hacer llamadas reales, y se
pre-cargan juegos locales por nombre para que `_match_or_create_game` los resuelva
sin pegar a IGDB.
"""
from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from social_django.models import Partial, UserSocialAuth

from apps.core.models import Game, UserGame
from apps.steam import services as steam_services

pytestmark = pytest.mark.django_db

STEAM_ID = "76561197960287930"


@pytest.fixture(autouse=True)
def _clear_cache():
    """El progreso de sync vive en caché: aislar entre tests."""
    cache.clear()
    yield
    cache.clear()


# --- Vinculación (sync + login) ----------------------------------------------
def _link(auth_client):
    with patch("apps.steam.views.normalize_steam_input", return_value=STEAM_ID), \
         patch("apps.steam.views.SteamClient"):
        return auth_client.post("/api/steam/link/", {"steam_id_or_vanity": STEAM_ID}, format="json")


def test_link_creates_login_association(auth_client, user):
    """Vincular Steam en Ajustes también asocia el LOGIN con Steam a esta cuenta."""
    resp = _link(auth_client)
    assert resp.status_code == 200
    assert UserSocialAuth.objects.filter(provider="steam", uid=STEAM_ID, user=user).exists()


# --- Importación automática al vincular ---------------------------------------
def test_link_triggers_auto_sync(auth_client, user):
    with patch("apps.steam.views.trigger_auto_sync") as mock_sync, \
         patch("apps.steam.views.normalize_steam_input", return_value=STEAM_ID), \
         patch("apps.steam.views.SteamClient"):
        resp = auth_client.post("/api/steam/link/", {"steam_id_or_vanity": STEAM_ID}, format="json")

    assert resp.status_code == 200
    mock_sync.assert_called_once_with(user)


def test_claim_partial_triggers_auto_sync(auth_client, user):
    _make_partial(token="tok-sync")
    with patch("apps.steam.views.trigger_auto_sync") as mock_sync:
        resp = auth_client.post("/api/steam/claim-partial/", {"partial_token": "tok-sync"}, format="json")

    assert resp.status_code == 200
    mock_sync.assert_called_once_with(user)


def test_pipeline_link_triggers_auto_sync_on_new_account(user):
    """Cuenta creada (o recién asociada) vía login de Steam → importación inicial."""
    from unittest.mock import MagicMock

    from apps.core.pipeline import link_steam_account

    backend = MagicMock()
    backend.name = "steam"
    with patch("apps.steam.services.trigger_auto_sync") as mock_sync:
        link_steam_account(backend=backend, user=user, response={}, uid=STEAM_ID)

    user.refresh_from_db()
    assert user.steam_id == STEAM_ID
    mock_sync.assert_called_once_with(user)


def test_link_conflicts_if_steam_login_belongs_to_another_user(auth_client, other_user):
    UserSocialAuth.objects.create(provider="steam", uid=STEAM_ID, user=other_user)
    resp = _link(auth_client)
    assert resp.status_code == 409


def _make_partial(token="tok-1"):
    return Partial.objects.create(
        token=token, next_step=5, backend="steam",
        data={"args": [], "kwargs": {"uid": STEAM_ID}},
    )


def test_claim_partial_links_paused_steam_login(auth_client, user):
    """Primer login con Steam sin vincular → el usuario reclama el partial y
    el Steam queda asociado a SU cuenta (login + sync)."""
    _make_partial()
    resp = auth_client.post("/api/steam/claim-partial/", {"partial_token": "tok-1"}, format="json")

    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.steam_id == STEAM_ID
    assert user.is_steam_linked is True
    assert UserSocialAuth.objects.filter(provider="steam", uid=STEAM_ID, user=user).exists()
    assert not Partial.objects.filter(token="tok-1").exists()  # consumido


def test_claim_partial_with_unknown_token_is_expired(auth_client):
    resp = auth_client.post("/api/steam/claim-partial/", {"partial_token": "caducado"}, format="json")
    assert resp.status_code == 404


def test_claim_partial_conflicts_if_steam_belongs_to_another(auth_client, other_user):
    other_user.steam_id = STEAM_ID
    other_user.save(update_fields=["steam_id"])
    _make_partial(token="tok-2")

    resp = auth_client.post("/api/steam/claim-partial/", {"partial_token": "tok-2"}, format="json")
    assert resp.status_code == 409


def test_unlink_removes_login_association(auth_client, user):
    user.steam_id = STEAM_ID
    user.is_steam_linked = True
    user.save(update_fields=["steam_id", "is_steam_linked"])
    UserSocialAuth.objects.create(provider="steam", uid=STEAM_ID, user=user)

    resp = auth_client.delete("/api/steam/link/")

    assert resp.status_code == 204
    assert not UserSocialAuth.objects.filter(provider="steam", user=user).exists()


@pytest.fixture
def user_with_steam(make_user):
    user = make_user(email="steamer@gmail.com")
    user.steam_id = "76561197960287930"
    user.is_steam_linked = True
    user.save(update_fields=["steam_id", "is_steam_linked"])
    return user


def _seed_local_games():
    """Juegos locales que coinciden por nombre con los devueltos por Steam."""
    Game.objects.create(igdb_id=1001, title="Portal 2", genres=["Puzzle"], platforms=["PC"])
    Game.objects.create(igdb_id=1002, title="Stardew Valley", genres=["Sim"], platforms=["PC"])


def test_sync_creates_usergames_as_pc(user_with_steam):
    _seed_local_games()
    owned = [
        {"appid": 620, "name": "Portal 2", "playtime_forever": 600, "img_icon_url": ""},   # 10h
        {"appid": 413150, "name": "Stardew Valley", "playtime_forever": 1200, "img_icon_url": ""},  # 20h
    ]

    with patch.object(steam_services, "SteamClient") as MockClient:
        instance = MockClient.return_value
        instance.get_owned_games.return_value = owned
        instance.get_player_achievements.return_value = None  # sin logros

        summary = steam_services.sync_user_library(user_with_steam)

    assert summary == {"synced": 2, "new": 2, "updated": 0, "errors": 0}

    ugs = {ug.game.title: ug for ug in UserGame.objects.filter(user=user_with_steam)}
    assert set(ugs) == {"Portal 2", "Stardew Valley"}
    for ug in ugs.values():
        assert ug.is_from_steam is True
        assert ug.platform == "PC"
        assert ug.last_synced is not None
    assert ugs["Portal 2"].hours_played == 10.0
    assert ugs["Stardew Valley"].hours_played == 20.0


def test_sync_computes_completion_percentage(user_with_steam):
    _seed_local_games()
    owned = [
        {"appid": 620, "name": "Portal 2", "playtime_forever": 600, "img_icon_url": ""},
    ]

    with patch.object(steam_services, "SteamClient") as MockClient:
        instance = MockClient.return_value
        instance.get_owned_games.return_value = owned
        instance.get_player_achievements.return_value = 75.0  # 75% de logros

        steam_services.sync_user_library(user_with_steam)

    ug = UserGame.objects.get(user=user_with_steam, game__title="Portal 2")
    assert ug.completion_percentage == 75.0


def test_sync_publishes_progress_for_status_endpoint(user_with_steam):
    """La sync publica su progreso y el endpoint de estado lo expone."""
    _seed_local_games()
    owned = [
        {"appid": 620, "name": "Portal 2", "playtime_forever": 600, "img_icon_url": ""},
        {"appid": 413150, "name": "Stardew Valley", "playtime_forever": 1200, "img_icon_url": ""},
    ]
    with patch.object(steam_services, "SteamClient") as MockClient:
        instance = MockClient.return_value
        instance.get_owned_games.return_value = owned
        instance.get_player_achievements.return_value = None
        steam_services.sync_user_library(user_with_steam)

    api = APIClient()
    api.force_authenticate(user_with_steam)
    data = api.get("/api/steam/sync/status/").json()
    assert data["status"] == "done"
    assert data["synced"] == 2
    assert data["errors"] == 0


def test_sync_status_is_idle_without_sync(auth_client):
    assert auth_client.get("/api/steam/sync/status/").json() == {"status": "idle"}


def test_sync_is_idempotent_on_second_run(user_with_steam):
    _seed_local_games()
    owned = [{"appid": 620, "name": "Portal 2", "playtime_forever": 600, "img_icon_url": ""}]

    with patch.object(steam_services, "SteamClient") as MockClient:
        instance = MockClient.return_value
        instance.get_owned_games.return_value = owned
        instance.get_player_achievements.return_value = None

        first = steam_services.sync_user_library(user_with_steam)
        second = steam_services.sync_user_library(user_with_steam)

    assert first["new"] == 1
    assert second["new"] == 0 and second["updated"] == 1
    assert UserGame.objects.filter(user=user_with_steam).count() == 1
