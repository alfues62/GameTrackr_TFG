"""Tests de las listas personalizadas (GameList): creación, visibilidad
pública/privada y añadir/quitar juegos.

Los endpoints de lista están paginados (respuesta con clave `results`). Añadir un
juego resuelve el `igdb_id` con `get_or_fetch_game`; se pre-cachea el juego local
para no tocar IGDB.
"""
import pytest

from apps.core.models import Game, GameList, GameListComment, GameListLike, Post

pytestmark = pytest.mark.django_db


def test_create_list(auth_client, user):
    resp = auth_client.post(
        "/api/lists/", {"name": "Para rejugar", "is_public": True}, format="json"
    )
    assert resp.status_code == 201
    assert GameList.objects.filter(user=user, name="Para rejugar").exists()


def test_list_shows_own_and_public_hides_others_private(auth_client, user, other_user):
    mine = GameList.objects.create(user=user, name="Mía", is_public=False)
    others_public = GameList.objects.create(user=other_user, name="Pública ajena", is_public=True)
    others_private = GameList.objects.create(user=other_user, name="Privada ajena", is_public=False)

    ids = {l["id"] for l in auth_client.get("/api/lists/").json()["results"]}
    assert mine.id in ids
    assert others_public.id in ids
    assert others_private.id not in ids  # la privada ajena no se ve


def test_add_game_to_list(auth_client, user, make_game):
    make_game(igdb_id=555, title="Hollow Knight")
    lst = GameList.objects.create(user=user, name="Metroidvanias")

    resp = auth_client.post(f"/api/lists/{lst.id}/games/", {"igdb_id": 555}, format="json")
    assert resp.status_code == 200
    assert lst.games.filter(igdb_id=555).exists()


def test_remove_game_from_list(auth_client, user, make_game):
    game = make_game(igdb_id=556)
    lst = GameList.objects.create(user=user, name="X")
    lst.games.add(game)

    resp = auth_client.delete(f"/api/lists/{lst.id}/games/{game.id}/")
    assert resp.status_code == 204
    assert not lst.games.filter(id=game.id).exists()


def test_cannot_add_game_to_another_users_list(auth_client, other_user, make_game):
    """Una lista pública ajena es visible pero no modificable (IsOwnerOrReadOnly)."""
    make_game(igdb_id=557)
    others_public = GameList.objects.create(user=other_user, name="Ajena pública", is_public=True)

    resp = auth_client.post(f"/api/lists/{others_public.id}/games/", {"igdb_id": 557}, format="json")
    assert resp.status_code == 403
    assert others_public.games.count() == 0


# --- Comentarios ------------------------------------------------------------
def test_comment_on_others_public_list(auth_client, user, other_user):
    """Comentar no exige ser el dueño de la lista, solo poder verla (IsOwnerOrReadOnly no aplica aquí)."""
    lst = GameList.objects.create(user=other_user, name="Pública ajena", is_public=True)
    resp = auth_client.post(f"/api/lists/{lst.id}/comments/", {"content": "¡Buena selección!"}, format="json")
    assert resp.status_code == 201
    assert resp.json()["content"] == "¡Buena selección!"
    assert GameListComment.objects.filter(game_list=lst, user=user).exists()


def test_list_comments_on_list(auth_client, user, other_user):
    lst = GameList.objects.create(user=user, name="Mía", is_public=True)
    GameListComment.objects.create(game_list=lst, user=user, content="uno")
    GameListComment.objects.create(game_list=lst, user=other_user, content="dos")

    resp = auth_client.get(f"/api/lists/{lst.id}/comments/")
    assert resp.status_code == 200
    contents = {c["content"] for c in resp.json()}
    assert contents == {"uno", "dos"}


def test_empty_list_comment_is_rejected(auth_client, user):
    lst = GameList.objects.create(user=user, name="Mía", is_public=True)
    resp = auth_client.post(f"/api/lists/{lst.id}/comments/", {"content": "   "}, format="json")
    assert resp.status_code == 400


def test_cannot_comment_on_others_private_list(auth_client, other_user):
    """Una lista privada ajena no es visible, así que tampoco se puede comentar (404)."""
    lst = GameList.objects.create(user=other_user, name="Privada ajena", is_public=False)
    resp = auth_client.post(f"/api/lists/{lst.id}/comments/", {"content": "hola"}, format="json")
    assert resp.status_code == 404


def test_reply_to_list_comment(auth_client, user, other_user):
    lst = GameList.objects.create(user=other_user, name="Pública ajena", is_public=True)
    top = GameListComment.objects.create(game_list=lst, user=other_user, content="raíz")

    resp = auth_client.post(
        f"/api/lists/{lst.id}/comments/", {"content": "respuesta", "parent": top.id}, format="json"
    )
    assert resp.status_code == 201
    assert resp.json()["parent"] == top.id

    top_level = auth_client.get(f"/api/lists/{lst.id}/comments/").json()
    assert len(top_level) == 1
    assert top_level[0]["replies_count"] == 1


