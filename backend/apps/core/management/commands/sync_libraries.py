from collections import Counter
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Max, Q
from django.utils import timezone

from apps.psn import services as psn_services
from apps.steam import services as steam_services

SOURCES = {
    "steam": ("is_steam_linked", steam_services),
    "psn": ("is_psn_linked", psn_services),
}


class Command(BaseCommand):
    help = "Sincroniza las bibliotecas de Steam y PSN de los usuarios vinculados."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            help="Sincroniza solo a este usuario (username). Por defecto, todos.",
        )
        parser.add_argument(
            "--source",
            action="append",
            choices=sorted(SOURCES),
            help="Limita la sincronizacion a una plataforma. Repetible.",
        )
        parser.add_argument(
            "--min-interval",
            type=float,
            default=0,
            help="Horas que deben haber pasado desde la ultima lectura para repetirla.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Enumera lo que se sincronizaria sin llamar a ninguna API.",
        )

    def handle(self, *args, **options):
        sources = options["source"] or sorted(SOURCES)
        linked = Q()
        for name in sources:
            linked |= Q(**{SOURCES[name][0]: True})

        users = get_user_model().objects.filter(linked)
        if options["user"]:
            users = users.filter(username=options["user"])
        users = users.annotate(last_sync=Max("user_games__last_synced")).order_by("pk")

        cutoff = None
        if options["min_interval"] > 0:
            cutoff = timezone.now() - timedelta(hours=options["min_interval"])

        totals = Counter()
        for user in users:
            if cutoff is not None and user.last_sync is not None and user.last_sync > cutoff:
                totals["omitidos"] += 1
                self.stdout.write(f"{user.username}: al dia, se omite")
                continue

            for name in sources:
                flag, service = SOURCES[name]
                if not getattr(user, flag):
                    continue
                if options["dry_run"]:
                    totals["previstos"] += 1
                    self.stdout.write(f"{user.username}/{name}: se sincronizaria")
                    continue
                try:
                    summary = service.sync_user_library(user)
                except Exception as exc:
                    totals["fallos"] += 1
                    self.stderr.write(self.style.ERROR(f"{user.username}/{name}: {exc}"))
                    continue
                totals["bibliotecas"] += 1
                totals["juegos"] += summary.get("synced", 0)
                self.stdout.write(
                    f"{user.username}/{name}: {summary['synced']} juegos "
                    f"({summary['new']} nuevos, {summary['errors']} con error)"
                )

        resumen = ", ".join(f"{k}={v}" for k, v in sorted(totals.items())) or "nada que hacer"
        self.stdout.write(self.style.SUCCESS(f"Sincronizacion terminada: {resumen}"))
