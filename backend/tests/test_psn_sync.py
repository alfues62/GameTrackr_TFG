"""
Tests de la sincronización con PSN (psnawp).

Se mockea el cliente PSNClient: no requiere la librería psnawp ni red.
"""
from unittest.mock import patch

import pytest

from apps.core.models import Game, UserGame
from apps.psn import services as psn_services

pytestmark = pytest.mark.django_db


@pytest.fixture
def user_with_psn(make_user):
    user = make_user(email="psner@gmail.com")
    user.psn_online_id = "alex_psn"
    user.psn_npsso = "x" * 64
    user.is_psn_linked = True
    user.save(update_fields=["psn_online_id", "psn_npsso", "is_psn_linked"])
    return user


def _seed_local_games():
    Game.objects.create(igdb_id=3001, title="God of War Ragnarök", genres=["Aventura"], platforms=["PS5"])
    Game.objects.create(igdb_id=3002, title="Bloodborne", genres=["RPG"], platforms=["PS4"])


def test_sync_creates_usergames_with_ps_platform_and_hours(user_with_psn):
    """Los juegos de PSN llegan con su plataforma (PS4/PS5) y horas reales."""
    _seed_local_games()
    titles = [
        {"name": "God of War Ragnarök", "platform": "PS5", "hours": 35.5},
        {"name": "Bloodborne", "platform": "PS4", "hours": 80.0},
    ]

    with patch.object(psn_services, "PSNClient") as MockClient:
        instance = MockClient.return_value
        instance.get_played_titles.return_value = titles
        instance.get_trophy_progress.return_value = {}
        summary = psn_services.sync_user_library(user_with_psn)

    assert summary == {"synced": 2, "new": 2, "updated": 0, "errors": 0}

    ugs = {ug.game.title: ug for ug in UserGame.objects.filter(user=user_with_psn)}
    assert ugs["God of War Ragnarök"].platform == "PS5"
    assert ugs["God of War Ragnarök"].hours_played == 35.5
    assert ugs["Bloodborne"].platform == "PS4"
    assert ugs["Bloodborne"].hours_played == 80.0
    for ug in ugs.values():
        assert ug.sync_source == UserGame.SyncSource.PSN
        assert ug.last_synced is not None


def test_sync_sets_completion_from_trophies(user_with_psn):
    _seed_local_games()
    titles = [{"name": "Bloodborne", "platform": "PS4", "hours": 80.0}]

    with patch.object(psn_services, "PSNClient") as MockClient:
        instance = MockClient.return_value
        instance.get_played_titles.return_value = titles
        instance.get_trophy_progress.return_value = {"bloodborne": 62.0}
        psn_services.sync_user_library(user_with_psn)

    ug = UserGame.objects.get(user=user_with_psn, game__title="Bloodborne")
    assert ug.completion_percentage == 62.0


def test_sync_is_idempotent(user_with_psn):
    _seed_local_games()
    titles = [{"name": "Bloodborne", "platform": "PS4", "hours": 80.0}]

    with patch.object(psn_services, "PSNClient") as MockClient:
        instance = MockClient.return_value
        instance.get_played_titles.return_value = titles
        instance.get_trophy_progress.return_value = {}
        first = psn_services.sync_user_library(user_with_psn)
        second = psn_services.sync_user_library(user_with_psn)

    assert first["new"] == 1
    assert second == {"synced": 1, "new": 0, "updated": 1, "errors": 0}
    assert UserGame.objects.filter(user=user_with_psn).count() == 1


def test_link_endpoint_validates_npsso(auth_client):
    """Un NPSSO inválido devuelve 400 con mensaje claro (cliente mockeado)."""
    from apps.psn.psn_client import PSNAuthError

    with patch("apps.psn.views.PSNClient") as MockClient:
        MockClient.return_value.get_profile.side_effect = PSNAuthError("caducado")
        resp = auth_client.post("/api/psn/link/", {"npsso": "token-malo"}, format="json")

    assert resp.status_code == 400


def test_sync_endpoint_requires_linked_account(auth_client):
    resp = auth_client.post("/api/psn/sync/", {}, format="json")
    assert resp.status_code == 400
