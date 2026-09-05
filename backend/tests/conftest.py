"""
Fixtures compartidas por la suite de pytest-django.

La configuración (BD sqlite en memoria, sin validación DNS, caché local) vive en
config/settings/test.py, seleccionada por pytest.ini.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core.models import Game, UserGame

User = get_user_model()


@pytest.fixture
def api():
    """Cliente DRF sin autenticar."""
    return APIClient()


@pytest.fixture
def make_user(db):
    """Factory de usuarios. Uso: make_user() o make_user(username=..., email=...)."""
    counter = {"n": 0}

    def _make(username=None, email=None, password="Passw0rd!123"):
        counter["n"] += 1
        n = counter["n"]
        username = username or f"user{n}"
        email = email or f"{username}@gmail.com"
        return User.objects.create_user(username=username, email=email, password=password)

    return _make


@pytest.fixture
def user(make_user):
    return make_user(username="alice", email="alice@gmail.com")


@pytest.fixture
def other_user(make_user):
    return make_user(username="bob", email="bob@gmail.com")


@pytest.fixture
def auth_client(api, user):
    """Cliente DRF autenticado como `user`."""
    api.force_authenticate(user=user)
    return api


@pytest.fixture
def make_game(db):
    """Factory de juegos locales (catálogo). igdb_id autoincremental si no se indica."""
    counter = {"n": 1000}

    def _make(igdb_id=None, title=None, **kwargs):
        counter["n"] += 1
        igdb_id = igdb_id if igdb_id is not None else counter["n"]
        title = title or f"Game {igdb_id}"
        defaults = {
            "genres": kwargs.pop("genres", ["Acción"]),
            "platforms": kwargs.pop("platforms", ["PC"]),
            "igdb_rating": kwargs.pop("igdb_rating", 80),
        }
        defaults.update(kwargs)
        return Game.objects.create(igdb_id=igdb_id, title=title, **defaults)

    return _make


@pytest.fixture
def make_usergame(db):
    """Factory de entradas de biblioteca."""
    def _make(user, game, status=UserGame.Status.BACKLOG, **kwargs):
        return UserGame.objects.create(user=user, game=game, status=status, **kwargs)

    return _make
