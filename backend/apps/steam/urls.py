from django.urls import path

from .views import SteamClaimPartialView, SteamLinkView, SteamSyncStatusView, SteamSyncView

urlpatterns = [
    path("link/", SteamLinkView.as_view(), name="steam_link"),
    path("claim-partial/", SteamClaimPartialView.as_view(), name="steam_claim_partial"),
    path("sync/", SteamSyncView.as_view(), name="steam_sync"),
    path("sync/status/", SteamSyncStatusView.as_view(), name="steam_sync_status"),
]
