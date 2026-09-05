"""
Servicios que traducen la respuesta de IGDB al modelo local `Game` y la cachean
en la base de datos para evitar llamadas repetidas a la API externa.
"""
import datetime as dt
import re
import time

from django.db.models import Case, F, IntegerField, Value, When

from apps.core.models import Game


def _cover_url(raw: str | None) -> str | None:
    """Normaliza la URL de portada de IGDB (protocol-relative + tamaño mayor)."""
    if not raw:
        return None
    url = f"https:{raw}" if raw.startswith("//") else raw
    # IGDB devuelve por defecto t_thumb; pedimos una portada de mayor resolución.
    return url.replace("/t_thumb/", "/t_cover_big/")


def _to_defaults(data: dict) -> dict:
    ts = data.get("first_release_date")
    release_date = (
        dt.datetime.fromtimestamp(ts, dt.timezone.utc).date() if ts else None
    )
    return {
        "title": data.get("name", ""),
        "cover_url": _cover_url((data.get("cover") or {}).get("url")),
        "description": data.get("summary"),
        "release_date": release_date,
        "genres": [g["name"] for g in data.get("genres", []) if "name" in g],
        "platforms": [p["name"] for p in data.get("platforms", []) if "name" in p],
        "igdb_rating": data.get("rating"),
        # Se pide como `game_type` (ver client.DEFAULT_FIELDS); se guarda en el
        # campo local `category`, mismos valores 0-14.
        "category": data.get("game_type"),
    }


def cache_game(data: dict) -> Game | None:
    """Crea o actualiza un Game local a partir de un item de IGDB."""
    if "id" not in data:
        return None
    game, _ = Game.objects.update_or_create(
        igdb_id=data["id"], defaults=_to_defaults(data)
    )
    return game


def cache_games(items: list) -> list:
    """Cachea una lista de juegos preservando el orden devuelto por IGDB."""
    return [game for item in items if (game := cache_game(item)) is not None]


# Tamaño del bloque que se pide a IGDB al buscar: los 150 juegos más populares
# que coincidan. Las páginas siguientes se sirven de la caché local.
IGDB_SEARCH_CHUNK = 150


