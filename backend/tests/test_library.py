"""
Tests de la biblioteca (UserGame): CRUD, filtro por estado y aislamiento entre usuarios.

Los endpoints de lista están paginados globalmente (PageNumberPagination, 20/pág),
así que la respuesta es {count, next, previous, results}.
"""
from datetime import date, timedelta

import pytest

from apps.core.models import ReviewComment, UserGame

pytestmark = pytest.mark.django_db


def test_create_usergame_from_existing_game(auth_client, user, make_game):
    """POST /api/library/ con un igdb_id ya cacheado localmente (sin tocar IGDB)."""
    game = make_game(igdb_id=500, title="Hollow Knight")
    resp = auth_client.post(
        "/api/library/",
        {"igdb_id": 500, "status": "playing", "hours_played": 12},
        format="json",
    )
    assert resp.status_code == 201
    assert UserGame.objects.filter(user=user, game=game).exists()
    body = resp.json()
    assert body["status"] == "playing"
    assert body["game"]["igdb_id"] == 500


def test_list_returns_only_own_games(auth_client, user, other_user, make_game, make_usergame):
    g1 = make_game(igdb_id=1)
    g2 = make_game(igdb_id=2)
    make_usergame(user, g1, status="playing")
    make_usergame(other_user, g2, status="playing")  # de otro usuario

    resp = auth_client.get("/api/library/")
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["game"]["igdb_id"] == 1


def test_page_size_param_allows_full_library(auth_client, user, make_game, make_usergame):
    """Con más juegos que el tamaño de página (20), ?page_size= trae el resto.

    Regresión: la Biblioteca solo mostraba los primeros 20 juegos importados.
    """
    for i in range(25):
        make_usergame(user, make_game(igdb_id=1000 + i))

    default = auth_client.get("/api/library/").json()
    assert default["count"] == 25
    assert len(default["results"]) == 20  # página por defecto

    full = auth_client.get("/api/library/?page_size=200").json()
    assert len(full["results"]) == 25  # conjunto completo


def test_filter_by_status(auth_client, user, make_game, make_usergame):
    make_usergame(user, make_game(igdb_id=10), status="playing")
    make_usergame(user, make_game(igdb_id=11), status="completed")
    make_usergame(user, make_game(igdb_id=12), status="completed")

    resp = auth_client.get("/api/library/?status=completed")
    results = resp.json()["results"]
    assert len(results) == 2
    assert all(r["status"] == "completed" for r in results)


def test_update_usergame(auth_client, user, make_game, make_usergame):
    ug = make_usergame(user, make_game(igdb_id=20), status="backlog")
    resp = auth_client.patch(
        f"/api/library/{ug.id}/",
        {"status": "completed", "hours_played": 40},
        format="json",
    )
    assert resp.status_code == 200
    ug.refresh_from_db()
    assert ug.status == "completed"
    assert ug.hours_played == 40


def test_delete_usergame(auth_client, user, make_game, make_usergame):
    ug = make_usergame(user, make_game(igdb_id=30))
    resp = auth_client.delete(f"/api/library/{ug.id}/")
    assert resp.status_code == 204
    assert not UserGame.objects.filter(id=ug.id).exists()


# --- Restricción de estado para juegos aún no publicados ---------------------
def test_cannot_add_unreleased_game_as_playing(auth_client, make_game):
    """Fecha de lanzamiento futura: solo se permite wishlist."""
    make_game(igdb_id=800, release_date=date.today() + timedelta(days=30))
    resp = auth_client.post("/api/library/", {"igdb_id": 800, "status": "playing"}, format="json")
    assert resp.status_code == 400
    assert not UserGame.objects.filter(game__igdb_id=800).exists()


def test_can_add_unreleased_game_as_wishlist(auth_client, user, make_game):
    make_game(igdb_id=801, release_date=date.today() + timedelta(days=30))
    resp = auth_client.post("/api/library/", {"igdb_id": 801, "status": "wishlist"}, format="json")
    assert resp.status_code == 201
    assert UserGame.objects.filter(user=user, game__igdb_id=801, status="wishlist").exists()


