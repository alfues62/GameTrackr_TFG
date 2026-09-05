"""Linea base del historial de horas para las bibliotecas que ya existian.

Sin esta fila inicial, la primera sincronizacion posterior al despliegue seria
la linea base de cada juego y quedaria fechada "hoy" en vez de en el momento en
que se importo. Se usa `updated_at` como fecha de la lectura porque es lo mas
cercano a cuando se conocio ese contador.
"""
from django.db import migrations


def crear_lineas_base(apps, schema_editor):
    UserGame = apps.get_model("core", "UserGame")
    PlaytimeSnapshot = apps.get_model("core", "PlaytimeSnapshot")
    PlaytimeSnapshot.objects.bulk_create(
        [
            PlaytimeSnapshot(
                user_game_id=pk,
                hours=hours or 0,
                recorded_at=updated_at,
            )
            for pk, hours, updated_at in UserGame.objects.values_list(
                "pk", "hours_played", "updated_at"
            ).iterator()
        ],
        batch_size=500,
    )


def borrar_lineas_base(apps, schema_editor):
    apps.get_model("core", "PlaytimeSnapshot").objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_playtimesnapshot"),
    ]

    operations = [
        migrations.RunPython(crear_lineas_base, borrar_lineas_base),
    ]
