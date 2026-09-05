_CANONICAL = {
    "pc": "PC",
    "pc (microsoft windows)": "PC",
    "microsoft windows": "PC",
    "windows": "PC",
    "win": "PC",
    "mac": "Mac",
    "linux": "Linux",
    "playstation": "PlayStation",
    "playstation 2": "PS2",
    "playstation 3": "PS3",
    "playstation 4": "PS4",
    "playstation 5": "PS5",
    "ps2": "PS2",
    "ps3": "PS3",
    "ps4": "PS4",
    "ps5": "PS5",
    "playstation vita": "PS Vita",
    "playstation portable": "PSP",
    "xbox": "Xbox",
    "xbox 360": "Xbox 360",
    "xbox one": "Xbox One",
    "xbox series x|s": "Xbox Series X|S",
    "xbox series x": "Xbox Series X|S",
    "nintendo switch": "Switch",
    "switch": "Switch",
}

def canonical_platform(name: str) -> str:
    """Etiqueta unificada de una plataforma. Devuelve el original si no la conoce."""
    limpio = (name or "").strip()
    return _CANONICAL.get(limpio.lower(), limpio)

_PSN_PREFIXES = {
    "PPSA": "PS5",
    "CUSA": "PS4",
    "BLES": "PS3", "BLUS": "PS3", "BCES": "PS3", "BCUS": "PS3", "BLJM": "PS3",
    "NPEA": "PS3", "NPUA": "PS3", "NPHA": "PS3", "NPJA": "PS3",
    "NPEB": "PS3", "NPUB": "PS3", "NPHB": "PS3", "NPJB": "PS3",
    "PCSA": "PS Vita", "PCSB": "PS Vita", "PCSC": "PS Vita", "PCSD": "PS Vita",
    "PCSE": "PS Vita", "PCSF": "PS Vita", "PCSG": "PS Vita", "PCSH": "PS Vita",
    "ULES": "PSP", "ULUS": "PSP", "UCES": "PSP", "UCUS": "PSP", "ULJM": "PSP",
}


def platform_from_psn_title_id(title_id: str) -> str | None:

    prefijo = (title_id or "").strip().upper()[:4]
    return _PSN_PREFIXES.get(prefijo)
