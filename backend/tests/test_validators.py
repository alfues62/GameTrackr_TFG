"""Tests del validador de dominio de email (registros MX/A/AAAA).

No hacen consultas DNS reales: se mockea `_has_record`. La comprobación es
configurable mediante `VALIDATE_EMAIL_DOMAIN` (desactivada en los settings de test,
así que aquí se activa explícitamente).
"""
from unittest.mock import patch

import dns.exception
import pytest
from django.core.exceptions import ValidationError

from apps.core.validators import validate_email_domain


def test_disabled_by_setting_skips_validation(settings):
    settings.VALIDATE_EMAIL_DOMAIN = False
    # Con la validación apagada no consulta DNS ni lanza, aunque el dominio no exista.
    validate_email_domain("quien@dominio-inventado.zzz")


def test_valid_domain_passes(settings):
    settings.VALIDATE_EMAIL_DOMAIN = True
    with patch("apps.core.validators._has_record", side_effect=lambda domain, rdtype: rdtype == "MX"):
        validate_email_domain("alguien@gmail.com")  # tiene MX → no lanza


def test_invalid_domain_raises(settings):
    settings.VALIDATE_EMAIL_DOMAIN = True
    with patch("apps.core.validators._has_record", return_value=False):
        with pytest.raises(ValidationError):
            validate_email_domain("alguien@dominio-inexistente.zzz")


def test_dns_exception_does_not_block(settings):
    """Un fallo temporal de DNS (timeout, sin servidores) no bloquea el registro."""
    settings.VALIDATE_EMAIL_DOMAIN = True
    with patch("apps.core.validators._has_record", side_effect=dns.exception.DNSException):
        validate_email_domain("alguien@gmail.com")  # no lanza
