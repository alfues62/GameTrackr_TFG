from django.urls import path

from .views import RecommendationsView

urlpatterns = [
    path("", RecommendationsView.as_view(), name="recommendations"),
]
