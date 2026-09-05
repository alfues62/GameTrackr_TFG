"""
Validación de correos electrónicos a nivel de dominio, y reglas de negocio de
la biblioteca (p. ej. qué estados puede tener un juego sin publicar aún).

Comprueba que el dominio del email existe y es capaz de recibir correo
(tiene registros MX, o como fallback un registro A/AAAA). No verifica que el
buzón concreto exista —para eso haría falta un email de confirmación—, pero
descarta dominios inventados como "2.com" sin servidor de correo.
"""
from datetime import date

import dns.exception
import dns.resolver
from django.conf import settings
from django.core.exceptions import ValidationError


def _has_record(domain: str, rdtype: str) -> bool:
    try:
        return len(dns.resolver.resolve(domain, rdtype, lifetime=5)) > 0
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        return False


def validate_email_domain(value: str) -> None:
    """Lanza ValidationError si el dominio del email no puede recibir correo."""
    if not getattr(settings, "VALIDATE_EMAIL_DOMAIN", True):
        return

    domain = value.rsplit("@", 1)[-1].strip().lower()
    if not domain:
        raise ValidationError("Correo electrónico no válido.")

    try:
        if _has_record(domain, "MX") or _has_record(domain, "A") or _has_record(domain, "AAAA"):
            return
    except dns.exception.DNSException:
        # Fallo temporal de DNS (timeout, sin servidores): no bloqueamos el registro.
        return

    raise ValidationError(
        'El dominio "%(domain)s" no existe o no puede recibir correos.',
        params={"domain": domain},
        code="invalid_email_domain",
    )


def game_not_released(game) -> bool:
    """True si el juego tiene una fecha de lanzamiento confirmada y es futura.

    Sin fecha (`release_date` nulo) NO se considera "aún no publicado": IGDB
    no siempre trae esa fecha aunque el juego ya lleve años a la venta, así
    que tratarlo como no publicado bloquearía sin motivo juegos ya reales.
    Solo se restringe cuando hay una fecha concreta todavía por llegar.
    """
    return game.release_date is not None and game.release_date > date.today()
