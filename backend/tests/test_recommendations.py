"""
Tests del recomendador content-based.

Verifican las dos garantías principales:
- nunca recomienda juegos que el usuario ya tiene en su biblioteca;
- con menos de 5 juegos cae al fallback de "mejor valorados".

Requiere scikit-learn → se ejecuta dentro del contenedor backend.
"""
from datetime import date
from unittest.mock import patch

import pytest

from apps.core.models import Game, UserGame
from apps.recommendations.recommender import GameRecommender

pytestmark = pytest.mark.django_db


@pytest.fixture
def catalog(db):
    """Catálogo: 6 RPG, 1 RPG nuevo (no poseído) y 1 shooter."""
    rpgs = [
        Game.objects.create(
            igdb_id=i, title=f"RPG {i}", genres=["RPG", "Aventura"],
            platforms=["PC"], igdb_rating=90,
        )
        for i in range(1, 7)
    ]
    rpg_unowned = Game.objects.create(
        igdb_id=10, title="RPG Nuevo", genres=["RPG", "Aventura"],
        platforms=["PC"], igdb_rating=93,
    )
    shooter = Game.objects.create(
        igdb_id=11, title="Shooter X", genres=["Shooter"],
        platforms=["PC"], igdb_rating=88,
    )
    return {"rpgs": rpgs, "rpg_unowned": rpg_unowned, "shooter": shooter}


def test_fallback_when_library_below_threshold(user, catalog):
    """<5 juegos → fallback 'mejor valorados', excluyendo los ya poseídos."""
    UserGame.objects.create(user=user, game=catalog["rpgs"][0], status="playing", hours_played=5)

    recs = GameRecommender().get_recommendations(user.id, n=5)

    assert recs
    assert all(r["reason"] == "Entre los mejor valorados" for r in recs)
    owned_id = catalog["rpgs"][0].igdb_id
    assert all(r["igdb_id"] != owned_id for r in recs)


def test_does_not_recommend_owned_games(user, catalog):
    """Con biblioteca suficiente (5 RPG), no devuelve ninguno de los poseídos."""
    owned = catalog["rpgs"][:5]
    for g in owned:
        UserGame.objects.create(user=user, game=g, status="completed", hours_played=30, user_rating=9)

    recs = GameRecommender().get_recommendations(user.id, n=10)

    assert recs
    owned_ids = {g.igdb_id for g in owned}
    rec_ids = {r["igdb_id"] for r in recs}
    assert owned_ids.isdisjoint(rec_ids)


def test_recommendation_includes_category(user, catalog):
    """El badge de DLC/colección del frontend necesita `category` en la recomendación."""
    catalog["rpg_unowned"].category = 1  # dlc_addon
    catalog["rpg_unowned"].save()
    for g in catalog["rpgs"][:5]:
        UserGame.objects.create(user=user, game=g, status="completed", hours_played=40, user_rating=9)

    recs = GameRecommender().get_recommendations(user.id, n=5)
    rec = next(r for r in recs if r["igdb_id"] == catalog["rpg_unowned"].igdb_id)
    assert rec["category"] == 1


def test_content_based_prefers_similar_genre(user, catalog):
    """5 RPG en biblioteca → el RPG nuevo se recomienda por encima del shooter."""
    for g in catalog["rpgs"][:5]:
        UserGame.objects.create(user=user, game=g, status="completed", hours_played=40, user_rating=9)

    recs = GameRecommender().get_recommendations(user.id, n=5)
    ids = [r["igdb_id"] for r in recs]

    assert catalog["rpg_unowned"].igdb_id in ids
    assert ids.index(catalog["rpg_unowned"].igdb_id) < ids.index(catalog["shooter"].igdb_id)


