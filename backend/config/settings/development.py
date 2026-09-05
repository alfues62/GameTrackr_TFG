"""
Ajustes de desarrollo: heredan de base y activan DEBUG por defecto.

Es el módulo de settings por defecto en local y en Docker Compose
(DJANGO_SETTINGS_MODULE=config.settings.development).
"""

from decouple import config

from .base import *  # noqa: F401,F403

DEBUG = config('DEBUG', default=True, cast=bool)
