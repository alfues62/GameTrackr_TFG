"""Rellena sync_source en entradas antiguas importadas de Steam."""
from django.db import migrations


def backfill_sync_source(apps, schema_editor):
    UserGame = apps.get_model("core", "UserGame")
    UserGame.objects.filter(is_from_steam=True, sync_source="").update(sync_source="steam")


def reverse_backfill(apps, schema_editor):
    UserGame = apps.get_model("core", "UserGame")
    UserGame.objects.filter(sync_source="steam").update(sync_source="")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_user_is_psn_linked_user_is_xbox_linked_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_sync_source, reverse_backfill),
    ]
