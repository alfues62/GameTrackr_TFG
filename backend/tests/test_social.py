"""
Tests del módulo social: crear post, dar like, seguir usuario y feed de seguidos.

Los endpoints de lista/feed están paginados (PageNumberPagination) → respuesta con
clave `results`.
"""
import pytest

from apps.core.models import Friendship, Post, PostComment, PostLike
from apps.core.views import create_achievement_post

pytestmark = pytest.mark.django_db


def test_create_post(auth_client, user):
    resp = auth_client.post(
        "/api/posts/",
        {"content": "¡Acabo de terminar Elden Ring!", "post_type": "general"},
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["content"] == "¡Acabo de terminar Elden Ring!"
    assert body["user"]["id"] == user.id
    assert Post.objects.filter(user=user).count() == 1


def test_like_post(auth_client, user, other_user):
    post = Post.objects.create(user=other_user, content="Hola mundo")
    resp = auth_client.post(f"/api/posts/{post.id}/like/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["liked"] is True
    assert body["likes_count"] == 1
    assert PostLike.objects.filter(post=post, user=user).exists()


def test_unlike_post(auth_client, user, other_user):
    post = Post.objects.create(user=other_user, content="Hola mundo")
    PostLike.objects.create(post=post, user=user)
    resp = auth_client.delete(f"/api/posts/{post.id}/like/")
    assert resp.status_code == 200
    assert resp.json()["liked"] is False
    assert not PostLike.objects.filter(post=post, user=user).exists()


def test_follow_user(auth_client, user, other_user):
    resp = auth_client.post(f"/api/social/follow/{other_user.id}/")
    assert resp.status_code == 200
    assert resp.json()["following"] is True
    assert Friendship.objects.filter(
        from_user=user, to_user=other_user, status=Friendship.Status.ACCEPTED
    ).exists()


def test_cannot_follow_self(auth_client, user):
    resp = auth_client.post(f"/api/social/follow/{user.id}/")
    assert resp.status_code == 400


# --- Comentarios ------------------------------------------------------------
def test_comment_on_post(auth_client, user, other_user):
    post = Post.objects.create(user=other_user, content="Hola")
    resp = auth_client.post(
        f"/api/posts/{post.id}/comments/", {"content": "¡Buen aporte!"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.json()["content"] == "¡Buen aporte!"
    assert PostComment.objects.filter(post=post, user=user).exists()


def test_list_comments(auth_client, user, other_user):
    post = Post.objects.create(user=other_user, content="Hola")
    PostComment.objects.create(post=post, user=user, content="uno")
    PostComment.objects.create(post=post, user=other_user, content="dos")

    resp = auth_client.get(f"/api/posts/{post.id}/comments/")
    assert resp.status_code == 200
    contents = {c["content"] for c in resp.json()}
    assert contents == {"uno", "dos"}


def test_empty_comment_is_rejected(auth_client, other_user):
    post = Post.objects.create(user=other_user, content="Hola")
    resp = auth_client.post(
        f"/api/posts/{post.id}/comments/", {"content": "   "}, format="json"
    )
    assert resp.status_code == 400


# --- Respuestas anidadas (un nivel, estilo YouTube) --------------------------
def test_reply_to_comment(auth_client, user, other_user):
    post = Post.objects.create(user=other_user, content="Hola")
    top = PostComment.objects.create(post=post, user=other_user, content="raíz")

    resp = auth_client.post(
        f"/api/posts/{post.id}/comments/", {"content": "respuesta", "parent": top.id}, format="json"
    )
    assert resp.status_code == 201
    assert resp.json()["parent"] == top.id
    assert PostComment.objects.filter(post=post, user=user, parent=top).exists()


def test_top_level_listing_excludes_replies(auth_client, other_user):
    post = Post.objects.create(user=other_user, content="Hola")
    top = PostComment.objects.create(post=post, user=other_user, content="raíz")
    PostComment.objects.create(post=post, user=other_user, content="respuesta", parent=top)

    resp = auth_client.get(f"/api/posts/{post.id}/comments/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == top.id
    assert data[0]["replies_count"] == 1


def test_list_replies_of_a_comment(auth_client, other_user):
    post = Post.objects.create(user=other_user, content="Hola")
    top = PostComment.objects.create(post=post, user=other_user, content="raíz")
    PostComment.objects.create(post=post, user=other_user, content="respuesta uno", parent=top)
    PostComment.objects.create(post=post, user=other_user, content="respuesta dos", parent=top)

    resp = auth_client.get(f"/api/posts/{post.id}/comments/", {"parent": top.id})
    assert resp.status_code == 200
    contents = {c["content"] for c in resp.json()}
    assert contents == {"respuesta uno", "respuesta dos"}


def test_cannot_reply_to_a_reply(auth_client, other_user):
    """Un solo nivel de anidación: el padre indicado debe ser de primer nivel."""
    post = Post.objects.create(user=other_user, content="Hola")
    top = PostComment.objects.create(post=post, user=other_user, content="raíz")
    reply = PostComment.objects.create(post=post, user=other_user, content="respuesta", parent=top)

    resp = auth_client.post(
        f"/api/posts/{post.id}/comments/", {"content": "otra", "parent": reply.id}, format="json"
    )
    assert resp.status_code == 400


def test_feed_includes_followed_users_posts(auth_client, user, other_user, make_user):
    """El feed 'following' incluye los posts de los seguidos y excluye a los no seguidos."""
    stranger = make_user(username="stranger", email="stranger@gmail.com")

    followed_post = Post.objects.create(user=other_user, content="Post de un seguido")
    stranger_post = Post.objects.create(user=stranger, content="Post de un desconocido")

    # `user` sigue a other_user (no a stranger).
    Friendship.objects.create(
        from_user=user, to_user=other_user, status=Friendship.Status.ACCEPTED
    )

    resp = auth_client.get("/api/posts/feed/?scope=following")
    assert resp.status_code == 200
    contents = [p["content"] for p in resp.json()["results"]]
    assert "Post de un seguido" in contents
    assert "Post de un desconocido" not in contents


# ---------------------------------------------------------------------------
# Privacidad del perfil público (is_public_profile)
# ---------------------------------------------------------------------------
def test_public_profile_visible_to_others(auth_client, other_user, make_game, make_usergame):
    """Un perfil público muestra la identidad y las stats a otro usuario."""
    make_usergame(other_user, make_game(), status="completed", hours_played=5)
    resp = auth_client.get(f"/api/social/users/{other_user.username}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_private"] is False
    assert body["stats"] is not None
    assert body["stats"]["total_games"] == 1
    assert body["stats"]["completed_games"] == 1


def test_private_profile_hidden_from_others(auth_client, other_user, make_game, make_usergame):
    """Un perfil privado oculta stats y bio a terceros, pero conserva la cabecera."""
    make_usergame(other_user, make_game(), status="completed")
    other_user.is_public_profile = False
    other_user.bio = "secreto"
    other_user.save(update_fields=["is_public_profile", "bio"])
    resp = auth_client.get(f"/api/social/users/{other_user.username}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_private"] is True
    assert body["stats"] is None
    assert body["user"]["username"] == other_user.username
    assert body["user"]["bio"] is None


def test_private_profile_visible_to_owner(auth_client, user, make_game, make_usergame):
    """El dueño ve siempre su propio perfil completo, aunque sea privado."""
    make_usergame(user, make_game())
    user.is_public_profile = False
    user.save(update_fields=["is_public_profile"])
    resp = auth_client.get(f"/api/social/users/{user.username}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_private"] is False
    assert body["stats"] is not None
    assert body["stats"]["total_games"] == 1


def test_users_list_endpoint_removed(auth_client):
    """El endpoint /api/users/ (que filtraba emails) ya no existe."""
    assert auth_client.get("/api/users/").status_code == 404


# ---------------------------------------------------------------------------
# Rendimiento del feed (sin N+1) y contadores anotados
# ---------------------------------------------------------------------------
def test_feed_avoids_n_plus_1(auth_client, user, other_user, django_assert_max_num_queries):
    """El feed sirve likes/comentarios/is_liked con un nº de consultas constante,
    independientemente del número de posts (antes eran 3 queries por post)."""
    Friendship.objects.create(
        from_user=user, to_user=other_user, status=Friendship.Status.ACCEPTED
    )
    for i in range(5):
        post = Post.objects.create(user=other_user, content=f"post {i}")
        PostLike.objects.create(post=post, user=user)

    with django_assert_max_num_queries(8):
        resp = auth_client.get("/api/posts/feed/?scope=following")

    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 5
    assert all(p["likes_count"] == 1 for p in results)
    assert all(p["comments_count"] == 0 for p in results)
    assert all(p["is_liked"] is True for p in results)


# ---------------------------------------------------------------------------
# Texto del auto-post de logro
# ---------------------------------------------------------------------------
def test_achievement_post_says_100_when_fully_completed(user, make_game, make_usergame):
    ug = make_usergame(user, make_game(title="Hollow Knight"), completion_percentage=100)
    create_achievement_post(ug)
    post = Post.objects.get(user=user, post_type=Post.PostType.ACHIEVEMENT)
    assert post.content == "Ha completado Hollow Knight al 100%"


def test_achievement_post_omits_100_when_status_completed_below_100(user, make_game, make_usergame):
    ug = make_usergame(
        user, make_game(title="Celeste"), status="completed", completion_percentage=40
    )
    create_achievement_post(ug)
    post = Post.objects.get(user=user, post_type=Post.PostType.ACHIEVEMENT)
    assert post.content == "Ha completado Celeste"
    assert "100%" not in post.content


def test_feed_defaults_to_the_whole_community(auth_client, user, other_user, make_game):
    """La comunidad tiene un unico feed: sin scope se ve a todo el mundo."""
    Post.objects.create(user=other_user, content="De alguien a quien no sigo")
    Post.objects.create(user=user, content="Mio")

    contenidos = [p["content"] for p in auth_client.get("/api/posts/feed/").json()["results"]]

    assert "De alguien a quien no sigo" in contenidos
    assert "Mio" in contenidos
