"""
Orquestación de la sincronización de la biblioteca de Steam con GameTrackr.
"""
import logging
import re
import threading

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

from apps.core.models import Game, UserGame
from apps.core.sync import upsert_synced_game
from apps.igdb import services as igdb_services

from .steam_client import SteamClient

ACHIEVEMENTS_TOP_N = 20

logger = logging.getLogger(__name__)


# --- Progreso de la sincronización (vía caché, compartido entre hilos) -------
def sync_progress_key(user_id) -> str:
    return f"steam-sync-progress:{user_id}"


def set_sync_progress(user_id, **data) -> None:
    """Publica el estado de la sincronización para que la UI lo muestre."""
    cache.set(sync_progress_key(user_id), data, 600)


def trigger_auto_sync(user) -> None:
    """Importación inicial de la biblioteca al vincular Steam, en segundo plano.

    Se lanza en un hilo para no bloquear el login/vinculación (una biblioteca
    grande implica muchas búsquedas en IGDB). Es *best-effort*: si falla, el
    usuario siempre puede sincronizar a mano desde Ajustes. Sin Celery ni
    colas: suficiente para el alcance del proyecto y documentado como mejora
    futura. Desactivable con STEAM_AUTO_SYNC=False (tests).
    """
    if not getattr(settings, "STEAM_AUTO_SYNC", True):
        return
    # Estado inicial ANTES de arrancar el hilo: así la UI ya ve "running"
    # aunque llegue antes de que el hilo haya contactado con Steam.
    set_sync_progress(user.pk, status="running", done=0, total=None)
    threading.Thread(target=_sync_quietly, args=(user.pk,), daemon=True).start()


def _sync_quietly(user_id) -> None:
    try:
        user = get_user_model().objects.get(pk=user_id)
        summary = sync_user_library(user)
        logger.info("Auto-sync de Steam para user=%s: %s", user_id, summary)
    except Exception:  # noqa: BLE001 — nunca debe tumbar el hilo llamante
        logger.exception("Auto-sync de Steam fallida para user=%s", user_id)
        set_sync_progress(user_id, status="error")
    finally:
        connection.close()  # cada hilo abre su propia conexión a la BD


def normalize_steam_input(value: str, client: SteamClient) -> str | None:
    """Normaliza un Steam ID, una vanity URL o una URL de perfil a un steamid numérico."""
    value = (value or "").strip()

    m = re.search(r"steamcommunity\.com/profiles/(\d{17})", value)
    if m:
        return m.group(1)

    m = re.search(r"steamcommunity\.com/id/([^/]+)", value)
    if m:
        value = m.group(1)

    if re.fullmatch(r"\d{17}", value):
        return value

    return client.resolve_vanity_url(value)


def _match_or_create_game(steam_game: dict) -> Game | None:
    """Busca el juego en la BD local por nombre; si no existe, lo busca en IGDB."""
    return igdb_services.match_or_create_game_by_name(steam_game.get("name") or "")


def sync_user_library(user) -> dict:
    """Sincroniza la biblioteca de Steam del usuario. Devuelve un resumen.

    Publica su progreso vía set_sync_progress para que la interfaz pueda
    mostrar una barra ("34 de 83 juegos…") mientras trabaja.
    """
    client = SteamClient()
    owned = client.get_owned_games(user.steam_id)
    total = len(owned)
    set_sync_progress(user.pk, status="running", done=0, total=total)

    new = updated = errors = 0
    entries = []  # (usergame, appid, hours)

    for index, sg in enumerate(owned, start=1):
        try:
            game = _match_or_create_game(sg)
            if game is None:
                errors += 1
                continue

            hours = round((sg.get("playtime_forever") or 0) / 60, 2)
            usergame, created = upsert_synced_game(
                user,
                game,
                UserGame.SyncSource.STEAM,
                sg.get("appid"),
                {
                    "hours_played": hours,
                    "is_from_steam": True,
                    "platform": "PC",  # los juegos importados de Steam son de PC
                    "last_synced": timezone.now(),
                },
            )
            new += int(created)
            updated += int(not created)
            entries.append((usergame, sg.get("appid"), hours))
        except Exception:  # noqa: BLE001 — un juego problemático no debe romper la sync
            errors += 1
        set_sync_progress(user.pk, status="running", done=index, total=total)

    # % de completitud (logros) solo para los juegos con más horas
    top = sorted(entries, key=lambda e: e[2], reverse=True)[:ACHIEVEMENTS_TOP_N]
    for usergame, appid, _ in top:
        if not appid:
            continue
        pct = client.get_player_achievements(user.steam_id, appid)
        if pct is not None:
            usergame.completion_percentage = pct
            usergame.save(update_fields=["completion_percentage"])

    summary = {"synced": new + updated, "new": new, "updated": updated, "errors": errors}
    set_sync_progress(user.pk, status="done", **summary)
    return summary
