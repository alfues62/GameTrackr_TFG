"""
Cliente de la API de IGDB (Internet Game Database), propiedad de Twitch/Amazon.

Autenticación: OAuth client-credentials contra Twitch. El access token se cachea
para no pedirlo en cada llamada. Las peticiones se envían a la API v4 con un
cuerpo en texto plano en el lenguaje propio de IGDB (Apicalypse).
"""
import datetime as dt
import hashlib
import time

import requests
from django.conf import settings
from django.core.cache import cache

TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
IGDB_BASE_URL = "https://api.igdb.com/v4"
TOKEN_CACHE_KEY = "igdb_access_token"

# TTL (segundos) de la caché de respuestas de IGDB. Por defecto 1 hora.
IGDB_CACHE_TTL = getattr(settings, "IGDB_CACHE_TTL", 3600)

# Campos solicitados en todas las consultas. `game_type` distingue juego base
# de DLC/expansión/colección (ver Game.category / Game.Category en
# apps.core.models: se guarda ahí con el mismo nombre y los mismos valores
# 0-14). OJO: el campo histórico `category` de IGDB está deprecado Y ya no
# funciona de verdad (siempre viene null, comprobado en vivo); `game_type` es
# el que hay que pedir, y es un entero inline igual de barato — no hace falta
# la consulta aparte al endpoint `game_types` salvo para el nombre legible.
DEFAULT_FIELDS = (
    "id, name, cover.url, summary, genres.name, "
    "platforms.name, first_release_date, rating, game_type"
)


class IGDBError(Exception):
    """Error genérico al hablar con IGDB/Twitch."""


class IGDBNotConfigured(IGDBError):
    """Faltan las credenciales IGDB_CLIENT_ID / IGDB_CLIENT_SECRET."""


