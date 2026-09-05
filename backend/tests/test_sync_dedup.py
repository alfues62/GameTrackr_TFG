"""Tests del arreglo de duplicados en las sincronizaciones.

Cubren las tres piezas: desempate al emparejar por titulo, identidad estable
por identificador de plataforma, y el comando que limpia lo ya duplicado.
"""
from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.core.models import Game, PlaytimeSnapshot, UserGame
from apps.core.sync import upsert_synced_game
from apps.igdb.services import _pick_canonical

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Desempate al emparejar por titulo
# ---------------------------------------------------------------------------
def test_canonical_prefers_the_main_game(make_game):
    """Ports y forks comparten titulo con el original: gana el original."""
    fork = make_game(igdb_id=37034, title="Skyrim", category=Game.Category.FORK)
    principal = make_game(igdb_id=472, title="Skyrim", category=Game.Category.MAIN_GAME)
    make_game(igdb_id=90000, title="Skyrim", category=Game.Category.PORT)

    assert _pick_canonical("Skyrim") == principal
    assert _pick_canonical("Skyrim") != fork


def test_canonical_breaks_ties_by_lowest_igdb_id(make_game):
    """Sin juego principal, la ficha mas antigua; y siempre la misma."""
    make_game(igdb_id=555, title="Repe", category=Game.Category.PORT)
    primera = make_game(igdb_id=111, title="Repe", category=Game.Category.FORK)

    assert _pick_canonical("Repe") == primera
    assert _pick_canonical("Repe") == primera  # determinista entre llamadas


# ---------------------------------------------------------------------------
# Identidad estable por identificador de plataforma
# ---------------------------------------------------------------------------
def test_same_app_id_updates_instead_of_duplicating(user, make_game):
    """El caso que producia los duplicados: cambia la ficha, no la entrada."""
    primera = make_game(igdb_id=1942, title="The Witcher 3")
    edicion = make_game(igdb_id=119402, title="The Witcher 3 - Complete Edition")

    upsert_synced_game(user, primera, UserGame.SyncSource.STEAM, "292030", {"hours_played": 10})
    upsert_synced_game(user, edicion, UserGame.SyncSource.STEAM, "292030", {"hours_played": 31})

    entradas = UserGame.objects.filter(user=user)
    assert entradas.count() == 1
    assert entradas.first().game == edicion
    assert entradas.first().hours_played == 31


def test_changing_match_absorbs_a_previous_duplicate(user, make_game):
    """Si ya existia una fila para la ficha nueva, se funde en vez de chocar."""
    vieja = make_game(igdb_id=1942, title="The Witcher 3")
    nueva = make_game(igdb_id=119402, title="The Witcher 3 - Complete Edition")
    # Duplicado heredado: misma partida en dos filas, una sin identificador.
    huerfana = UserGame.objects.create(user=user, game=nueva, hours_played=31)
    PlaytimeSnapshot.objects.create(user_game=huerfana, hours=31)
    upsert_synced_game(user, vieja, UserGame.SyncSource.STEAM, "292030", {"hours_played": 31})

    upsert_synced_game(user, nueva, UserGame.SyncSource.STEAM, "292030", {"hours_played": 35})

    entradas = UserGame.objects.filter(user=user)
    assert entradas.count() == 1
    superviviente = entradas.first()
    assert superviviente.game == nueva
    # El historial de horas de la fila absorbida no se pierde.
    assert PlaytimeSnapshot.objects.filter(user_game=superviviente).count() >= 2


def test_an_existing_entry_without_app_id_is_adopted(user, make_game):
    """La primera pasada con identificador no duplica lo ya importado."""
    juego = make_game(igdb_id=400)
    previa = UserGame.objects.create(user=user, game=juego, hours_played=5, status="playing")

    _, created = upsert_synced_game(
        user, juego, UserGame.SyncSource.STEAM, "999", {"hours_played": 8}
    )

    assert created is False
    assert UserGame.objects.filter(user=user).count() == 1
    previa.refresh_from_db()
    assert previa.sync_app_id == "999"
    assert previa.status == "playing"  # no se pisa lo que el usuario habia puesto


def test_without_app_id_identity_is_still_the_game(user, make_game):
    """PSN no da identificador: debe seguir funcionando como antes."""
    juego = make_game(igdb_id=401)

    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, None, {"hours_played": 3})
    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, None, {"hours_played": 4})

    assert UserGame.objects.filter(user=user).count() == 1


def test_two_different_apps_are_two_entries(user, make_game):
    """Skyrim y su Special Edition son aplicaciones distintas: no se funden."""
    base = make_game(igdb_id=472, title="Skyrim")
    especial = make_game(igdb_id=19457, title="Skyrim Special Edition")

    upsert_synced_game(user, base, UserGame.SyncSource.STEAM, "72850", {"hours_played": 349})
    upsert_synced_game(user, especial, UserGame.SyncSource.STEAM, "489830", {"hours_played": 193})

    assert UserGame.objects.filter(user=user).count() == 2