# --- Frases explicativas (reason) --------------------------------------------
def test_reason_attributes_shared_genre_not_unrelated_game(user):
    """Caso Baldur's Gate: se explica por un género que el juego COMPARTE,
    nunca con un «Similar a» hacia un juego de otro género."""
    metroidvanias = [
        Game.objects.create(
            igdb_id=200 + i, title=f"Metroidvania {i}",
            genres=["Platform", "Hack and slash/Beat 'em up", "Adventure"],
            platforms=["PC"], igdb_rating=88,
        )
        for i in range(5)
    ]
    elden = Game.objects.create(
        igdb_id=210, title="Elden Ring",
        genres=["Role-playing (RPG)", "Adventure"], platforms=["PC"], igdb_rating=95,
    )
    baldurs = Game.objects.create(
        igdb_id=211, title="Baldur's Gate: Dark Alliance",
        genres=["Role-playing (RPG)", "Hack and slash/Beat 'em up"],
        platforms=["PC"], igdb_rating=85,
    )
    for g in metroidvanias:
        UserGame.objects.create(user=user, game=g, status="completed", hours_played=30)
    UserGame.objects.create(user=user, game=elden, status="playing", hours_played=80)

    recs = GameRecommender().get_recommendations(user.id, n=10)
    rec = next(r for r in recs if r["igdb_id"] == baldurs.igdb_id)

    assert rec["reason"] in {
        "Porque te gustan los juegos de hack and slash",
        "Porque te gustan los juegos de rol",
    }


def test_reason_translates_genre_to_spanish(user):
    for i in range(5):
        g = Game.objects.create(igdb_id=300 + i, title=f"Plat {i}", genres=["Platform"], platforms=["PC"], igdb_rating=80)
        UserGame.objects.create(user=user, game=g, status="playing", hours_played=10)
    candidate = Game.objects.create(igdb_id=310, title="Celeste", genres=["Platform"], platforms=["PC"], igdb_rating=92)

    recs = GameRecommender().get_recommendations(user.id, n=10)
    rec = next(r for r in recs if r["igdb_id"] == candidate.igdb_id)

    assert rec["reason"] == "Porque te gustan los juegos de plataformas"


def test_reason_similar_to_requires_genre_overlap(user):
    """«Similar a X» solo si comparten géneros; el peso marginal no basta para
    la frase de género pero sí atribuye al juego correcto."""
    for i in range(5):
        g = Game.objects.create(igdb_id=400 + i, title=f"Plat {i}", genres=["Platform"], platforms=["PC"], igdb_rating=80)
        UserGame.objects.create(user=user, game=g, status="playing", hours_played=20)
    # Un único juego de carreras en backlog (peso mínimo).
    forza_owned = Game.objects.create(igdb_id=410, title="Forza Horizon 4", genres=["Racing"], platforms=["PC"], igdb_rating=90)
    UserGame.objects.create(user=user, game=forza_owned, status="backlog", hours_played=0)
    candidate = Game.objects.create(igdb_id=411, title="Forza Horizon 5", genres=["Racing"], platforms=["PC"], igdb_rating=92)

    recs = GameRecommender().get_recommendations(user.id, n=10)
    rec = next(r for r in recs if r["igdb_id"] == candidate.igdb_id)

    assert rec["reason"] == "Similar a Forza Horizon 4"


def test_recommendations_rotate_daily(user):
    """La tanda es estable dentro del día y cambia entre días (semilla usuario+fecha)."""
    for i in range(5):
        g = Game.objects.create(igdb_id=600 + i, title=f"Owned {i}", genres=["Platform"], platforms=["PC"], igdb_rating=80)
        UserGame.objects.create(user=user, game=g, status="playing", hours_played=10)
    for i in range(40):
        Game.objects.create(igdb_id=700 + i, title=f"Candidate {i}", genres=["Platform"], platforms=["PC"], igdb_rating=75)

    with patch("apps.recommendations.recommender.date") as mock_date:
        mock_date.today.return_value = date(2026, 7, 1)
        day1 = [r["igdb_id"] for r in GameRecommender().get_recommendations(user.id, n=5)]
        day1_again = [r["igdb_id"] for r in GameRecommender().get_recommendations(user.id, n=5)]
        mock_date.today.return_value = date(2026, 7, 2)
        day2 = [r["igdb_id"] for r in GameRecommender().get_recommendations(user.id, n=5)]

    assert day1 == day1_again  # recargar la página no baraja la tanda
    assert day1 != day2  # al día siguiente, tanda distinta


def test_reason_generic_when_nothing_matches(user):
    for i in range(5):
        g = Game.objects.create(igdb_id=500 + i, title=f"Plat {i}", genres=["Platform"], platforms=["PC"], igdb_rating=80)
        UserGame.objects.create(user=user, game=g, status="playing", hours_played=10)
    candidate = Game.objects.create(igdb_id=510, title="Wipeout", genres=["Racing"], platforms=["PC"], igdb_rating=85)

    recs = GameRecommender().get_recommendations(user.id, n=10)
    rec = next(r for r in recs if r["igdb_id"] == candidate.igdb_id)

    assert rec["reason"] == "Basado en tu biblioteca"
