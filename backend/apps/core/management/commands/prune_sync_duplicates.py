import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Max

from apps.core.models import UserGame

STALE_AFTER = timedelta(hours=2)

MIN_PREFIX = 6


def _key(title: str) -> str:
    """Titulo reducido a letras y numeros, para comparar ediciones."""
    return re.sub(r"[^a-z0-9]", "", (title or "").lower())


def _same_game(a: str, b: str) -> bool:
    """Si un titulo es el otro con un sufijo de edicion ('+', 'Complete'...)."""
    x, y = _key(a), _key(b)
    if not x or not y:
        return False
    if x == y:
        return True
    corto, largo = (x, y) if len(x) < len(y) else (y, x)
    return len(corto) >= MIN_PREFIX and largo.startswith(corto)


class Command(BaseCommand):
    help = "Elimina entradas duplicadas que la ultima sincronizacion ya no toca."

    def add_arguments(self, parser):
        parser.add_argument("--user", help="Limita la limpieza a este usuario.")
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Borra de verdad. Sin esta opcion solo se enumera.",
        )

    def handle(self, *args, **options):
        users = get_user_model().objects.all()
        if options["user"]:
            users = users.filter(username=options["user"])

        total = 0
        for user in users.order_by("pk"):
            synced = UserGame.objects.filter(user=user).exclude(sync_source="")
            ultima = synced.aggregate(cuando=Max("last_synced"))["cuando"]
            if ultima is None:
                continue
            corte = ultima - STALE_AFTER
            atrasadas = list(synced.filter(last_synced__lt=corte).select_related("game"))
            if not atrasadas:
                continue

            al_dia = list(
                synced.filter(last_synced__gte=corte)
                .exclude(hours_played=0)
                .select_related("game")
            )
            duplicadas = [
                ug
                for ug in atrasadas
                if any(
                    ug.hours_played == otra.hours_played
                    and _same_game(ug.game.title, otra.game.title)
                    for otra in al_dia
                )
            ]
            sueltas = [ug for ug in atrasadas if ug not in duplicadas]

            self.stdout.write(f"{user.username} (ultima sincronizacion: {ultima:%Y-%m-%d %H:%M})")
            for ug in sorted(duplicadas, key=lambda x: x.game.title):
                self.stdout.write(
                    f"  duplicada  {ug.game.title[:46]:48} {ug.hours_played:8.2f} h "
                    f"vista por ultima vez {ug.last_synced:%Y-%m-%d}"
                )
                total += 1
            for ug in sorted(sueltas, key=lambda x: x.game.title):
                self.stdout.write(
                    f"  se conserva {ug.game.title[:46]:47} {ug.hours_played:8.2f} h "
                    f"sin pareja: la sincronizacion dejo de emparejarla"
                )
            if options["apply"] and duplicadas:
                UserGame.objects.filter(pk__in=[ug.pk for ug in duplicadas]).delete()

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay entradas duplicadas."))
        elif options["apply"]:
            self.stdout.write(self.style.SUCCESS(f"Eliminadas {total} entradas duplicadas."))
        else:
            self.stdout.write(
                self.style.WARNING(f"{total} entradas se eliminarian. Repite con --apply para hacerlo.")
            )
