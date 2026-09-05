"""
Tests del cliente IGDB.

Se mockea el límite HTTP real (`IGDBClient._request`) y el token, de modo que no se
hacen llamadas de red. Se verifica:
- que `search_games` devuelve los resultados parseados;
- que `services.cache_game(s)` crea/actualiza filas Game locales (caché en BD);
- que respuestas idénticas se sirven desde caché (no se repite la llamada HTTP).
"""
from unittest.mock import MagicMock, patch

import pytest
from django.core.cache import cache
from django.core.management import call_command

from apps.core.models import Game
from apps.igdb import services as igdb_services
from apps.igdb.client import IGDBClient

pytestmark = pytest.mark.django_db


# Payload representativo de la API de IGDB (Apicalypse → JSON).
SAMPLE_IGDB = [
    {
        "id": 1020,
        "name": "Grand Theft Auto V",
        "cover": {"url": "//images.igdb.com/igdb/image/upload/t_thumb/co1.jpg"},
        "summary": "Mundo abierto.",
        "genres": [{"name": "Acción"}, {"name": "Aventura"}],
        "platforms": [{"name": "PC"}, {"name": "PS5"}],
        "first_release_date": 1378857600,
        "rating": 92.5,
        "game_type": 0,
    }
]


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def igdb_creds(settings):
    settings.IGDB_CLIENT_ID = "cid"
    settings.IGDB_CLIENT_SECRET = "secret"


def test_search_games_returns_results(igdb_creds):
    client = IGDBClient()
    with patch.object(IGDBClient, "_get_token", return_value="tok"), \
         patch.object(IGDBClient, "_request", return_value=SAMPLE_IGDB) as mock_req:
        results = client.search_games("GTA")

    assert results == SAMPLE_IGDB
    mock_req.assert_called_once()
    # El cuerpo Apicalypse lleva la búsqueda escapada.
    body = mock_req.call_args.args[1]
    assert 'search "GTA"' in body


def test_cache_game_persists_to_db(igdb_creds):
    game = igdb_services.cache_game(SAMPLE_IGDB[0])
    assert isinstance(game, Game)
    assert Game.objects.filter(igdb_id=1020).count() == 1
    assert game.title == "Grand Theft Auto V"
    assert game.genres == ["Acción", "Aventura"]
    assert game.platforms == ["PC", "PS5"]
    # La URL de portada se normaliza a https y tamaño mayor.
    assert game.cover_url.startswith("https://")
    assert game.category == Game.Category.MAIN_GAME


def test_cache_game_persists_category_dlc_and_bundle(igdb_creds):
    dlc = {**SAMPLE_IGDB[0], "id": 1021, "name": "GTA V: Cabina Épica", "game_type": 1}
    bundle = {**SAMPLE_IGDB[0], "id": 1022, "name": "GTA V + Online", "game_type": 3}

    assert igdb_services.cache_game(dlc).category == Game.Category.DLC_ADDON
    assert igdb_services.cache_game(bundle).category == Game.Category.BUNDLE


def test_cache_game_category_missing_is_null(igdb_creds):
    """IGDB no siempre trae `game_type` (p. ej. resultados antiguos en caché)."""
    without_game_type = {k: v for k, v in SAMPLE_IGDB[0].items() if k != "game_type"}
    without_game_type["id"] = 1023
    game = igdb_services.cache_game(without_game_type)
    assert game.category is None


def test_cache_game_updates_existing(igdb_creds):
    igdb_services.cache_game(SAMPLE_IGDB[0])
    updated = {**SAMPLE_IGDB[0], "name": "GTA V (remaster)"}
    igdb_services.cache_game(updated)
    # update_or_create por igdb_id → sigue habiendo una sola fila.
    assert Game.objects.filter(igdb_id=1020).count() == 1
    assert Game.objects.get(igdb_id=1020).title == "GTA V (remaster)"


def test_search_results_are_cached(igdb_creds):
    """Dos búsquedas idénticas → una sola llamada HTTP (caché de 1h)."""
    client = IGDBClient()
    with patch.object(IGDBClient, "_get_token", return_value="tok"), \
         patch.object(IGDBClient, "_request", return_value=SAMPLE_IGDB) as mock_req:
        client.search_games("GTA")
        client.search_games("GTA")  # debe salir de caché

    mock_req.assert_called_once()


# --- Búsqueda con ranking (empieza-por > contiene) ---------------------------
def _seed_hollow_catalog():
    Game.objects.create(igdb_id=101, title="Hollow Knight", igdb_rating=90)
    Game.objects.create(igdb_id=102, title="Hollow Road", igdb_rating=70)
    Game.objects.create(igdb_id=103, title="A Hole in Space", igdb_rating=95)  # contiene, no empieza
    Game.objects.create(igdb_id=104, title="Celeste", igdb_rating=99)  # no coincide


def test_search_ranks_startswith_before_contains(auth_client):
    """«hol» → primero los que empiezan por 'hol' (por nota), luego el resto."""
    _seed_hollow_catalog()
    with patch.object(IGDBClient, "find_games_by_name", return_value=[]), \
         patch.object(IGDBClient, "search_games", return_value=[]):
        resp = auth_client.get("/api/games/search/?q=hol")

    assert resp.status_code == 200
    titles = [g["title"] for g in resp.json()]
    assert titles == ["Hollow Knight", "Hollow Road", "A Hole in Space"]


def test_search_serves_local_results_when_igdb_unavailable(auth_client):
    """Si IGDB no está configurado pero la caché local tiene coincidencias, se sirven."""
    _seed_hollow_catalog()
    # En settings de test no hay credenciales de IGDB → IGDBNotConfigured interno.
    resp = auth_client.get("/api/games/search/?q=hollow")

    assert resp.status_code == 200
    titles = [g["title"] for g in resp.json()]
    assert titles == ["Hollow Knight", "Hollow Road"]


