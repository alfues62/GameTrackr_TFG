"""
Motor de recomendación basado en *content-based filtering*.

Cada juego se describe con un texto que concatena sus géneros y plataformas.
Se vectoriza todo el catálogo con TF-IDF y se construye un perfil del usuario
como suma ponderada de los vectores de sus juegos (peso según horas, valoración
y estado). La recomendación es la similitud del coseno entre ese perfil y el
resto de juegos. scikit-learn se importa de forma perezosa para no penalizar el
arranque del proyecto.
"""
import random
from datetime import date

from apps.core.models import Game, UserGame

# Traducción al español de los géneros de IGDB (es una lista fija) para las
# frases explicativas. Un género fuera del mapa se muestra tal cual.
GENRE_ES = {
    "Adventure": "aventura",
    "Arcade": "arcade",
    "Card & Board Game": "cartas y tablero",
    "Fighting": "lucha",
    "Hack and slash/Beat 'em up": "hack and slash",
    "Indie": "indie",
    "MOBA": "MOBA",
    "Music": "música",
    "Pinball": "pinball",
    "Platform": "plataformas",
    "Point-and-click": "aventuras gráficas",
    "Puzzle": "puzles",
    "Quiz/Trivia": "preguntas y respuestas",
    "Racing": "carreras",
    "Real Time Strategy (RTS)": "estrategia en tiempo real",
    "Role-playing (RPG)": "rol",
    "Shooter": "disparos",
    "Simulator": "simulación",
    "Sport": "deportes",
    "Strategy": "estrategia",
    "Tactical": "táctica",
    "Turn-based strategy (TBS)": "estrategia por turnos",
    "Visual Novel": "novela visual",
}

# Géneros demasiado genéricos para justificar una recomendación por sí solos
# (medio catálogo de IGDB los lleva); solo se usan si no hay nada más específico.
GENERIC_GENRES = {"Adventure", "Indie"}