def test_can_add_game_without_release_date_as_playing(auth_client, user, make_game):
    """Sin fecha de lanzamiento no se trata como no publicado (dato incompleto de IGDB, no ausencia real)."""
    make_game(igdb_id=802, release_date=None)
    resp = auth_client.post("/api/library/", {"igdb_id": 802, "status": "playing"}, format="json")
    assert resp.status_code == 201
    assert UserGame.objects.filter(user=user, game__igdb_id=802, status="playing").exists()


def test_default_status_blocked_for_unreleased_game(auth_client, make_game):
    """Sin status explícito se usa el default del modelo (backlog), que también debe bloquearse."""
    make_game(igdb_id=803, release_date=date.today() + timedelta(days=30))
    resp = auth_client.post("/api/library/", {"igdb_id": 803}, format="json")
    assert resp.status_code == 400


def test_cannot_change_status_away_from_wishlist_for_unreleased_game(auth_client, user, make_game, make_usergame):
    game = make_game(igdb_id=804, release_date=date.today() + timedelta(days=30))
    ug = make_usergame(user, game, status="wishlist")
    resp = auth_client.patch(f"/api/library/{ug.id}/", {"status": "playing"}, format="json")
    assert resp.status_code == 400
    ug.refresh_from_db()
    assert ug.status == "wishlist"


def test_can_still_edit_other_fields_of_unreleased_wishlist_entry(auth_client, user, make_game, make_usergame):
    """Un PATCH que no toca `status` no debe activar la validación (p. ej. anotar horas ya jugadas en beta)."""
    game = make_game(igdb_id=805, release_date=date.today() + timedelta(days=30))
    ug = make_usergame(user, game, status="wishlist")
    resp = auth_client.patch(f"/api/library/{ug.id}/", {"hours_played": 3}, format="json")
    assert resp.status_code == 200
    ug.refresh_from_db()
    assert ug.hours_played == 3


def test_released_game_allows_any_status(auth_client, make_game):
    make_game(igdb_id=806, release_date=date.today() - timedelta(days=30))
    resp = auth_client.post("/api/library/", {"igdb_id": 806, "status": "completed"}, format="json")
    assert resp.status_code == 201


# --- Aislamiento entre usuarios --------------------------------------------
def test_cannot_retrieve_other_users_game(auth_client, user, other_user, make_game, make_usergame):
    """`user` (auth_client) no puede leer la entrada de biblioteca de `other_user`."""
    ug = make_usergame(other_user, make_game(igdb_id=40))
    resp = auth_client.get(f"/api/library/{ug.id}/")
    assert resp.status_code == 404


def test_cannot_modify_other_users_game(auth_client, user, other_user, make_game, make_usergame):
    """`user` (auth_client) no puede editar ni borrar la entrada de `other_user`."""
    ug = make_usergame(other_user, make_game(igdb_id=41), status="playing")

    patch = auth_client.patch(f"/api/library/{ug.id}/", {"status": "completed"}, format="json")
    assert patch.status_code == 404

    delete = auth_client.delete(f"/api/library/{ug.id}/")
    assert delete.status_code == 404

    ug.refresh_from_db()
    assert ug.status == "playing"  # intacto