# ---------------------------------------------------------------------------
# Comando de limpieza
# ---------------------------------------------------------------------------
def _run(**kwargs):
    out = StringIO()
    call_command("prune_sync_duplicates", stdout=out, **kwargs)
    return out.getvalue()


def _synced(user, game, cuando, horas=10):
    return UserGame.objects.create(
        user=user,
        game=game,
        hours_played=horas,
        sync_source=UserGame.SyncSource.STEAM,
        last_synced=cuando,
    )


def test_prune_only_lists_without_apply(user, make_game):
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=500, title="Vampire Survivors"), ahora, horas=10)
    _synced(user, make_game(igdb_id=501, title="Vampire Survivors+"), ahora - timedelta(days=30), horas=10)

    salida = _run()

    assert "duplicada" in salida
    assert UserGame.objects.filter(user=user).count() == 2  # no ha borrado nada


def test_prune_removes_the_duplicate_with_apply(user, make_game):
    """La atrasada con las mismas horas que una al dia es la misma partida."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=502, title="The Witcher 3: Wild Hunt - Complete Edition"), ahora, horas=31.37)
    _synced(user, make_game(igdb_id=503, title="The Witcher 3: Wild Hunt"), ahora - timedelta(days=30), horas=31.37)

    _run(apply=True)

    titulos = [ug.game.title for ug in UserGame.objects.filter(user=user)]
    assert titulos == ["The Witcher 3: Wild Hunt - Complete Edition"]


def test_prune_keeps_a_stale_entry_whose_hours_coincide_by_chance(user, make_game):
    """Mismas horas pero titulos ajenos: casualidad, no duplicado."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=540, title="Dusk"), ahora, horas=1.65)
    _synced(user, make_game(igdb_id=541, title="Jake Hunter: Ghost of the Dusk"), ahora - timedelta(days=30), horas=1.65)

    _run(apply=True)

    assert UserGame.objects.filter(user=user, game__igdb_id=541).exists()


def test_prune_pairs_edition_suffixes(user, make_game):
    """'Dead Cells+' y 'Dead Cells' con las mismas horas si son la misma."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=550, title="Dead Cells"), ahora, horas=20.07)
    _synced(user, make_game(igdb_id=551, title="Dead Cells+"), ahora - timedelta(days=30), horas=20.07)

    _run(apply=True)

    assert [ug.game.title for ug in UserGame.objects.filter(user=user)] == ["Dead Cells"]


def test_prune_keeps_a_stale_entry_without_a_twin(user, make_game):
    """Un juego que la sincronizacion dejo de emparejar no es un duplicado."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=520, title="Vigente"), ahora, horas=10)
    _synced(user, make_game(igdb_id=521, title="Sin pareja"), ahora - timedelta(days=30), horas=1.65)

    salida = _run(apply=True)

    assert "se conserva" in salida
    assert UserGame.objects.filter(user=user, game__igdb_id=521).exists()


def test_prune_does_not_pair_entries_by_zero_hours(user, make_game):
    """Media biblioteca esta a cero horas: eso no las hace duplicadas."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=530, title="Vigente"), ahora, horas=0)
    _synced(user, make_game(igdb_id=531, title="Atrasada"), ahora - timedelta(days=30), horas=0)

    _run(apply=True)

    assert UserGame.objects.filter(user=user).count() == 2


def test_prune_ignores_manual_entries(user, make_game):
    """Un juego añadido a mano no tiene origen: nunca se considera obsoleto."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=504), ahora)
    UserGame.objects.create(user=user, game=make_game(igdb_id=505, title="A mano"))

    _run(apply=True)

    assert UserGame.objects.filter(user=user, sync_source="").count() == 1


def test_prune_keeps_entries_from_the_same_run(user, make_game):
    """Una pasada tarda minutos: eso no convierte en obsoleto a nadie."""
    ahora = timezone.now()
    _synced(user, make_game(igdb_id=506), ahora)
    _synced(user, make_game(igdb_id=507), ahora - timedelta(minutes=20))

    _run(apply=True)

    assert UserGame.objects.filter(user=user).count() == 2


# ---------------------------------------------------------------------------
# Un juego en dos plataformas: manda la primera que lo importo
# ---------------------------------------------------------------------------
def test_another_platform_does_not_overwrite_an_existing_entry(user, make_game):
    """El fallo real: PSN machacaba las horas de Steam y flipaba el origen."""
    juego = make_game(igdb_id=700, title="Dark Souls III")
    upsert_synced_game(user, juego, UserGame.SyncSource.STEAM, "374320", {"hours_played": 2.2})

    entrada, created = upsert_synced_game(
        user, juego, UserGame.SyncSource.PSN, "CUSA03365", {"hours_played": 190.7, "platform": "PS4"}
    )

    assert created is False
    entrada.refresh_from_db()
    assert entrada.hours_played == 2.2  # las horas de Steam siguen intactas
    assert entrada.sync_source == UserGame.SyncSource.STEAM
    assert UserGame.objects.filter(user=user).count() == 1


