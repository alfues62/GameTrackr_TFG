"""
Cliente de PlayStation Network vía psnawp (API no oficial, reverse-engineered).

Sony no ofrece OAuth para terceros: el usuario obtiene su token NPSSO iniciando
sesión en Sony y visitando https://ca.account.sony.com/api/v1/ssocookie, y lo
pega en GameTrackr. El refresh token derivado dura ~2 meses.

psnawp se importa de forma perezosa (igual que scikit-learn en el recomendador)
para que el resto del backend funcione aunque la librería no esté instalada.
"""
import re


class PSNError(Exception):
    """Error genérico al hablar con PSN."""


class PSNAuthError(PSNError):
    """El token NPSSO no es válido o ha caducado."""


# Mapeo de la categoría de psnawp a nuestra etiqueta de plataforma.
_CATEGORY_PLATFORMS = {
    "ps5_native_game": "PS5",
    "ps5_game": "PS5",
    "ps4_game": "PS4",
    "pspc_game": "PC",
}


def trophy_key(name: str) -> str:
    """Clave para cruzar los dos endpoints de Sony, que nombran distinto.

    El historial de juego devuelve "DARK SOULS(tm) III" y la lista de trofeos
    "Dark Souls(tm) III", con los simbolos de marca en sitios diferentes y algun
    sufijo como "(2)". Reduciendo ambos a letras y numeros el cruce funciona.
    """
    n = (name or "").lower()
    n = re.sub(r"\s*\(\d+\)\s*$", "", n)
    return re.sub(r"[^a-z0-9]+", "", n)


class PSNClient:
    def __init__(self, npsso: str):
        if not npsso:
            raise PSNAuthError("Falta el token NPSSO.")
        self.npsso = npsso
        self._client = None  # instancia psnawp.me(), perezosa

    def _me(self):
        if self._client is None:
            try:
                from psnawp_api import PSNAWP
                from psnawp_api.core.psnawp_exceptions import PSNAWPAuthenticationError
            except ImportError as exc:
                raise PSNError("psnawp no está instalado en el servidor.") from exc

            try:
                self._client = PSNAWP(self.npsso).me()
            except PSNAWPAuthenticationError as exc:
                raise PSNAuthError("El token NPSSO no es válido o ha caducado.") from exc
            except Exception as exc:  # noqa: BLE001
                raise PSNError(f"No se pudo conectar con PSN: {exc}") from exc
        return self._client

    def get_profile(self) -> dict:
        """Valida el NPSSO y devuelve {"online_id"}."""
        me = self._me()
        try:
            return {"online_id": me.online_id}
        except Exception as exc:  # noqa: BLE001
            raise PSNError(f"No se pudo leer el perfil de PSN: {exc}") from exc

    def get_played_titles(self) -> list:
        """Juegos jugados con plataforma y horas.

        Cada item: {"title_id", "name", "platform" (PS5/PS4/...), "hours": float}.
        """
        me = self._me()
        try:
            stats = list(me.title_stats())
        except Exception as exc:  # noqa: BLE001
            raise PSNError(f"No se pudo obtener la biblioteca de PSN: {exc}") from exc

        titles = []
        for t in stats:
            name = (getattr(t, "name", "") or "").strip()
            if not name:
                continue
            category = getattr(getattr(t, "category", None), "value", "") or ""
            duration = getattr(t, "play_duration", None)
            hours = round(duration.total_seconds() / 3600, 2) if duration else 0.0
            titles.append({
                # Identidad estable del titulo en PSN (ver apps.core.sync).
                "title_id": str(getattr(t, "title_id", "") or ""),
                "name": name,
                "platform": _CATEGORY_PLATFORMS.get(category, "PlayStation"),
                "hours": hours,
            })
        return titles

    def get_trophy_progress(self) -> dict:
        """% de trofeos por título: {clave_normalizada: progreso 0-100}.

        Las claves pasan por `trophy_key` porque los dos endpoints de Sony
        nombran el mismo juego de forma distinta. Si la consulta de trofeos
        falla se devuelve {} (no es crítica).
        """
        me = self._me()
        try:
            return {
                trophy_key(t.title_name): float(t.progress)
                for t in me.trophy_titles()
                if getattr(t, "title_name", None) and getattr(t, "progress", None) is not None
            }
        except Exception:  # noqa: BLE001
            return {}
