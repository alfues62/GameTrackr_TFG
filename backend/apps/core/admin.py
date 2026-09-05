from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    Friendship,
    Game,
    GameList,
    GameListComment,
    Post,
    PostComment,
    PostLike,
    ReviewComment,
    User,
    UserGame,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Perfil GameTrackr", {"fields": ("avatar_url", "bio", "steam_id", "is_steam_linked")}),
    )
    list_display = ("username", "email", "is_steam_linked", "is_staff")


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ("title", "igdb_id", "release_date", "igdb_rating")
    search_fields = ("title", "igdb_id")


@admin.register(UserGame)
class UserGameAdmin(admin.ModelAdmin):
    list_display = ("user", "game", "status", "hours_played", "completion_percentage", "is_from_steam")
    list_filter = ("status", "is_from_steam")


admin.site.register(GameList)
admin.site.register(GameListComment)
admin.site.register(Post)
admin.site.register(PostLike)
admin.site.register(PostComment)
admin.site.register(ReviewComment)
admin.site.register(Friendship)