def test_the_owning_platform_can_still_update_its_own_entry(user, make_game):
    juego = make_game(igdb_id=701)
    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA1", {"hours_played": 10})

    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA1", {"hours_played": 14})

    assert UserGame.objects.get(user=user, game=juego).hours_played == 14


def test_a_manual_entry_is_still_adopted_by_a_sync(user, make_game):
    """Sin origen no hay conflicto: el juego lo anadio el propio usuario."""
    juego = make_game(igdb_id=702)
    UserGame.objects.create(user=user, game=juego, status="backlog")

    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA2", {"hours_played": 5})

    entrada = UserGame.objects.get(user=user, game=juego)
    assert entrada.sync_source == UserGame.SyncSource.PSN
    assert entrada.hours_played == 5


def test_the_rejected_platform_leaves_no_extra_snapshot(user, make_game):
    """Lo que emponzonaba la grafica: el rebote se anotaba como horas jugadas."""
    juego = make_game(igdb_id=703)
    upsert_synced_game(user, juego, UserGame.SyncSource.STEAM, "111", {"hours_played": 2})
    antes = PlaytimeSnapshot.objects.filter(user_game__user=user).count()

    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA3", {"hours_played": 200})

    assert PlaytimeSnapshot.objects.filter(user_game__user=user).count() == antes


# ---------------------------------------------------------------------------
# Cruce de nombres entre los dos endpoints de PSN
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "jugado,trofeo",
    [
        ("DARK SOULS\u2122 III", "Dark Souls\u2122 III"),
        ("Call of Duty: Black Ops III", "Call of Duty\u00ae: Black Ops III"),
        ("Middle-earth: Shadow of War", "Middle-earth\u2122: Shadow of War\u2122"),
        ("Minecraft: PlayStation 4 Edition", "Minecraft: PlayStation\u00ae4 Edition (2)"),
        ("inFAMOUS\u2122 Second Son", "inFAMOUS Second Son"),
    ],
)
def test_trophy_key_bridges_sony_naming(jugado, trofeo):
    """Los simbolos de marca y los sufijos caen en sitios distintos en cada API."""
    from apps.psn.psn_client import trophy_key

    assert trophy_key(jugado) == trophy_key(trofeo)


def test_trophy_key_still_separates_different_games():
    from apps.psn.psn_client import trophy_key

    assert trophy_key("Dark Souls II") != trophy_key("Dark Souls III")
    assert trophy_key("") == ""


def test_two_editions_of_the_same_platform_do_not_fight(user, make_game):
    """PS4 y PS5 del mismo juego caen en una ficha unica de IGDB: manda la primera.

    Era el fallo que inyectaba horas falsas en cada pasada, porque las dos
    ediciones se sobrescribian una a otra dentro de la misma sincronizacion.
    """
    juego = make_game(igdb_id=800, title="God of War")
    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA-PS4", {"hours_played": 19.0})

    entrada, created = upsert_synced_game(
        user, juego, UserGame.SyncSource.PSN, "PPSA-PS5", {"hours_played": 0.1}
    )

    assert created is False
    entrada.refresh_from_db()
    assert entrada.hours_played == 19.0
    assert entrada.sync_app_id == "CUSA-PS4"
    assert UserGame.objects.filter(user=user).count() == 1


def test_two_editions_leave_no_extra_snapshot(user, make_game):
    juego = make_game(igdb_id=801)
    upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA-PS4", {"hours_played": 19.0})
    antes = PlaytimeSnapshot.objects.filter(user_game__user=user).count()

    # Dos pasadas completas: ninguna debe anotar nada.
    for _ in range(2):
        upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "PPSA-PS5", {"hours_played": 0.1})
        upsert_synced_game(user, juego, UserGame.SyncSource.PSN, "CUSA-PS4", {"hours_played": 19.0})

    assert PlaytimeSnapshot.objects.filter(user_game__user=user).count() == antes


def test_an_entry_of_the_same_source_without_app_id_is_still_adopted(user, make_game):
    """Las importadas antes de guardarse el identificador se sellan, no se duplican."""
    juego = make_game(igdb_id=802)
    UserGame.objects.create(
        user=user, game=juego, hours_played=3, sync_source=UserGame.SyncSource.STEAM
    )

    _, created = upsert_synced_game(user, juego, UserGame.SyncSource.STEAM, "555", {"hours_played": 8})

    assert created is False
    entrada = UserGame.objects.get(user=user, game=juego)
    assert entrada.sync_app_id == "555"
    assert entrada.hours_played == 8
