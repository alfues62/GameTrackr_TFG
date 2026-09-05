from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class User(AbstractUser):

    email = models.EmailField(unique=True)
    avatar_url = models.URLField(blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    steam_id = models.CharField(max_length=32, blank=True, null=True, unique=True)
    is_steam_linked = models.BooleanField(default=False)
    # PSN (psnawp): el usuario pega su token NPSSO manualmente (Sony no ofrece OAuth).
    psn_online_id = models.CharField(max_length=64, blank=True, default="")
    psn_npsso = models.CharField(max_length=128, blank=True, default="")
    is_psn_linked = models.BooleanField(default=False)
    is_public_profile = models.BooleanField(default=True)
    has_completed_onboarding = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.username


class Game(models.Model):

    class Category(models.IntegerChoices):

        MAIN_GAME = 0, "Juego principal"
        DLC_ADDON = 1, "DLC"
        EXPANSION = 2, "Expansión"
        BUNDLE = 3, "Colección"
        STANDALONE_EXPANSION = 4, "Expansión independiente"
        MOD = 5, "Mod"
        EPISODE = 6, "Episodio"
        SEASON = 7, "Temporada"
        REMAKE = 8, "Remake"
        REMASTER = 9, "Remaster"
        EXPANDED_GAME = 10, "Edición ampliada"
        PORT = 11, "Port"
        FORK = 12, "Fork"
        PACK = 13, "Colección"
        UPDATE = 14, "Actualización"

    igdb_id = models.IntegerField(unique=True)
    title = models.CharField(max_length=255)
    cover_url = models.URLField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    release_date = models.DateField(blank=True, null=True)
    genres = models.JSONField(default=list, blank=True)
    platforms = models.JSONField(default=list, blank=True)
    igdb_rating = models.FloatField(blank=True, null=True)
    category = models.IntegerField(blank=True, null=True, choices=Category.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title


class UserGame(models.Model):

    class Status(models.TextChoices):
        PLAYING = "playing", "Jugando"
        COMPLETED = "completed", "Completado"
        BACKLOG = "backlog", "Pendiente"
        WISHLIST = "wishlist", "Lista de deseos"
        ABANDONED = "abandoned", "Abandonado"

    class SyncSource(models.TextChoices):
        STEAM = "steam", "Steam"
        PSN = "psn", "PlayStation Network"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_games",
    )
    game = models.ForeignKey(
        Game,
        on_delete=models.CASCADE,
        related_name="user_games",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.BACKLOG,
    )
    hours_played = models.FloatField(default=0)
    completion_percentage = models.FloatField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    user_rating = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
    )
    review = models.TextField(null=True, blank=True)
    platform = models.CharField(max_length=50, blank=True, default="")
    is_from_steam = models.BooleanField(default=False)
    sync_source = models.CharField(
        max_length=10, choices=SyncSource.choices, blank=True, default=""
    )
    sync_app_id = models.CharField(max_length=32, blank=True, default="")
    last_synced = models.DateTimeField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "game")
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "sync_source", "sync_app_id"],
                condition=~models.Q(sync_app_id=""),
                name="unique_synced_app_per_user",
            ),
        ]

    def save(self, *args, **kwargs):
        
        if (self.completion_percentage or 0) >= 100 and self.status != self.Status.COMPLETED:
            self.status = self.Status.COMPLETED
            campos = kwargs.get("update_fields")
            if campos is not None:
                kwargs["update_fields"] = set(campos) | {"status"}
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} - {self.game} ({self.status})"


class PlaytimeSnapshot(models.Model):

    user_game = models.ForeignKey(
        UserGame,
        on_delete=models.CASCADE,
        related_name="playtime_snapshots",
    )
    hours = models.FloatField()
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["recorded_at", "pk"]
        indexes = [
            models.Index(fields=["user_game", "recorded_at"]),
        ]

    def __str__(self):
        return f"{self.user_game} - {self.hours} h ({self.recorded_at:%Y-%m-%d})"


class ReviewComment(models.Model):

    review = models.ForeignKey(
        UserGame,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_comments",
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user} -> reseña {self.review_id}"


class GameList(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_lists",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, null=True)
    cover_url = models.URLField(blank=True, null=True)
    is_public = models.BooleanField(default=True)
    games = models.ManyToManyField(Game, blank=True, related_name="in_lists")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class GameListLike(models.Model):

    game_list = models.ForeignKey(GameList, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="list_likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("game_list", "user")

    def __str__(self):
        return f"{self.user} -> lista {self.game_list_id}"


class GameListComment(models.Model):

    game_list = models.ForeignKey(
        GameList,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="list_comments",
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user} -> lista {self.game_list_id}"


class Post(models.Model):
    """Publicación del feed social."""

    class PostType(models.TextChoices):
        REVIEW = "review", "Reseña"
        UPDATE = "update", "Actualización"
        ACHIEVEMENT = "achievement", "Logro"
        LIST = "list", "Lista"
        GENERAL = "general", "General"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
    )
    content = models.TextField()
    image_url = models.URLField(blank=True, null=True)
    related_game = models.ForeignKey(
        Game,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posts",
    )
    related_list = models.ForeignKey(
        "GameList",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="posts",
    )
    post_type = models.CharField(
        max_length=20,
        choices=PostType.choices,
        default=PostType.GENERAL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.post_type} ({self.created_at:%Y-%m-%d})"


class PostLike(models.Model):
    """'Me gusta' de un usuario sobre una publicación."""

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="post_likes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("post", "user")

    def __str__(self):
        return f"{self.user} ♥ {self.post_id}"


class PostComment(models.Model):

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="post_comments",
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user} -> {self.post_id}"


class Friendship(models.Model):

    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        ACCEPTED = "accepted", "Aceptada"

    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_sent",
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_received",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("from_user", "to_user")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["from_user", "to_user"]),
        ]

    def __str__(self):
        return f"{self.from_user} -> {self.to_user} ({self.status})"
