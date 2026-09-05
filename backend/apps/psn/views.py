from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .psn_client import PSNAuthError, PSNClient, PSNError
from .services import sync_user_library


class PsnLinkView(APIView):
    """Vincula la cuenta de PSN del usuario mediante su token NPSSO."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        npsso = (request.data.get("npsso") or "").strip()
        if not npsso:
            return Response({"detail": "Pega tu token NPSSO."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            profile = PSNClient(npsso).get_profile()
        except PSNAuthError:
            return Response({"detail": "El token NPSSO no es válido o ha caducado."}, status=status.HTTP_400_BAD_REQUEST)
        except PSNError:
            return Response({"detail": "No se pudo contactar con PSN."}, status=status.HTTP_502_BAD_GATEWAY)

        user = request.user
        user.psn_npsso = npsso
        user.psn_online_id = profile["online_id"]
        user.is_psn_linked = True
        user.save(update_fields=["psn_npsso", "psn_online_id", "is_psn_linked"])
        return Response({"psn_online_id": user.psn_online_id, "is_psn_linked": True})

    def delete(self, request):
        """Desvincula la cuenta de PSN del usuario."""
        user = request.user
        user.psn_npsso = ""
        user.psn_online_id = ""
        user.is_psn_linked = False
        user.save(update_fields=["psn_npsso", "psn_online_id", "is_psn_linked"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PsnSyncView(APIView):
    """Sincroniza la biblioteca de PSN del usuario autenticado."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_psn_linked or not request.user.psn_npsso:
            return Response({"detail": "Primero vincula tu cuenta de PSN."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            summary = sync_user_library(request.user)
        except PSNAuthError:
            return Response(
                {"detail": "Tu token NPSSO ha caducado. Vuelve a vincular tu cuenta."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except PSNError:
            return Response({"detail": "No se pudo contactar con PSN."}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(summary)
