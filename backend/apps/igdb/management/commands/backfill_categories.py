"""
Rellena `Game.category` (pedido a IGDB como `game_type`, ver client.py) para
juegos ya cacheados antes de que ese campo existiera. Sin esto, la etiqueta de
DLC/colección del frontend no aparece en ningún juego ya guardado: solo se
rellena sola en los que se cacheen (o re-cacheen) a partir de ahora.

Uso: python manage.py backfill_categories [--batch-size 200]
"""
import time

from django.core.management.base import BaseCommand

from apps.core.models import Game
from apps.igdb.client import IGDBClient, IGDBError, IGDBNotConfigured


class Command(BaseCommand):
    help = "Rellena Game.category en lotes para los juegos ya cacheados que aún no lo tienen."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="Juegos por consulta a IGDB (máx. razonable ~500).",
        )

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        client = IGDBClient()

        ids = list(Game.objects.filter(category__isnull=True).order_by("igdb_id").values_list("igdb_id", flat=True))
        if not ids:
            self.stdout.write(self.style.SUCCESS("Nada que rellenar: todos los juegos ya tienen category."))
            return

        self.stdout.write(f"{len(ids)} juegos sin category. Consultando IGDB en lotes de {batch_size}…")
        updated = 0
        for i in range(0, len(ids), batch_size):
            chunk = ids[i : i + batch_size]
            try:
                results = client.get_game_types(chunk)
            except IGDBNotConfigured:
                self.stderr.write(self.style.ERROR("IGDB no está configurado (faltan credenciales)."))
                return
            except IGDBError as exc:
                self.stderr.write(self.style.WARNING(f"Lote {i // batch_size + 1}: error de IGDB ({exc}), se salta."))
                continue

            for item in results:
                if "id" not in item or item.get("game_type") is None:
                    continue
                updated += Game.objects.filter(igdb_id=item["id"]).update(category=item["game_type"])

            self.stdout.write(f"Lote {i // batch_size + 1}/{-(-len(ids) // batch_size)}: {len(results)} respuestas de IGDB.")
            time.sleep(0.3)  # ritmo educado con el límite de 4 req/s de IGDB

        self.stdout.write(self.style.SUCCESS(f"Listo: {updated} juegos actualizados con su category."))
