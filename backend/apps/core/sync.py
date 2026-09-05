"""Alta y actualizacion de entradas de biblioteca que vienen de una plataforma.

Las sincronizaciones solo conocen el nombre del juego, y emparejarlo con IGDB no
es una operacion estable: el catalogo guarda ports, forks y ediciones con el
mismo titulo, y la busqueda por relevancia puede devolver hoy una ficha y manana
otra. Cuando la identidad de la entrada era el juego emparejado, ese vaiven
creaba duplicados en la biblioteca. Aqui la identidad pasa a ser el juego en su
plataforma de origen, que no cambia nunca.

Y como el modelo guarda una sola entrada por usuario y juego, un titulo que se
tiene por duplicado no cabe dos veces. Ocurre de dos maneras: el mismo juego en
Steam y en PSN, y las ediciones de PS4 y PS5 del mismo juego, que IGDB resuelve
a una unica ficha. En ambos casos manda quien llego primero y los demas no
tocan la entrada. Sin esa regla la fila rebotaba entre origenes en cada pasada
-incluso dentro de la misma- y cada rebote quedaba anotado en el historial como
si fueran horas jugadas de verdad.
"""
from .models import UserGame


def _tiene_otro_dueno(entry, source, app_id) -> bool:
    """Si la entrada ya la lleva otra plataforma u otra aplicacion de la misma.

    Una entrada anadida a mano no tiene dueno y se adopta. Una de la misma
    plataforma todavia sin sellar tambien: es la importada antes de que se
    guardara el identificador.
    """
    if entry is None or not entry.sync_source:
        return False
    if entry.sync_source != source:
        return True
    return bool(entry.sync_app_id) and entry.sync_app_id != app_id


def upsert_synced_game(user, game, source, app_id, defaults):
    """Crea o actualiza la entrada del usuario para un juego sincronizado.

    Devuelve (entrada, creada), igual que `update_or_create`. Si la entrada ya
    tiene otro dueno se devuelve intacta, sin escribir nada.
    """
    app_id = str(app_id or "").strip()

    entry = None
    if app_id:
        entry = UserGame.objects.filter(
            user=user, sync_source=source, sync_app_id=app_id
        ).first()

    if entry is None:
        existente = UserGame.objects.filter(user=user, game=game).first()
        if _tiene_otro_dueno(existente, source, app_id):
            return existente, False
        entry = existente

    created = entry is None
    if created:
        entry = UserGame(user=user, game=game)
    elif entry.game_id != game.pk:
        # El emparejamiento con IGDB ha cambiado. Si el usuario ya tiene una fila
        # para la ficha nueva y no tiene otro dueno, es el duplicado que esto
        # viene a evitar: se funde en la que lleva el identificador. Si lo tiene,
        # se respeta y se deja el emparejamiento como estaba.
        duplicada = UserGame.objects.filter(user=user, game=game).exclude(pk=entry.pk).first()
        if not _tiene_otro_dueno(duplicada, source, app_id):
            if duplicada is not None:
                duplicada.playtime_snapshots.update(user_game=entry)
                duplicada.delete()
            entry.game = game

    entry.sync_source = source
    if app_id:
        entry.sync_app_id = app_id
    for field, value in defaults.items():
        setattr(entry, field, value)
    entry.save()
    return entry, created
