"""Tests del comando `sync_libraries`, que lee los contadores de horas.

Las llamadas a Steam y PSN se sustituyen por dobles: aqui solo se
comprueba a quien se sincroniza y a quien no.
"""
from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.core.models import PlaytimeSnapshot, UserGame

pytestmark = pytest.mark.django_db


@pytest.fixture
def fake_sync(monkeypatch):
    """Sustituye las tres sincronizaciones y anota a quien se ha llamado."""
    from apps.core.management.commands import sync_libraries

    calls = []

    def make(name):
        def _sync(user):
            calls.append((user.username, name))
            return {"synced": 1, "new": 0, "updated": 1, "errors": 0}

        return _sync

    for name, (flag, service) in sync_libraries.SOURCES.items():
        monkeypatch.setattr(service, "sync_user_library", make(name))
    return calls


def run(**kwargs):
    out = StringIO()
    call_command("sync_libraries", stdout=out, stderr=StringIO(), **kwargs)
    return out.getvalue()


def test_only_linked_users_are_synced(user, other_user, fake_sync):
    user.is_steam_linked = True
    user.save(update_fields=["is_steam_linked"])

    run()

    assert fake_sync == [(user.username, "steam")]


def test_every_linked_platform_of_a_user_is_synced(user, fake_sync):
    user.is_steam_linked = user.is_psn_linked = True
    user.save(update_fields=["is_steam_linked", "is_psn_linked"])

    run()

    assert sorted(fake_sync) == [(user.username, "psn"), (user.username, "steam")]


def test_source_option_limits_the_platform(user, fake_sync):
    user.is_steam_linked = user.is_psn_linked = True
    user.save(update_fields=["is_steam_linked", "is_psn_linked"])

    run(source=["steam"])

    assert fake_sync == [(user.username, "steam")]


def test_min_interval_skips_users_read_recently(user, make_game, make_usergame, fake_sync):
    """Si ya se leyo hace poco no se repite: protege de reinicios en bucle."""
    user.is_steam_linked = True
    user.save(update_fields=["is_steam_linked"])
    make_usergame(user, make_game(igdb_id=40), last_synced=timezone.now() - timedelta(minutes=10))

    run(min_interval=1)

    assert fake_sync == []


def test_min_interval_does_not_skip_a_stale_user(user, make_game, make_usergame, fake_sync):
    user.is_steam_linked = True
    user.save(update_fields=["is_steam_linked"])
    make_usergame(user, make_game(igdb_id=41), last_synced=timezone.now() - timedelta(hours=5))

    run(min_interval=1)

    assert fake_sync == [(user.username, "steam")]


def test_a_failing_platform_does_not_stop_the_rest(user, other_user, monkeypatch, fake_sync):
    """Un usuario con credenciales caducadas no puede tumbar la tarea entera."""
    from apps.steam import services as steam_services

    for u in (user, other_user):
        u.is_steam_linked = True
        u.save(update_fields=["is_steam_linked"])

    def explode(u):
        if u.pk == user.pk:
            raise RuntimeError("token caducado")
        fake_sync.append((u.username, "steam"))
        return {"synced": 1, "new": 0, "updated": 1, "errors": 0}

    monkeypatch.setattr(steam_services, "sync_user_library", explode)

    run()

    assert fake_sync == [(other_user.username, "steam")]


def test_dry_run_calls_nothing(user, fake_sync):
    user.is_steam_linked = True
    user.save(update_fields=["is_steam_linked"])

    salida = run(dry_run=True)

    assert fake_sync == []
    assert "se sincronizaria" in salida


def test_sync_records_a_snapshot_so_the_chart_advances(user, make_game, make_usergame, monkeypatch):
    """El objetivo del comando: que cada pasada deje una lectura nueva."""
    from apps.steam import services as steam_services

    user.is_steam_linked = True
    user.save(update_fields=["is_steam_linked"])
    game = make_game(igdb_id=42)
    ug = make_usergame(user, game, hours_played=10)

    def sync_con_horas(u):
        UserGame.objects.filter(pk=ug.pk).first()
        entry = UserGame.objects.get(pk=ug.pk)
        entry.hours_played = 13
        entry.save()
        return {"synced": 1, "new": 0, "updated": 1, "errors": 0}

    monkeypatch.setattr(steam_services, "sync_user_library", sync_con_horas)

    run()

    lecturas = list(
        PlaytimeSnapshot.objects.filter(user_game=ug).order_by("recorded_at").values_list("hours", flat=True)
    )
    assert lecturas == [10, 13]
