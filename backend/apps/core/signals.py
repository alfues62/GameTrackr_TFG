from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import PlaytimeSnapshot, UserGame

TOLERANCE_HOURS = 0.01


@receiver(post_save, sender=UserGame, dispatch_uid="core.record_playtime_snapshot")
def record_playtime_snapshot(sender, instance, created, **kwargs):
    """Anota el contador de horas si se ha movido desde la ultima lectura."""
    hours = instance.hours_played or 0
    last = instance.playtime_snapshots.order_by("-recorded_at", "-pk").first()
    if last is not None and abs(last.hours - hours) < TOLERANCE_HOURS:
        return
    PlaytimeSnapshot.objects.create(user_game=instance, hours=hours)
