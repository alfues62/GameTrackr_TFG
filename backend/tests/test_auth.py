"""
Tests de autenticación: registro, login, token, /me/ y login social (Google) mockeado.
"""
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model

from apps.core.pipeline import issue_jwt_and_redirect, set_avatar_from_google

User = get_user_model()

pytestmark = pytest.mark.django_db


# --- Registro ---------------------------------------------------------------
def test_register_creates_user_and_returns_tokens(api):
    resp = api.post(
        "/api/auth/register/",
        {"email": "nuevo@gmail.com", "password": "Sup3rPass!2024"},
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "access" in body and "refresh" in body
    assert body["user"]["email"] == "nuevo@gmail.com"
    # El username se deriva del email cuando no se envía.
    assert body["user"]["username"] == "nuevo"
    assert User.objects.filter(email="nuevo@gmail.com").exists()


def test_register_rejects_duplicate_email(api, make_user):
    make_user(email="dup@gmail.com")
    resp = api.post(
        "/api/auth/register/",
        {"email": "dup@gmail.com", "password": "Sup3rPass!2024"},
        format="json",
    )
    assert resp.status_code == 400


def test_register_rejects_weak_password(api):
    resp = api.post(
        "/api/auth/register/",
        {"email": "weak@gmail.com", "password": "123"},
        format="json",
    )
    assert resp.status_code == 400


# --- Login ------------------------------------------------------------------
def test_login_returns_tokens(api, make_user):
    make_user(email="log@gmail.com", password="Sup3rPass!2024")
    resp = api.post(
        "/api/auth/login/",
        {"email": "log@gmail.com", "password": "Sup3rPass!2024"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access"] and body["refresh"]
    assert body["user"]["email"] == "log@gmail.com"


def test_login_wrong_password_fails(api, make_user):
    make_user(email="log2@gmail.com", password="Sup3rPass!2024")
    resp = api.post(
        "/api/auth/login/",
        {"email": "log2@gmail.com", "password": "incorrecta"},
        format="json",
    )
    assert resp.status_code == 400


# --- /me/ y token -----------------------------------------------------------
def test_me_requires_authentication(api):
    assert api.get("/api/auth/me/").status_code == 401


def test_me_returns_current_user(api, make_user):
    make_user(email="me@gmail.com", password="Sup3rPass!2024")
    login = api.post(
        "/api/auth/login/",
        {"email": "me@gmail.com", "password": "Sup3rPass!2024"},
        format="json",
    ).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
    resp = api.get("/api/auth/me/")
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@gmail.com"


def test_token_refresh_returns_new_access(api, make_user):
    make_user(email="ref@gmail.com", password="Sup3rPass!2024")
    login = api.post(
        "/api/auth/login/",
        {"email": "ref@gmail.com", "password": "Sup3rPass!2024"},
        format="json",
    ).json()
    resp = api.post(
        "/api/auth/token/refresh/",
        {"refresh": login["refresh"]},
        format="json",
    )
    assert resp.status_code == 200
    assert "access" in resp.json()


# --- Cambio de contraseña ---------------------------------------------------
def test_change_password_requires_authentication(api):
    resp = api.post(
        "/api/auth/password/",
        {"current_password": "x", "new_password": "y"},
        format="json",
    )
    assert resp.status_code == 401


def test_change_password_success_allows_login_with_new(api, make_user):
    make_user(email="pwd@gmail.com", password="Sup3rPass!2024")
    login = api.post(
        "/api/auth/login/",
        {"email": "pwd@gmail.com", "password": "Sup3rPass!2024"},
        format="json",
    ).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
    resp = api.post(
        "/api/auth/password/",
        {"current_password": "Sup3rPass!2024", "new_password": "Otr4Cl4ve!99"},
        format="json",
    )
    assert resp.status_code == 200

    # La nueva contraseña permite iniciar sesión (la antigua ya no).
    api.credentials()
    relogin = api.post(
        "/api/auth/login/",
        {"email": "pwd@gmail.com", "password": "Otr4Cl4ve!99"},
        format="json",
    )
    assert relogin.status_code == 200


def test_change_password_wrong_current_fails(auth_client):
    resp = auth_client.post(
        "/api/auth/password/",
        {"current_password": "incorrecta", "new_password": "Otr4Cl4ve!99"},
        format="json",
    )
    assert resp.status_code == 400


def test_change_password_rejects_weak_new(auth_client):
    # auth_client está autenticado como `user` (contraseña por defecto Passw0rd!123).
    resp = auth_client.post(
        "/api/auth/password/",
        {"current_password": "Passw0rd!123", "new_password": "123"},
        format="json",
    )
    assert resp.status_code == 400


# --- Errores del login social → redirección con código ----------------------
def test_social_auth_errors_redirect_to_frontend_with_code():
    from social_core.exceptions import AuthAlreadyAssociated, AuthCanceled

    from apps.core.middleware import SocialAuthErrorRedirectMiddleware

    mw = SocialAuthErrorRedirectMiddleware(lambda request: None)

    resp = mw.process_exception(None, AuthAlreadyAssociated(MagicMock()))
    assert resp.status_code == 302
    assert "/login?social_error=already_associated" in resp.url

    resp = mw.process_exception(None, AuthCanceled(MagicMock()))
    assert "social_error=cancelled" in resp.url

    # Las excepciones ajenas al login social no se tocan.
    assert mw.process_exception(None, ValueError("otra cosa")) is None


# --- Login con Google (pipeline mockeado) -----------------------------------
def test_google_pipeline_sets_avatar(make_user):
    """El paso del pipeline copia la foto de Google al avatar si está vacío."""
    user = make_user(email="goog@gmail.com")
    assert not user.avatar_url

    backend = MagicMock()
    backend.name = "google-oauth2"
    response = {"picture": "https://lh3.googleusercontent.com/foto.jpg"}

    set_avatar_from_google(backend=backend, user=user, response=response)

    user.refresh_from_db()
    assert user.avatar_url == "https://lh3.googleusercontent.com/foto.jpg"


def test_google_pipeline_issues_jwt_and_redirects(make_user):
    """El paso final emite los JWT y redirige al frontend con ?access=&refresh=."""
    user = make_user(email="goog2@gmail.com")
    strategy = MagicMock()

    result = issue_jwt_and_redirect(strategy=strategy, user=user)

    # Es un redirect (302) hacia /auth/social con los tokens en la query.
    assert result.status_code == 302
    assert "/auth/social?" in result.url
    assert "access=" in result.url and "refresh=" in result.url
