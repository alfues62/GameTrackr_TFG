"""Tests del endpoint de estadísticas del dashboard (/api/stats/dashboard/).

Los cálculos operan sobre la biblioteca del usuario autenticado; no tocan APIs
externas.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.models import PlaytimeSnapshot

pytestmark = pytest.mark.django_db


def test_dashboard_requires_authentication(api):
    assert api.get("/api/stats/dashboard/").status_code == 401


def test_dashboard_empty_library_returns_zeros(auth_client):
    body = auth_client.get("/api/stats/dashboard/").json()
    assert body["total_games"] == 0
    assert body["total_hours"] == 0
    assert body["completion_index"] == 0
    assert body["games_by_status"] == {"playing": 0, "completed": 0, "backlog": 0, "abandoned": 0}
    assert body["hours_by_genre"] == []
    assert body["platform_distribution"] == []
    # La actividad mensual siempre trae 12 meses (rellenados con cero).
    assert len(body["playtime_over_time"]) == 12


def test_dashboard_aggregates_metrics(auth_client, user, make_game, make_usergame):
    rpg = make_game(igdb_id=1, title="RPG", genres=["RPG", "Aventura"], platforms=["PC"])
    shooter = make_game(igdb_id=2, title="Shooter", genres=["Shooter"], platforms=["PC"])
    make_usergame(user, rpg, status="completed", hours_played=30, completion_percentage=100, platform="PC")
    make_usergame(user, shooter, status="playing", hours_played=10, platform="PS5")

    body = auth_client.get("/api/stats/dashboard/").json()

    assert body["total_games"] == 2
    assert body["total_hours"] == 40.0
    assert body["games_by_status"]["completed"] == 1
    assert body["games_by_status"]["playing"] == 1
    # completion_index = % de juegos con completitud >= 90 → 1 de 2 = 50 %.
    assert body["completion_index"] == 50.0

    # Horas por género: cada juego suma sus horas a cada uno de sus géneros.
    genre_hours = {g["genre"]: g["hours"] for g in body["hours_by_genre"]}
    assert genre_hours["RPG"] == 30.0
    assert genre_hours["Aventura"] == 30.0
    assert genre_hours["Shooter"] == 10.0

    # Distribución por plataforma (la registrada en el UserGame).
    plat = {p["platform"]: p["count"] for p in body["platform_distribution"]}
    assert plat == {"PC": 1, "PS5": 1}

    # Top por horas: el RPG (30 h) por delante del shooter (10 h).
    assert body["top_games_by_hours"][0]["title"] == "RPG"


def test_dashboard_excludes_wishlist_from_library(auth_client, user, make_game, make_usergame):
    """La lista de deseos se contabiliza aparte y no entra en las metricas."""
    owned = make_game(igdb_id=10, title="Tengo", genres=["RPG"], platforms=["PC"])
    wanted = make_game(igdb_id=11, title="Quiero", genres=["Shooter"], platforms=["PS5"])
    make_usergame(user, owned, status="completed", hours_played=20, completion_percentage=100, platform="PC")
    make_usergame(user, wanted, status="wishlist", hours_played=0, platform="PS5")

    body = auth_client.get("/api/stats/dashboard/").json()

    assert body["total_games"] == 1
    assert body["wishlist_games"] == 1
    # 1 de 1 juego de la biblioteca completado: el deseado no diluye el indice.
    assert body["completion_index"] == 100.0
    assert [p["platform"] for p in body["platform_distribution"]] == ["PC"]
    assert [g["genre"] for g in body["hours_by_genre"]] == ["RPG"]
    assert [g["title"] for g in body["top_games_by_completion"]] == ["Tengo"]


def test_public_profile_stats_exclude_wishlist(auth_client, other_user, make_game, make_usergame):
    """El contador de juegos del perfil publico tampoco cuenta los deseados."""
    make_usergame(other_user, make_game(igdb_id=20), status="playing", hours_played=5)
    make_usergame(other_user, make_game(igdb_id=21), status="wishlist")

    body = auth_client.get(f"/api/social/users/{other_user.username}/").json()

    assert body["stats"]["total_games"] == 1


# ---------------------------------------------------------------------------
# Actividad mensual: se calcula con diferencias del historial (PlaytimeSnapshot)
# ---------------------------------------------------------------------------
def _month_hours(body):
    return {p["month"]: p["hours"] for p in body["playtime_over_time"]}


def _first_of_month(months_ago=0):
    """Primer instante de un mes pasado. Relativo a hoy para no caducar."""
    now = timezone.localtime()
    year, month = now.year, now.month - months_ago
    while month < 1:
        month += 12
        year -= 1
    return now.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)


def _key(dt):
    return dt.strftime("%Y-%m")


def test_baseline_snapshot_is_not_monthly_activity(auth_client, user, make_game, make_usergame):
    """Importar un juego con horas acumuladas no cuenta como jugado este mes."""
    make_usergame(user, make_game(igdb_id=30), hours_played=349)

    body = auth_client.get("/api/stats/dashboard/").json()

    assert body["total_hours"] == 349.0
    # La linea base solo fija el punto de partida: la grafica sigue a cero.
    assert sum(p["hours"] for p in body["playtime_over_time"]) == 0


def test_monthly_activity_counts_only_the_difference(auth_client, user, make_game, make_usergame):
    """Al subir el contador, el mes recibe la diferencia y no el acumulado."""
    ug = make_usergame(user, make_game(igdb_id=31), hours_played=100)
    ug.hours_played = 112.5
    ug.save()

    body = auth_client.get("/api/stats/dashboard/").json()

    this_month = timezone.localtime().strftime("%Y-%m")
    assert _month_hours(body)[this_month] == 12.5


def test_monthly_activity_attributes_hours_to_their_own_month(auth_client, user, make_game, make_usergame):
    """Una diferencia dentro de un solo mes va entera a ese mes, no al actual."""
    ug = make_usergame(user, make_game(igdb_id=32), hours_played=10)
    start = _first_of_month(months_ago=2) + timedelta(days=5)
    end = start + timedelta(days=10)  # sigue dentro del mismo mes
    PlaytimeSnapshot.objects.filter(user_game=ug).update(recorded_at=start)
    PlaytimeSnapshot.objects.create(user_game=ug, hours=30, recorded_at=end)

    months = _month_hours(auth_client.get("/api/stats/dashboard/").json())

    assert months[_key(start)] == 20.0
    assert months[_key(timezone.localtime())] == 0


def test_hours_are_split_between_months_when_the_gap_crosses_one(auth_client, user, make_game, make_usergame):
    """Si el intervalo cruza un cambio de mes, la diferencia se reparte a prorrata."""
    ug = make_usergame(user, make_game(igdb_id=35), hours_played=0)
    boundary = _first_of_month(months_ago=1)
    start = boundary - timedelta(days=10)  # 10 dias en el mes anterior
    end = boundary + timedelta(days=10)  # y 10 en el siguiente: mitad y mitad
    PlaytimeSnapshot.objects.filter(user_game=ug).update(recorded_at=start)
    PlaytimeSnapshot.objects.create(user_game=ug, hours=20, recorded_at=end)

    months = _month_hours(auth_client.get("/api/stats/dashboard/").json())

    assert months[_key(start)] == 10.0
    assert months[_key(end)] == 10.0


def test_split_conserves_the_total_hours_played(auth_client, user, make_game, make_usergame):
    """El reparto no inventa ni pierde horas: la suma es la diferencia real."""
    ug = make_usergame(user, make_game(igdb_id=36), hours_played=0)
    start = _first_of_month(months_ago=3) + timedelta(days=17, hours=7)
    end = _first_of_month(months_ago=1) + timedelta(days=3, hours=11)
    PlaytimeSnapshot.objects.filter(user_game=ug).update(recorded_at=start)
    PlaytimeSnapshot.objects.create(user_game=ug, hours=90, recorded_at=end)

    body = auth_client.get("/api/stats/dashboard/").json()

    # El intervalo abarca tres meses y los tres reciben parte de las 90 h.
    reparto = [p["hours"] for p in body["playtime_over_time"] if p["hours"] > 0]
    assert len(reparto) == 3
    assert sum(reparto) == pytest.approx(90, abs=0.3)


def test_saving_other_fields_does_not_add_snapshots(user, make_game, make_usergame):
    """Editar estado o nota no toca el historial: solo lo hacen las horas."""
    ug = make_usergame(user, make_game(igdb_id=33), hours_played=40)
    ug.status = "completed"
    ug.user_rating = 9
    ug.save()

    assert PlaytimeSnapshot.objects.filter(user_game=ug).count() == 1


def test_downward_correction_does_not_produce_negative_months(auth_client, user, make_game, make_usergame):
    """Bajar el contador a mano no resta horas de la grafica."""
    ug = make_usergame(user, make_game(igdb_id=34), hours_played=50)
    ug.hours_played = 20
    ug.save()

    body = auth_client.get("/api/stats/dashboard/").json()

    assert all(p["hours"] == 0 for p in body["playtime_over_time"])


def test_genres_without_hours_are_left_out_of_the_chart(auth_client, user, make_game, make_usergame):
    """El donut mide horas: un género que no suma ninguna no ocupa hueco."""
    jugado = make_game(igdb_id=50, title="Jugado", genres=["RPG"])
    sin_jugar = make_game(igdb_id=51, title="Sin jugar", genres=["Arcade"])
    make_usergame(user, jugado, hours_played=30)
    make_usergame(user, sin_jugar, hours_played=0)

    body = auth_client.get("/api/stats/dashboard/").json()

    assert [g["genre"] for g in body["hours_by_genre"]] == ["RPG"]


def test_genre_count_reflects_all_genres_not_the_truncated_list(auth_client, user, make_game, make_usergame):
    """El numero del centro del donut cuenta todos los generos, no las porciones."""
    for i in range(11):
        make_usergame(user, make_game(igdb_id=60 + i, genres=[f"Genero {i}"]), hours_played=100 - i)

    body = auth_client.get("/api/stats/dashboard/").json()

    assert body["genre_count"] == 11
    # Ocho porciones con nombre mas la de "Otros".
    assert len(body["hours_by_genre"]) == 9


def test_genres_beyond_the_top_are_grouped_into_otros(auth_client, user, make_game, make_usergame):
    """El resto se agrupa para que las porciones sumen el total de horas."""
    for i in range(11):
        make_usergame(user, make_game(igdb_id=80 + i, genres=[f"Genero {i}"]), hours_played=100 - i)

    body = auth_client.get("/api/stats/dashboard/").json()
    porciones = {g["genre"]: g["hours"] for g in body["hours_by_genre"]}

    # Los tres que quedan fuera del top 8: 92 + 91 + 90.
    assert porciones["Otros"] == pytest.approx(273.0)
    assert sum(porciones.values()) == pytest.approx(sum(100 - i for i in range(11)))
    assert list(porciones)[-1] == "Otros"  # siempre la ultima


def test_no_otros_slice_when_everything_fits(auth_client, user, make_game, make_usergame):
    make_usergame(user, make_game(igdb_id=95, genres=["RPG", "Aventura"]), hours_played=10)

    body = auth_client.get("/api/stats/dashboard/").json()

    assert body["genre_count"] == 2
    assert [g["genre"] for g in body["hours_by_genre"]] == ["RPG", "Aventura"]


def test_genres_below_one_percent_fall_into_otros(auth_client, user, make_game, make_usergame):
    """Un genero testimonial no merece porcion propia aunque quepa en el top."""
    make_usergame(user, make_game(igdb_id=110, genres=["Grande"]), hours_played=1000)
    make_usergame(user, make_game(igdb_id=111, genres=["Testimonial"]), hours_played=5)

    body = auth_client.get("/api/stats/dashboard/").json()
    porciones = {g["genre"]: g["hours"] for g in body["hours_by_genre"]}

    # Sigue contando como genero de la biblioteca, pero no se dibuja aparte.
    assert body["genre_count"] == 2
    assert list(porciones) == ["Grande", "Otros"]
    assert porciones["Otros"] == pytest.approx(5.0)


def test_otros_absorbs_both_the_tail_and_the_tiny_genres(auth_client, user, make_game, make_usergame):
    """Los dos motivos de agrupacion se suman en la misma porcion."""
    make_usergame(user, make_game(igdb_id=120, genres=["Grande"]), hours_played=1000)
    for i in range(9):  # nueve generos de 3 h: ni llegan al 1 % ni caben en el top
        make_usergame(user, make_game(igdb_id=130 + i, genres=[f"Menor {i}"]), hours_played=3)

    body = auth_client.get("/api/stats/dashboard/").json()
    porciones = {g["genre"]: g["hours"] for g in body["hours_by_genre"]}

    assert body["genre_count"] == 10
    assert list(porciones) == ["Grande", "Otros"]
    assert porciones["Otros"] == pytest.approx(27.0)
    assert sum(porciones.values()) == pytest.approx(1027.0)


# ---------------------------------------------------------------------------
# Vocabulario de plataformas
# ---------------------------------------------------------------------------
def test_platform_names_are_unified_before_counting(auth_client, user, make_game, make_usergame):
    """Cada fuente escribe la misma plataforma a su manera; el chart las junta."""
    make_usergame(user, make_game(igdb_id=200, platforms=["PC"]), platform="PC", hours_played=1)
    # Sin plataforma propia se hereda la de IGDB, que la nombra largo.
    make_usergame(user, make_game(igdb_id=201, platforms=["PC (Microsoft Windows)"]), hours_played=1)
    make_usergame(user, make_game(igdb_id=202, platforms=["PS4"]), platform="PlayStation 4", hours_played=1)

    body = auth_client.get("/api/stats/dashboard/").json()
    plataformas = {p["platform"]: p["count"] for p in body["platform_distribution"]}

    assert plataformas == {"PC": 2, "PS4": 1}


def test_canonical_platform_leaves_unknown_names_alone():
    from apps.core.platforms import canonical_platform

    assert canonical_platform("PC (Microsoft Windows)") == "PC"
    assert canonical_platform("playstation 3") == "PS3"
    assert canonical_platform("Amstrad CPC") == "Amstrad CPC"
    assert canonical_platform("") == ""


def test_platform_comes_from_the_sony_product_code():
    """El title_id dice la consola; la ficha de IGDB solo dice donde existe."""
    from apps.core.platforms import platform_from_psn_title_id

    assert platform_from_psn_title_id("CUSA15918_00") == "PS4"
    assert platform_from_psn_title_id("PPSA01234_00") == "PS5"
    assert platform_from_psn_title_id("BLES00123") == "PS3"
    assert platform_from_psn_title_id("cusa00001") == "PS4"  # sin distinguir mayusculas
    assert platform_from_psn_title_id("ZZZZ00000") is None  # desconocido: generico
    assert platform_from_psn_title_id("") is None