def test_search_returns_503_when_igdb_unavailable_and_no_local_match(auth_client):
    resp = auth_client.get("/api/games/search/?q=juegoinexistente")
    assert resp.status_code == 503


def test_request_retries_on_rate_limit(igdb_creds):
    """Un 429 de IGDB se reintenta (con espera) en vez de perder el juego."""
    limited = MagicMock(status_code=429, headers={"Retry-After": "0"})
    ok = MagicMock(status_code=200, headers={})
    ok.json.return_value = SAMPLE_IGDB
    ok.raise_for_status.return_value = None

    with patch.object(IGDBClient, "_get_token", return_value="tok"), \
         patch("apps.igdb.client.requests.post", side_effect=[limited, ok]), \
         patch("apps.igdb.client.time.sleep") as mock_sleep:
        results = IGDBClient()._request("games", "cuerpo")

    assert results == SAMPLE_IGDB
    mock_sleep.assert_called_once()


def test_match_by_name_ignores_trademark_symbols():
    """«ELDEN RING™» (Steam) debe casar con «ELDEN RING» (IGDB local)."""
    Game.objects.create(igdb_id=42, title="ELDEN RING", igdb_rating=95)
    game = igdb_services.match_or_create_game_by_name("ELDEN RING™")
    assert game is not None and game.igdb_id == 42


def test_match_by_name_retries_with_cleaned_title(igdb_creds):
    """Si el nombre de tienda no casa, reintenta sin ruido de edición/año."""
    oblivion = {**SAMPLE_IGDB[0], "id": 43, "name": "The Elder Scrolls IV: Oblivion"}
    with patch("apps.igdb.services.time.sleep"), \
         patch.object(IGDBClient, "find_games_by_name", side_effect=[[], [oblivion]]) as mock_search:
        game = igdb_services.match_or_create_game_by_name(
            "The Elder Scrolls IV: Oblivion Game of the Year Edition (2009)"
        )

    assert game is not None and game.igdb_id == 43
    # El segundo intento usa el título limpio.
    assert mock_search.call_args_list[1].args[0] == "The Elder Scrolls IV: Oblivion"


def test_match_by_name_rejects_unrelated_relevance_match(igdb_creds):
    """No debe emparejar con un juego "relacionado" pero distinto (bug real:
    Steam "Elden Ring" emparejaba con IGDB "Elden Ring Nightreign")."""
    nightreign = {**SAMPLE_IGDB[0], "id": 99, "name": "Elden Ring Nightreign"}
    with patch("apps.igdb.services.time.sleep"), \
         patch.object(IGDBClient, "find_games_by_name", return_value=[nightreign]):
        game = igdb_services.match_or_create_game_by_name("Elden Ring")

    assert game is None


def test_upcoming_selects_hyped_and_sorts_by_date(igdb_creds):
    """Próximos lanzamientos: pide los más esperados (hypes) y ordena por fecha."""
    sample = [
        {"id": 1, "name": "Sale después", "first_release_date": 2000},
        {"id": 2, "name": "Sale antes", "first_release_date": 1000},
    ]
    with patch.object(IGDBClient, "_get_token", return_value="tok"), \
         patch.object(IGDBClient, "_request", return_value=sample) as mock_req:
        results = IGDBClient().get_upcoming_games(limit=12)

    body = mock_req.call_args.args[1]
    assert "hypes > 0" in body  # fuera el shovelware sin seguidores
    assert "sort hypes desc" in body  # selección por expectación
    assert [r["id"] for r in results] == [2, 1]  # presentación cronológica


# --- Backfill de category en juegos ya cacheados -----------------------------
def test_backfill_categories_command(igdb_creds):
    """Solo pide a IGDB los juegos que aún no tienen category, y los actualiza."""
    Game.objects.create(igdb_id=2001, title="Sin category")
    Game.objects.create(igdb_id=2002, title="Ya tiene category", category=0)

    response = [{"id": 2001, "game_type": 1}]
    with patch.object(IGDBClient, "_get_token", return_value="tok"), \
         patch.object(IGDBClient, "_request", return_value=response) as mock_req, \
         patch("apps.igdb.management.commands.backfill_categories.time.sleep"):
        call_command("backfill_categories", "--batch-size=200")

    mock_req.assert_called_once()
    ids_queried = mock_req.call_args.args[1]
    assert "2001" in ids_queried and "2002" not in ids_queried
    assert Game.objects.get(igdb_id=2001).category == 1
    assert Game.objects.get(igdb_id=2002).category == 0  # intacto


def test_backfill_categories_noop_when_nothing_pending(igdb_creds):
    Game.objects.create(igdb_id=2003, title="Ya tiene category", category=3)
    with patch.object(IGDBClient, "_request") as mock_req:
        call_command("backfill_categories")
    mock_req.assert_not_called()


def test_search_pagination_is_stable(auth_client):
    """Las páginas siguientes paginan la caché local sin duplicar ni saltar."""
    _seed_hollow_catalog()
    with patch.object(IGDBClient, "find_games_by_name", return_value=[]), \
         patch.object(IGDBClient, "search_games", return_value=[]):
        p1 = auth_client.get("/api/games/search/?q=hol&limit=2&offset=0").json()
        p2 = auth_client.get("/api/games/search/?q=hol&limit=2&offset=2").json()

    assert [g["title"] for g in p1] == ["Hollow Knight", "Hollow Road"]
    assert [g["title"] for g in p2] == ["A Hole in Space"]