class IGDBClient:
    def __init__(self, client_id=None, client_secret=None):
        self.client_id = client_id or settings.IGDB_CLIENT_ID
        self.client_secret = client_secret or settings.IGDB_CLIENT_SECRET

    # -- Autenticación -------------------------------------------------------
    def _get_token(self) -> str:
        if not self.client_id or not self.client_secret:
            raise IGDBNotConfigured(
                "IGDB no está configurado: define IGDB_CLIENT_ID e IGDB_CLIENT_SECRET."
            )

        token = cache.get(TOKEN_CACHE_KEY)
        if token:
            return token

        try:
            resp = requests.post(
                TWITCH_TOKEN_URL,
                params={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            raise IGDBError(f"No se pudo obtener el token de Twitch: {exc}") from exc

        token = data["access_token"]
        # Renovamos un poco antes de que expire.
        ttl = max(60, int(data.get("expires_in", 3600)) - 60)
        cache.set(TOKEN_CACHE_KEY, token, timeout=ttl)
        return token

    def _headers(self) -> dict:
        return {
            "Client-ID": self.client_id,
            "Authorization": f"Bearer {self._get_token()}",
            "Accept": "application/json",
        }

    # -- Petición base -------------------------------------------------------
    def _query(self, endpoint: str, body: str) -> list:
        """Ejecuta una consulta Apicalypse, cacheando el resultado 1h.

        La clave depende del endpoint y del cuerpo exacto, así que dos búsquedas
        idénticas reutilizan la respuesta y no vuelven a pegar a IGDB hasta que
        expira el TTL.
        """
        cache_key = self._cache_key(endpoint, body)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        result = self._request(endpoint, body)
        cache.set(cache_key, result, timeout=IGDB_CACHE_TTL)
        return result

    @staticmethod
    def _cache_key(endpoint: str, body: str) -> str:
        digest = hashlib.sha256(f"{endpoint}|{body}".encode("utf-8")).hexdigest()
        return f"igdb:query:{digest}"

    def _request(self, endpoint: str, body: str) -> list:
        """Petición HTTP con reintentos ante el rate limit de IGDB (429).

        IGDB corta a 4 peticiones/segundo; las sincronizaciones de bibliotecas
        grandes lo rozan. Ante un 429 se espera (Retry-After o 1s) y se
        reintenta hasta 3 veces antes de rendirse.
        """
        last_exc = None
        for attempt in range(3):
            try:
                resp = requests.post(
                    f"{IGDB_BASE_URL}/{endpoint}",
                    headers=self._headers(),
                    data=body,
                    timeout=15,
                )
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After") or 1)
                    time.sleep(min(retry_after, 5) * (attempt + 1))
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                last_exc = exc
                break
        raise IGDBError(f"Error en la petición a IGDB: {last_exc or 'rate limit (429)'}") from last_exc

    # -- Métodos públicos ----------------------------------------------------
    def search_games(self, query: str, limit: int = 20, offset: int = 0) -> list:
        """Búsqueda difusa de IGDB (tolera erratas, ordena por relevancia)."""
        safe_query = query.replace('"', "")
        body = (
            f'search "{safe_query}"; '
            f"fields {DEFAULT_FIELDS}; "
            f"limit {limit}; offset {offset};"
        )
        return self._query("games", body)

    def find_games_by_name(self, query: str, limit: int = 20, offset: int = 0) -> list:
        """Juegos cuyo nombre CONTIENE `query` (comodines de Apicalypse), por popularidad.

        A diferencia de search_games, esto devuelve todas las coincidencias por
        subcadena («hol» → Hollow Knight, Hollow Road…), no solo las que el
        ranking difuso de IGDB considera relevantes.
        """
        safe_query = query.replace('"', "")
        body = (
            f"fields {DEFAULT_FIELDS}; "
            f'where name ~ *"{safe_query}"*; '
            f"sort rating_count desc; limit {limit}; offset {offset};"
        )
        return self._query("games", body)

    def get_game(self, igdb_id: int) -> dict | None:
        body = f"fields {DEFAULT_FIELDS}; where id = {int(igdb_id)};"
        results = self._query("games", body)
        return results[0] if results else None

    def get_upcoming_games(self, limit: int = 10, offset: int = 0) -> list:
        """Próximos lanzamientos RELEVANTES, en orden cronológico.

        IGDB lista miles de juegos futuros sin interés (shovelware); como aún
        no tienen valoraciones, la señal de relevancia pre-lanzamiento es
        `hypes` (seguidores que esperan el juego). Se seleccionan los más
        esperados y se devuelven ordenados por fecha de salida.
        """
        now = int(dt.datetime.now(dt.timezone.utc).timestamp())
        body = (
            f"fields {DEFAULT_FIELDS}; "
            f"where first_release_date > {now} & cover != null & hypes > 0; "
            f"sort hypes desc; limit {limit}; offset {offset};"
        )
        results = self._query("games", body)
        return sorted(results, key=lambda g: g.get("first_release_date") or 0)

    def get_popular_games(self, limit: int = 12, offset: int = 0) -> list:
        body = (
            f"fields {DEFAULT_FIELDS}; "
            f"where cover != null & rating != null & rating_count > 50; "
            f"sort rating_count desc; limit {limit}; offset {offset};"
        )
        return self._query("games", body)

    def get_top_rated_games(self, limit: int = 12, offset: int = 0) -> list:
        body = (
            f"fields {DEFAULT_FIELDS}; "
            f"where cover != null & rating != null & rating_count > 80; "
            f"sort rating desc; limit {limit}; offset {offset};"
        )
        return self._query("games", body)

    def get_game_types(self, igdb_ids: list[int]) -> list:
        """Trae solo id+game_type para un lote de ids (backfill barato de un
        campo nuevo sobre juegos ya cacheados, sin repetir toda la consulta)."""
        if not igdb_ids:
            return []
        ids = ",".join(str(int(i)) for i in igdb_ids)
        body = f"fields id, game_type; where id = ({ids}); limit {len(igdb_ids)};"
        return self._query("games", body)
