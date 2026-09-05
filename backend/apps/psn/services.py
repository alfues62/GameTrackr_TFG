"""
Sincronización de la biblioteca de PSN con GameTrackr.
"""
from django.utils import timezone

from apps.core.models import UserGame
from apps.core.platforms import platform_from_psn_title_id
from apps.core.sync import upsert_synced_game
from apps.igdb import services as igdb_services

from .psn_client import PSNClient, trophy_key


def sync_user_library(user) -> dict:
    """Sincroniza los juegos jugados en PSN del usuario. Devuelve un resumen."""
    client = PSNClient(user.psn_npsso)
    titles = client.get_played_titles()
    trophy_progress = client.get_trophy_progress()

    new = updated = errors = 0

    for pt in titles:
        try:
            game = igdb_services.match_or_create_game_by_name(pt["name"])
            if game is None:
                errors += 1
                continue

            # PSN devuelve "unknown" en buena parte del catalogo y entonces solo
            # sabemos que es "PlayStation"; el identificador de producto sí dice
            # la consola exacta.
            platform = pt["platform"]
            if platform == "PlayStation":
                platform = platform_from_psn_title_id(pt.get("title_id")) or platform
            defaults = {
                "hours_played": pt["hours"],
                "platform": platform,
                "last_synced": timezone.now(),
            }
            # % de trofeos como índice de completitud (si PSN lo reporta).
            progress = trophy_progress.get(trophy_key(pt["name"]))
            if progress is not None:
                defaults["completion_percentage"] = round(progress, 1)

            _, created = upsert_synced_game(
                user, game, UserGame.SyncSource.PSN, pt.get("title_id"), defaults
            )
            new += int(created)
            updated += int(not created)
        except Exception:  # noqa: BLE001 — un título problemático no rompe la sync
            errors += 1

    return {"synced": new + updated, "new": new, "updated": updated, "errors": errors}