# ---------------------------------------------------------------------------
# Borrado de listas: que no queden restos ni se lleve por delante el catalogo
# ---------------------------------------------------------------------------
def test_owner_can_delete_list(auth_client, user):
    lst = GameList.objects.create(user=user, name="Temporal")

    resp = auth_client.delete(f"/api/lists/{lst.id}/")

    assert resp.status_code == 204
    assert not GameList.objects.filter(pk=lst.pk).exists()


def test_deleting_a_list_removes_its_comments(auth_client, user, other_user):
    lst = GameList.objects.create(user=user, name="Con debate")
    padre = GameListComment.objects.create(game_list=lst, user=other_user, content="Buena")
    GameListComment.objects.create(game_list=lst, user=user, parent=padre, content="Gracias")

    auth_client.delete(f"/api/lists/{lst.id}/")

    assert not GameListComment.objects.filter(game_list_id=lst.pk).exists()


def test_deleting_a_list_keeps_the_games_in_the_catalogue(auth_client, user, make_game):
    """Se limpia la relacion, pero los juegos son catalogo compartido."""
    game = make_game(igdb_id=600, title="Hades")
    lst = GameList.objects.create(user=user, name="Roguelikes")
    lst.games.add(game)
    through = GameList.games.through

    auth_client.delete(f"/api/lists/{lst.id}/")

    assert not through.objects.filter(gamelist_id=lst.pk).exists()
    assert Game.objects.filter(pk=game.pk).exists()


def test_deleting_a_list_does_not_touch_other_lists(auth_client, user, make_game):
    game = make_game(igdb_id=601)
    borrada = GameList.objects.create(user=user, name="Se va")
    superviviente = GameList.objects.create(user=user, name="Se queda")
    borrada.games.add(game)
    superviviente.games.add(game)

    auth_client.delete(f"/api/lists/{borrada.id}/")

    assert GameList.objects.filter(pk=superviviente.pk).exists()
    assert superviviente.games.filter(pk=game.pk).exists()


def test_cannot_delete_another_users_list(auth_client, other_user):
    """Una lista publica ajena se ve, pero no se borra (IsOwnerOrReadOnly)."""
    ajena = GameList.objects.create(user=other_user, name="Ajena", is_public=True)

    resp = auth_client.delete(f"/api/lists/{ajena.id}/")

    assert resp.status_code == 403
    assert GameList.objects.filter(pk=ajena.pk).exists()


def test_deleting_a_private_list_of_another_user_returns_404(auth_client, other_user):
    """La privada ajena ni siquiera es visible: no se filtra su existencia."""
    ajena = GameList.objects.create(user=other_user, name="Secreta", is_public=False)

    resp = auth_client.delete(f"/api/lists/{ajena.id}/")

    assert resp.status_code == 404
    assert GameList.objects.filter(pk=ajena.pk).exists()


def test_deleting_the_user_removes_their_lists(user, make_game):
    """Las listas cuelgan del usuario en cascada: no quedan huerfanas."""
    game = make_game(igdb_id=602)
    lst = GameList.objects.create(user=user, name="Mia")
    lst.games.add(game)

    user.delete()

    assert not GameList.objects.filter(pk=lst.pk).exists()
    assert Game.objects.filter(pk=game.pk).exists()


# ---------------------------------------------------------------------------
# Me gusta sobre listas: la senal que ordena el carrusel de la comunidad
# ---------------------------------------------------------------------------
def test_like_and_unlike_a_public_list(auth_client, user, other_user):
    """Se puede votar la lista de otro: no hace falta ser el dueno."""
    ajena = GameList.objects.create(user=other_user, name="Ajena", is_public=True)

    dado = auth_client.post(f"/api/lists/{ajena.id}/like/")
    assert dado.status_code == 200
    assert dado.json() == {"liked": True, "likes_count": 1}
    assert GameListLike.objects.filter(game_list=ajena, user=user).exists()

    quitado = auth_client.delete(f"/api/lists/{ajena.id}/like/")
    assert quitado.json() == {"liked": False, "likes_count": 0}
    assert not GameListLike.objects.filter(game_list=ajena).exists()


def test_liking_twice_counts_once(auth_client, other_user):
    ajena = GameList.objects.create(user=other_user, name="Ajena", is_public=True)

    auth_client.post(f"/api/lists/{ajena.id}/like/")
    segunda = auth_client.post(f"/api/lists/{ajena.id}/like/")

    assert segunda.json()["likes_count"] == 1


def test_cannot_like_a_private_list_of_another_user(auth_client, other_user):
    ajena = GameList.objects.create(user=other_user, name="Secreta", is_public=False)

    assert auth_client.post(f"/api/lists/{ajena.id}/like/").status_code == 404


