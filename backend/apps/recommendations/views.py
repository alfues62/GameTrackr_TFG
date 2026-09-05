from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .recommender import GameRecommender


class RecommendationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            n = int(request.query_params.get("n", 12))
        except (TypeError, ValueError):
            n = 12
        recommendations = GameRecommender().get_recommendations(request.user.id, n=n)
        return Response(recommendations)
