from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    ChangePasswordView,
    FriendshipViewSet,
    GameListViewSet,
    GameViewSet,
    HealthView,
    LoginView,
    MeView,
    PostCommentViewSet,
    PostViewSet,
    RegisterView,
    StatsDashboardView,
    UploadView,
    UserGameViewSet,
)

router = DefaultRouter()
router.register("games", GameViewSet, basename="game")
router.register("library", UserGameViewSet, basename="usergame")
router.register("lists", GameListViewSet, basename="gamelist")
router.register("posts", PostViewSet, basename="post")
router.register("comments", PostCommentViewSet, basename="comment")
router.register("friendships", FriendshipViewSet, basename="friendship")

auth_patterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("me/", MeView.as_view(), name="me"),
    path("password/", ChangePasswordView.as_view(), name="change_password"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),
]

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("uploads/", UploadView.as_view(), name="upload"),
    path("stats/dashboard/", StatsDashboardView.as_view(), name="stats_dashboard"),
    path("auth/", include(auth_patterns)),
    path("", include(router.urls)),
]
