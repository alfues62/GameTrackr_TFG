"""
Ajustes para la suite de tests (pytest-django).

- Base de datos SQLite en memoria: rápida y sin dependencias externas.
- Sin validación DNS del email (tests offline).
- Caché en memoria local (no requiere Redis).
- Hasher rápido para acelerar la creación de usuarios.
"""

import tempfile

from .base import *  # noqa: F401,F403

DEBUG = False

# Media a un directorio temporal para no ensuciar el repo durante los tests.
MEDIA_ROOT = tempfile.mkdtemp(prefix='gametrackr-test-media-')

VALIDATE_EMAIL_DOMAIN = False

ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Sin credenciales de APIs externas: los tests nunca deben tocar la red.
# (El contenedor carga el .env real; aquí se anula explícitamente.)
IGDB_CLIENT_ID = ''
IGDB_CLIENT_SECRET = ''
STEAM_API_KEY = ''

# Sin hilos de sincronización automática durante los tests.
STEAM_AUTO_SYNC = False
