"""Tests del endpoint de subida de imágenes (/api/uploads/)."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

pytestmark = pytest.mark.django_db


def _img(name="avatar.png", content=b"fake-image-bytes", content_type="image/png"):
    return SimpleUploadedFile(name, content, content_type=content_type)


def test_upload_requires_auth(api):
    resp = api.post("/api/uploads/", {"file": _img()}, format="multipart")
    assert resp.status_code == 401


def test_upload_image_returns_url(auth_client):
    resp = auth_client.post("/api/uploads/", {"file": _img()}, format="multipart")
    assert resp.status_code == 201
    url = resp.json()["url"]
    assert "/media/uploads/" in url
    assert url.endswith(".png")


def test_upload_rejects_non_image(auth_client):
    bad = _img(name="notes.txt", content=b"hello", content_type="text/plain")
    resp = auth_client.post("/api/uploads/", {"file": bad}, format="multipart")
    assert resp.status_code == 400


def test_upload_rejects_too_large(auth_client, settings):
    settings.MAX_UPLOAD_SIZE = 10  # 10 bytes
    big = _img(content=b"x" * 50)
    resp = auth_client.post("/api/uploads/", {"file": big}, format="multipart")
    assert resp.status_code == 400


def test_upload_without_file(auth_client):
    resp = auth_client.post("/api/uploads/", {}, format="multipart")
    assert resp.status_code == 400
