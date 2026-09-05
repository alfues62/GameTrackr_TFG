"""
Ajustes de producción: heredan de base y endurecen la configuración.

Activar con  DJANGO_SETTINGS_MODULE=config.settings.production.

Diferencias clave respecto a desarrollo:
- DEBUG=False y ALLOWED_HOSTS obligatorio desde el entorno.
- Base de datos vía DATABASE_URL (dj-database-url); si no se define, se usa
  la configuración por POSTGRES_* heredada de base (útil en Docker Compose).
- WhiteNoise sirve los estáticos comprimidos sin necesidad de Nginx.
- Cabeceras de seguridad (HSTS, cookies seguras, SSL redirect) configurables.
"""

import dj_database_url
from decouple import Csv, config

from .base import *  # noqa: F401,F403

# -----------------------------------------------------------------------------
# Seguridad básica
# -----------------------------------------------------------------------------
DEBUG = False

# Sin default permisivo: en producción hay que declarar los hosts explícitamente.
ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=Csv())

CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default='', cast=Csv())


# -----------------------------------------------------------------------------
# Base de datos: DATABASE_URL tiene prioridad; si no, se mantiene POSTGRES_* de base.
# -----------------------------------------------------------------------------
_database_url = config('DATABASE_URL', default='')
if _database_url:
    DATABASES['default'] = dj_database_url.parse(  # noqa: F405
        _database_url,
        conn_max_age=600,
        ssl_require=config('DATABASE_SSL_REQUIRE', default=False, cast=bool),
    )


# -----------------------------------------------------------------------------
# Estáticos con WhiteNoise (comprimidos + manifest con hash).
# El middleware va justo después de SecurityMiddleware.
# -----------------------------------------------------------------------------
MIDDLEWARE.insert(  # noqa: F405
    MIDDLEWARE.index('django.middleware.security.SecurityMiddleware') + 1,  # noqa: F405
    'whitenoise.middleware.WhiteNoiseMiddleware',
)

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}


# -----------------------------------------------------------------------------
# Cabeceras de seguridad (ajustables por entorno; activarlas tras servir por HTTPS).
# -----------------------------------------------------------------------------
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=True, cast=bool)
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=True, cast=bool)

SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