# --- Reseñas de la comunidad de un juego ------------------------------------
def test_game_reviews_returns_only_entries_with_text(
    auth_client, user, other_user, make_game, make_usergame
):
    """/api/games/<igdb_id>/reviews/ deriva las reseñas de los UserGame con texto."""
    game = make_game(igdb_id=700, title="Hollow Knight")
    make_usergame(user, game, review="Obra maestra", user_rating=9)
    make_usergame(other_user, game)  # sin reseña → excluida

    resp = auth_client.get(f"/api/games/{game.igdb_id}/reviews/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["review"] == "Obra maestra"
    assert data[0]["user"]["id"] == user.id


def test_game_reviews_empty_when_no_text(auth_client, user, make_game, make_usergame):
    game = make_game(igdb_id=701)
    make_usergame(user, game)  # sin texto de reseña
    resp = auth_client.get(f"/api/games/{game.igdb_id}/reviews/")
    assert resp.status_code == 200
    assert resp.json() == []


# --- Comentarios en reseñas ---------------------------------------------------
def test_comment_on_others_review(auth_client, user, other_user, make_game, make_usergame):
    game = make_game(igdb_id=710, title="Hollow Knight")
    review = make_usergame(other_user, game, review="Obra maestra", user_rating=9)

    resp = auth_client.post(
        f"/api/games/{game.igdb_id}/reviews/{review.id}/comments/",
        {"content": "Totalmente de acuerdo"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["content"] == "Totalmente de acuerdo"
    assert ReviewComment.objects.filter(review=review, user=user).exists()


def test_list_review_comments(auth_client, user, other_user, make_game, make_usergame):
    game = make_game(igdb_id=711)
    review = make_usergame(other_user, game, review="Buen juego")
    ReviewComment.objects.create(review=review, user=user, content="uno")
    ReviewComment.objects.create(review=review, user=other_user, content="dos")

    resp = auth_client.get(f"/api/games/{game.igdb_id}/reviews/{review.id}/comments/")
    assert resp.status_code == 200
    contents = {c["content"] for c in resp.json()}
    assert contents == {"uno", "dos"}


def test_empty_review_comment_is_rejected(auth_client, other_user, make_game, make_usergame):
    game = make_game(igdb_id=712)
    review = make_usergame(other_user, game, review="Buen juego")
    resp = auth_client.post(
        f"/api/games/{game.igdb_id}/reviews/{review.id}/comments/", {"content": "   "}, format="json"
    )
    assert resp.status_code == 400


def test_cannot_comment_on_review_without_text(auth_client, other_user, make_game, make_usergame):
    """Un UserGame sin reseña escrita no cuenta como reseña pública: 404 al intentar comentarlo."""
    game = make_game(igdb_id=713)
    entry = make_usergame(other_user, game)  # sin review
    resp = auth_client.post(
        f"/api/games/{game.igdb_id}/reviews/{entry.id}/comments/", {"content": "hola"}, format="json"
    )
    assert resp.status_code == 404


def test_reply_to_review_comment(auth_client, user, other_user, make_game, make_usergame):
    game = make_game(igdb_id=714)
    review = make_usergame(other_user, game, review="Buen juego")
    top = ReviewComment.objects.create(review=review, user=other_user, content="raíz")

    resp = auth_client.post(
        f"/api/games/{game.igdb_id}/reviews/{review.id}/comments/",
        {"content": "respuesta", "parent": top.id},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["parent"] == top.id

    top_level = auth_client.get(f"/api/games/{game.igdb_id}/reviews/{review.id}/comments/").json()
    assert len(top_level) == 1
    assert top_level[0]["replies_count"] == 1


# ---------------------------------------------------------------------------
# Completitud al 100 %: el estado se pone solo
# ---------------------------------------------------------------------------
def test_reaching_100_percent_marks_the_game_as_completed(user, make_game, make_usergame):
    entrada = make_usergame(user, make_game(igdb_id=900), status="playing")

    entrada.completion_percentage = 100
    entrada.save()

    entrada.refresh_from_db()
    assert entrada.status == UserGame.Status.COMPLETED


def test_it_also_works_when_only_completion_is_saved(user, make_game, make_usergame):
    """La sincronizacion de Steam guarda solo ese campo al leer los logros."""
    entrada = make_usergame(user, make_game(igdb_id=901), status="backlog")

    entrada.completion_percentage = 100
    entrada.save(update_fields=["completion_percentage"])

    entrada.refresh_from_db()
    assert entrada.status == UserGame.Status.COMPLETED


def test_below_100_the_status_is_left_alone(user, make_game, make_usergame):
    entrada = make_usergame(user, make_game(igdb_id=902), status="playing")

    entrada.completion_percentage = 99.9
    entrada.save()

    entrada.refresh_from_db()
    assert entrada.status == "playing"


def test_a_game_created_at_100_starts_completed(user, make_game, make_usergame):
    entrada = make_usergame(user, make_game(igdb_id=903), status="backlog", completion_percentage=100)

    entrada.refresh_from_db()
    assert entrada.status == UserGame.Status.COMPLETED