def test_list_detail_reports_likes(auth_client, user):
    propia = GameList.objects.create(user=user, name="Mia")
    auth_client.post(f"/api/lists/{propia.id}/like/")

    body = auth_client.get(f"/api/lists/{propia.id}/").json()

    assert body["likes_count"] == 1
    assert body["is_liked"] is True


# ---------------------------------------------------------------------------
# Carrusel de listas mejor valoradas
# ---------------------------------------------------------------------------
def test_top_lists_are_ordered_by_likes(auth_client, user, other_user, make_game):
    juego = make_game(igdb_id=700)
    floja = GameList.objects.create(user=user, name="Floja", is_public=True)
    fuerte = GameList.objects.create(user=user, name="Fuerte", is_public=True)
    for lst in (floja, fuerte):
        lst.games.add(juego)
    GameListLike.objects.create(game_list=fuerte, user=user)
    GameListLike.objects.create(game_list=fuerte, user=other_user)
    GameListLike.objects.create(game_list=floja, user=other_user)

    body = auth_client.get("/api/lists/top/").json()

    assert [l["name"] for l in body] == ["Fuerte", "Floja"]
    assert body[0]["likes_count"] == 2


def test_top_lists_exclude_private_and_empty_ones(auth_client, user, make_game):
    juego = make_game(igdb_id=701)
    visible = GameList.objects.create(user=user, name="Visible", is_public=True)
    visible.games.add(juego)
    privada = GameList.objects.create(user=user, name="Privada", is_public=False)
    privada.games.add(juego)
    GameList.objects.create(user=user, name="Vacia", is_public=True)

    body = auth_client.get("/api/lists/top/").json()

    assert [l["name"] for l in body] == ["Visible"]


def test_top_list_card_carries_what_the_carousel_paints(auth_client, user, make_game):
    lst = GameList.objects.create(user=user, name="Con portadas", is_public=True)
    for i in range(6):
        lst.games.add(make_game(igdb_id=710 + i, cover_url=f"http://img/{i}.jpg"))

    tarjeta = auth_client.get("/api/lists/top/").json()[0]

    assert tarjeta["games_count"] == 6
    assert len(tarjeta["preview_covers"]) == 4  # el mosaico solo usa cuatro
    assert tarjeta["user"]["username"] == user.username


# ---------------------------------------------------------------------------
# Publicar una lista en el feed (acto deliberado del autor)
# ---------------------------------------------------------------------------
def test_sharing_a_list_creates_a_feed_post(auth_client, user, make_game):
    lst = GameList.objects.create(user=user, name="Mis imprescindibles", is_public=True)
    lst.games.add(make_game(igdb_id=720))

    resp = auth_client.post(f"/api/lists/{lst.id}/share/")

    assert resp.status_code == 201
    assert resp.json()["post_type"] == "list"
    assert resp.json()["related_list"]["name"] == "Mis imprescindibles"
    assert Post.objects.filter(related_list=lst, post_type=Post.PostType.LIST).count() == 1


def test_sharing_accepts_a_custom_message(auth_client, user):
    lst = GameList.objects.create(user=user, name="X", is_public=True)

    resp = auth_client.post(f"/api/lists/{lst.id}/share/", {"content": "Mirad esto"}, format="json")

    assert resp.json()["content"] == "Mirad esto"


def test_a_private_list_cannot_be_shared(auth_client, user):
    """Hacerla publica es requisito: si no, el feed filtraria una lista privada."""
    lst = GameList.objects.create(user=user, name="Secreta", is_public=False)

    resp = auth_client.post(f"/api/lists/{lst.id}/share/")

    assert resp.status_code == 400
    assert not Post.objects.filter(related_list=lst).exists()


def test_a_list_is_not_shared_twice(auth_client, user):
    lst = GameList.objects.create(user=user, name="X", is_public=True)
    auth_client.post(f"/api/lists/{lst.id}/share/")

    segunda = auth_client.post(f"/api/lists/{lst.id}/share/")

    assert segunda.status_code == 400
    assert Post.objects.filter(related_list=lst).count() == 1


def test_cannot_share_another_users_list(auth_client, other_user):
    ajena = GameList.objects.create(user=other_user, name="Ajena", is_public=True)

    assert auth_client.post(f"/api/lists/{ajena.id}/share/").status_code == 403


def test_deleting_a_list_removes_its_feed_post(auth_client, user):
    """El post no puede sobrevivir a la lista que muestra."""
    lst = GameList.objects.create(user=user, name="Efimera", is_public=True)
    auth_client.post(f"/api/lists/{lst.id}/share/")

    auth_client.delete(f"/api/lists/{lst.id}/")

    assert not Post.objects.filter(post_type=Post.PostType.LIST).exists()
