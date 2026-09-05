from django.urls import path

from .views import PsnLinkView, PsnSyncView

urlpatterns = [
    path("link/", PsnLinkView.as_view(), name="psn_link"),
    path("sync/", PsnSyncView.as_view(), name="psn_sync"),
]