class GameRecommender:
    MIN_LIBRARY = 5      # por debajo de esto, modo cold-start (fallback)
    HIGH_RATING = 85     # umbral del fallback por mejor valorados
    # Peso mínimo de un género (relativo al favorito) para afirmar «te gustan los X».
    GENRE_REASON_THRESHOLD = 0.25
    # Solapamiento mínimo de géneros (Jaccard) para afirmar «Similar a X».
    SIMILAR_REASON_THRESHOLD = 0.3
    # Tamaño mínimo del pool del que se muestrea la tanda diaria.
    DAILY_POOL_MIN = 40

    def get_recommendations(self, user_id, n=10):
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        user_games = list(UserGame.objects.filter(user_id=user_id).select_related("game"))

        # Cold-start: pocos juegos en biblioteca → mejores valorados.
        if len(user_games) < self.MIN_LIBRARY:
            return self._fallback(user_games, n, user_id)

        games = list(Game.objects.all())
        if len(games) <= len(user_games):
            return self._fallback(user_games, n, user_id)

        # 1-2) Matriz TF-IDF de características (géneros + plataformas).
        texts = [self._feature_text(g) for g in games]
        matrix = TfidfVectorizer().fit_transform(texts)

        index_by_game = {g.id: i for i, g in enumerate(games)}
        owned_ids = set()
        owned_indices = []
        owned_pairs = []  # (Game, peso) para atribuir el «Similar a X»
        genre_weights = {}
        profile = np.zeros(matrix.shape[1])

        # 3) Perfil del usuario: suma ponderada de sus juegos.
        for ug in user_games:
            idx = index_by_game.get(ug.game_id)
            if idx is None:
                continue
            owned_ids.add(ug.game_id)
            owned_indices.append(idx)
            weight = self._weight(ug)
            profile += matrix[idx].toarray()[0] * weight
            owned_pairs.append((ug.game, weight))
            for genre in (ug.game.genres or []):
                genre_weights[genre] = genre_weights.get(genre, 0) + weight

        if profile.sum() == 0 or not owned_indices:
            return self._fallback(user_games, n, user_id)

        # 4) Similitud coseno perfil ↔ todos los juegos.
        sims = cosine_similarity(profile.reshape(1, -1), matrix)[0]

        # 5) Excluir los ya poseídos y quedarse con un POOL amplio del ranking.
        pool = sorted(
            ((i, float(sims[i])) for i in range(len(games)) if games[i].id not in owned_ids),
            key=lambda x: x[1],
            reverse=True,
        )[: max(n * 4, self.DAILY_POOL_MIN)]

        # 6) Tanda diaria: muestreo determinista del pool (rota cada día) y
        #    orden final por afinidad.
        picked = self._daily_sample(user_id, pool, n)
        picked.sort(key=lambda x: x[1], reverse=True)

        return [
            {
                **self._game_dict(games[idx]),
                "score": round(score, 3),
                "reason": self._reason(games[idx], genre_weights, owned_pairs),
            }
            for idx, score in picked
        ]

    # ------------------------------------------------------------------ #
    def _weight(self, ug):
        hours = ug.hours_played or 0
        weight = hours * ((ug.user_rating or 0) / 10) if ug.user_rating else hours
        weight = max(weight, 0.1)  # peso mínimo: cuenta aunque tenga 0 horas
        if ug.status == UserGame.Status.COMPLETED:
            weight *= 1.5  # más peso a los completados
        return weight

    def _reason(self, game, genre_weights, owned_pairs):
        """Frase explicativa honesta: género compartido > juego similar > genérica.

        1. Si el juego comparte un género con peso real en el perfil del
           usuario, se explica por género («Porque te gustan los juegos de
           rol»), prefiriendo géneros específicos sobre los ultra-genéricos
           (Adventure/Indie, que lleva medio catálogo).
        2. Si no, se atribuye al juego propio más parecido SOLO por géneros
           (las plataformas emparejaban juegos que únicamente compartían
           consola) y exigiendo un solapamiento mínimo.
        3. En último término, una frase genérica antes que una atribución falsa.
        """
        game_genres = set(game.genres or [])

        # 1) Género favorito del usuario que este juego realmente comparte.
        if genre_weights and game_genres:
            top_weight = max(genre_weights.values())
            shared = [
                (genre, weight)
                for genre, weight in genre_weights.items()
                if genre in game_genres and weight >= self.GENRE_REASON_THRESHOLD * top_weight
            ]
            specific = [(g, w) for g, w in shared if g not in GENERIC_GENRES]
            pool = specific or shared
            if pool:
                genre = max(pool, key=lambda gw: gw[1])[0]
                return f"Porque te gustan los juegos de {GENRE_ES.get(genre, genre)}"

        # 2) Juego de la biblioteca más parecido por géneros (Jaccard).
        best_title, best_sim = None, 0.0
        for owned_game, _weight in owned_pairs:
            owned_genres = set(owned_game.genres or [])
            union = game_genres | owned_genres
            if not union:
                continue
            sim = len(game_genres & owned_genres) / len(union)
            if sim > best_sim:
                best_sim, best_title = sim, owned_game.title
        if best_title and best_sim >= self.SIMILAR_REASON_THRESHOLD:
            return f"Similar a {best_title}"

        return "Basado en tu biblioteca"

    def _daily_sample(self, user_id, pool, n):
        """Muestreo determinista con semilla usuario+día.

        La tanda cambia cada día (siempre hay más juegos afines que huecos),
        pero es estable dentro del mismo día: recargar no la baraja.
        """
        if len(pool) <= n:
            return list(pool)
        rng = random.Random(f"{user_id}:{date.today().isoformat()}")
        return rng.sample(pool, n)

    def _fallback(self, user_games, n, user_id=None):
        owned_ids = {ug.game_id for ug in user_games}
        pool = list(
            Game.objects.filter(igdb_rating__gt=self.HIGH_RATING)
            .exclude(id__in=owned_ids)
            .order_by("-igdb_rating")[: max(n * 4, self.DAILY_POOL_MIN)]
        )
        picked = self._daily_sample(user_id, pool, n)
        picked.sort(key=lambda g: g.igdb_rating or 0, reverse=True)
        return [
            {**self._game_dict(g), "score": round((g.igdb_rating or 0) / 100, 3), "reason": "Entre los mejor valorados"}
            for g in picked
        ]

    def _feature_text(self, game):
        parts = list(game.genres or []) + list(game.platforms or [])
        return " ".join(parts) if parts else "desconocido"

    def _game_dict(self, game):
        return {
            "igdb_id": game.igdb_id,
            "title": game.title,
            "cover_url": game.cover_url,
            "genres": game.genres or [],
            "igdb_rating": game.igdb_rating,
            "category": game.category,
        }
