"""
Ajustes base de GameTrackr (config project), comunes a todos los entornos.

Las variables sensibles se leen del entorno mediante python-decouple
(ver .env.example en la raíz del repositorio). Los entornos concretos
(development / production / test) heredan de este módulo.
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# Este módulo vive en config/settings/base.py, así que subimos tres niveles
# (settings -> config -> backend) para apuntar a la raíz del proyecto backend.
BASE_DIR = Path(__file__).resolve().parents[2]


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,backend', cast=Csv())

# Comprobar por DNS que el dominio del email existe al registrarse.
# Desactívalo en entornos sin acceso a DNS o en tests offline.
VALIDATE_EMAIL_DOMAIN = config('VALIDATE_EMAIL_DOMAIN', default=True, cast=bool)


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Terceros
    'rest_framework',
    'corsheaders',
    'social_django',

    # Apps propias
    'apps.core',
    'apps.igdb',
    'apps.steam',
    'apps.psn',
    'apps.recommendations',
]

AUTH_USER_MODEL = 'core.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Errores del login social → redirección a /login del frontend con código.
    'apps.core.middleware.SocialAuthErrorRedirectMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                # social-auth
                'social_django.context_processors.backends',
                'social_django.context_processors.login_redirect',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database (PostgreSQL vía variables de entorno)
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB', default='gametrackr'),
        'USER': config('POSTGRES_USER', default='gametrackr'),
        'PASSWORD': config('POSTGRES_PASSWORD', default='gametrackr'),
        'HOST': config('POSTGRES_HOST', default='postgres'),
        'PORT': config('POSTGRES_PORT', default='5432'),
    }
}


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# Internationalization

LANGUAGE_CODE = 'es-es'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media (ficheros subidos por los usuarios: avatares, portadas, imágenes de post).
# En desarrollo se sirven vía config.urls; el volumen ./backend:/app los persiste.
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Tamaño máximo aceptado en subidas de imagen (bytes).
MAX_UPLOAD_SIZE = config('MAX_UPLOAD_SIZE', default=5 * 1024 * 1024, cast=int)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# -----------------------------------------------------------------------------
# Caché (django-redis). Compartida entre los workers de gunicorn en producción.
# Se usa para el token de Twitch y para cachear las respuestas de IGDB (TTL 1h).
# Los entornos pueden sobreescribir esto (p.ej. tests usan LocMemCache).
# -----------------------------------------------------------------------------
REDIS_URL = config('REDIS_URL', default='redis://redis:6379/1')

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'IGNORE_EXCEPTIONS': True,  # si Redis cae, la app sigue (sin caché)
        },
        'KEY_PREFIX': 'gametrackr',
    }
}

# TTL por defecto (segundos) para las respuestas cacheadas de IGDB.
IGDB_CACHE_TTL = config('IGDB_CACHE_TTL', default=3600, cast=int)


# -----------------------------------------------------------------------------
# Django REST Framework + SimpleJWT
# -----------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardPageNumberPagination',
    'PAGE_SIZE': 20,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
}


# -----------------------------------------------------------------------------
# CORS (django-cors-headers)
# -----------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000',
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True


# -----------------------------------------------------------------------------
# Autenticación social (social-auth-app-django): Google + Steam
# -----------------------------------------------------------------------------
AUTHENTICATION_BACKENDS = (
    'social_core.backends.google.GoogleOAuth2',
    'social_core.backends.steam.SteamOpenId',
    'django.contrib.auth.backends.ModelBackend',
)

# Google OAuth2
SOCIAL_AUTH_GOOGLE_OAUTH2_KEY = config('GOOGLE_CLIENT_ID', default='')
SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET = config('GOOGLE_CLIENT_SECRET', default='')
SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS = {'prompt': 'select_account'}

# Steam (usa la Web API Key)
SOCIAL_AUTH_STEAM_API_KEY = config('STEAM_API_KEY', default='')

SOCIAL_AUTH_JSONFIELD_ENABLED = True
LOGIN_REDIRECT_URL = config('NEXTAUTH_URL', default='http://localhost:3000')

# URL del frontend a la que se redirige tras el login social (con los JWT).
SOCIAL_AUTH_FRONTEND_URL = config('NEXTAUTH_URL', default='http://localhost:3000')

# Pipeline: el flujo estándar de social-auth + pasos propios (vincular Steam,
# copiar avatar de Google y, como paso final, emitir JWT y redirigir al frontend).
SOCIAL_AUTH_PIPELINE = (
    'social_core.pipeline.social_auth.social_details',
    'social_core.pipeline.social_auth.social_uid',
    'social_core.pipeline.social_auth.auth_allowed',
    'social_core.pipeline.social_auth.social_user',
    # Si el email (verificado por Google) coincide con una cuenta existente,
    # vincula el login social a esa cuenta en vez de intentar crear un
    # duplicado (el email es único → AuthAlreadyAssociated). Steam no expone
    # email, así que este paso no le afecta.
    'social_core.pipeline.social_auth.associate_by_email',
    # Steam sin vincular: pausa y pregunta (vincular a cuenta existente o crear).
    'apps.core.pipeline.ask_steam_account_link',
    'social_core.pipeline.user.get_username',
    'social_core.pipeline.user.create_user',
    'social_core.pipeline.social_auth.associate_user',
    'social_core.pipeline.social_auth.load_extra_data',
    'social_core.pipeline.user.user_details',
    'apps.core.pipeline.link_steam_account',
    'apps.core.pipeline.set_avatar_from_google',
    'apps.core.pipeline.issue_jwt_and_redirect',
)


# -----------------------------------------------------------------------------
# Integraciones externas (IGDB)
# -----------------------------------------------------------------------------
IGDB_CLIENT_ID = config('IGDB_CLIENT_ID', default='')
IGDB_CLIENT_SECRET = config('IGDB_CLIENT_SECRET', default='')

# Steamworks Web API
STEAM_API_KEY = config('STEAM_API_KEY', default='')

