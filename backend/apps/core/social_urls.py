from django.urls import path

from .views import (
    FollowView,
    FriendsView,
    PublicProfileView,
    UnfollowView,
    UserSearchView,
)

# Se incluye bajo /api/social/ ANTES que social_django; las rutas no se solapan
# con las de login social (login/<backend>/, complete/<backend>/...).
urlpatterns = [
    path("follow/<int:user_id>/", FollowView.as_view(), name="follow"),
    path("unfollow/<int:user_id>/", UnfollowView.as_view(), name="unfollow"),
    path("friends/", FriendsView.as_view(), name="friends"),
    path("search/", UserSearchView.as_view(), name="user_search"),
    path("users/<str:username>/", PublicProfileView.as_view(), name="public_profile"),
]