def search_games_ranked(query: str, limit: int = 20, offset: int = 0) -> tuple[list, int | None]:
    """Busca juegos por subcadena del título, con ranking empieza-por > contiene.

    1. En la PRIMERA página (offset 0), pide a IGDB un bloque grande de juegos
       que contienen `query` y los cachea en la BD local. Las páginas
       siguientes paginan solo sobre la caché local: como el conjunto no
       cambia entre páginas, el orden es estable (sin duplicados ni saltos).
    2. Devuelve las filas locales cuyo título contiene `query`: primero las que
       EMPIEZAN por él, después las que lo contienen en otra parte; dentro de
       cada grupo, por nota de IGDB.
    3. Si no hay ninguna coincidencia por subcadena, cae a la búsqueda difusa
       de IGDB (tolera erratas: «holow knigt» → Hollow Knight).

    Si IGDB falla pero la caché local tiene resultados, se sirven igualmente;
    el error (502/503) solo se devuelve cuando no hay nada que mostrar.
    Retorna (games, error) al estilo de get_or_fetch_game.
    """
    from .client import IGDBClient, IGDBError, IGDBNotConfigured

    query = (query or "").strip()
    if not query:
        return [], None

    client = IGDBClient()
    error = None
    if offset == 0:
        try:
            cache_games(client.find_games_by_name(query, limit=IGDB_SEARCH_CHUNK))
        except IGDBNotConfigured:
            error = 503
        except IGDBError:
            error = 502

    def _ranked():
        qs = (
            Game.objects.filter(title__icontains=query)
            .annotate(
                rank=Case(
                    When(title__istartswith=query, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .order_by("rank", F("igdb_rating").desc(nulls_last=True), "title")
        )
        return list(qs[offset : offset + limit])

    games = _ranked()
    if games:
        return games, None

    # Sin coincidencias por subcadena: red de seguridad con la búsqueda difusa
    # (solo tiene sentido en la primera página).
    if offset == 0 and error is None:
        try:
            fuzzy = cache_games(client.search_games(query, limit=limit))
            if fuzzy:
                return fuzzy[:limit], None
        except (IGDBNotConfigured, IGDBError):
            pass

    return [], error


def _normalize_title(name: str) -> str:
    """Limpia marcas (™®©) y espacios duplicados que rompen el matching."""
    cleaned = re.sub(r"[™®©]", "", name or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def _fallback_title(name: str) -> str:
    """Versión agresivamente limpia del título para un segundo intento.

    Elimina el ruido típico de los nombres de tienda que no existe en IGDB:
    años entre paréntesis, coletillas de edición («Game of the Year Edition»),
    «- Demo» y guiones decorativos («-HD 1.5+2.5 ReMIX-»).
    """
    n = re.sub(r"\([^)]*\)", " ", name)  # (2009)
    n = re.sub(
        r"(?i)\b(game of the year|goty|definitive|complete|deluxe|enhanced|remastered|digital)\s+edition\b",
        " ",
        n,
    )
    n = re.sub(r"(?i)\s*-\s*demo\b", " ", n)
    n = re.sub(r"(^|\s)-+|-+(\s|$)", " ", n)  # guiones pegados a espacios/bordes
    return re.sub(r"\s+", " ", n).strip()


def _pick_canonical(title: str) -> Game | None:
    """Elige siempre la misma ficha local entre las que comparten titulo.

    IGDB guarda ports, forks y ediciones con el nombre exacto del original -en
    este catalogo hay decenas de titulos repetidos-, y el `ordering` del modelo
    es por titulo, con lo que todas empataban y `.first()` devolvia lo que
    quisiera Postgres. Al cambiar de una sincronizacion a otra, la entrada de
    biblioteca se duplicaba. Se prefiere el juego principal y, a igualdad, el
    igdb_id mas bajo, que es la ficha original.
    """
    return (
        Game.objects.filter(title__iexact=title)
        .order_by(
            Case(
                When(category=Game.Category.MAIN_GAME, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            ),
            "igdb_id",
        )
        .first()
    )


def _search_and_cache_exact(title: str) -> Game | None:
    """Busca en IGDB por subcadena y cachea SOLO si algún resultado tiene el
    título EXACTO (sin distinguir mayúsculas).

    No usa la búsqueda difusa de IGDB (`search_games`) para esto: su ranking
    por "relevancia" no es textual, así que "Elden Ring" puede devolver como
    primer resultado "Elden Ring Nightreign", o "Resident Evil 4" un bundle
    distinto, con resultados igual de plausibles pero incorrectos. Preferimos
    no importar nada a importar el juego equivocado con datos reales del
    usuario (horas, logros) mal atribuidos.
    """
    from .client import IGDBClient, IGDBError

    time.sleep(0.25)
    try:
        results = IGDBClient().find_games_by_name(title, limit=10)
    except IGDBError:
        return None
    for item in results:
        if _normalize_title(item.get("name", "")).lower() == title.lower():
            return cache_game(item)
    return None


def match_or_create_game_by_name(name: str) -> Game | None:
    """Busca un juego local por nombre exacto; si no existe, lo busca en IGDB.

    Lo usan las sincronizaciones de plataforma (Steam/PSN), que solo
    conocen el nombre del título. Solo empareja con coincidencias exactas de
    título (ver `_search_and_cache_exact`); devuelve None si no hay ninguna,
    en vez de arriesgarse a importar un juego distinto.
    """
    name = _normalize_title(name)
    if not name:
        return None

    game = _pick_canonical(name)
    if game is not None:
        return game

    game = _search_and_cache_exact(name)
    if game is not None:
        return game

    # Segundo intento con el título limpio de ruido de tienda.
    fallback = _fallback_title(name)
    if not fallback or fallback.lower() == name.lower():
        return None
    game = _pick_canonical(fallback)
    if game is not None:
        return game
    return _search_and_cache_exact(fallback)


def get_or_fetch_game(igdb_id) -> tuple[Game | None, int | None]:
    """Devuelve el Game local por igdb_id; si no existe, lo pide a IGDB y lo cachea.

    Retorna (game, error): error es None si todo fue bien, o un código HTTP
    (404 no encontrado, 502 IGDB caído, 503 IGDB no configurado).
    """
    from .client import IGDBClient, IGDBError, IGDBNotConfigured

    try:
        igdb_id = int(igdb_id)
    except (TypeError, ValueError):
        return None, 404

    game = Game.objects.filter(igdb_id=igdb_id).first()
    if game is not None:
        return game, None

    try:
        data = IGDBClient().get_game(igdb_id)
    except IGDBNotConfigured:
        return None, 503
    except IGDBError:
        return None, 502

    if not data:
        return None, 404
    return cache_game(data), None
