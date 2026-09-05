"""
Cliente de la Steamworks Web API.

La API es pública para perfiles en modo público y solo requiere la STEAM_API_KEY
de la aplicación (no OAuth por usuario).
"""
import requests
from django.conf import settings

STEAM_API = "https://api.steampowered.com"


class SteamError(Exception):
    """Error genérico al hablar con la Steamworks Web API."""


class SteamNotConfigured(SteamError):
    """Falta la STEAM_API_KEY."""


class SteamClient:
    def __init__(self, api_key=None):
        self.api_key = api_key or settings.STEAM_API_KEY

    def _key(self) -> str:
        if not self.api_key:
            raise SteamNotConfigured("STEAM_API_KEY no configurada.")
        return self.api_key

    def _get(self, path: str, params: dict) -> dict:
        try:
            resp = requests.get(
                f"{STEAM_API}/{path}",
                params={"key": self._key(), "format": "json", **params},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            raise SteamError(f"Error al contactar con Steam: {exc}") from exc

    def resolve_vanity_url(self, vanity: str) -> str | None:
        """Convierte una URL personalizada (vanity) en un steamid de 17 dígitos."""
        data = self._get("ISteamUser/ResolveVanityURL/v1/", {"vanityurl": vanity})
        resp = data.get("response", {})
        return resp.get("steamid") if resp.get("success") == 1 else None

    def get_owned_games(self, steam_id: str) -> list:
        data = self._get(
            "IPlayerService/GetOwnedGames/v1/",
            {"steamid": steam_id, "include_appinfo": 1, "include_played_free_games": 1},
        )
        games = data.get("response", {}).get("games", [])
        return [
            {
                "appid": g.get("appid"),
                "name": g.get("name", ""),
                "playtime_forever": g.get("playtime_forever", 0),
                "img_icon_url": g.get("img_icon_url", ""),
            }
            for g in games
        ]

    def get_player_achievements(self, steam_id: str, app_id) -> float | None:
        """Devuelve el % de logros conseguidos, o None si el juego no tiene logros."""
        try:
            data = self._get(
                "ISteamUserStats/GetPlayerAchievements/v1/",
                {"steamid": steam_id, "appid": app_id},
            )
        except SteamError:
            # Muchos juegos no tienen logros (la API responde con error): lo ignoramos.
            return None

        achievements = data.get("playerstats", {}).get("achievements")
        if not achievements:
            return None
        total = len(achievements)
        achieved = sum(1 for a in achievements if a.get("achieved") == 1)
        return round(achieved / total * 100, 1) if total else None
