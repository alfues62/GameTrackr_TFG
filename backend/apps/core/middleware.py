"""Middleware propio de GameTrackr."""
from urllib.parse import urlencode

from django.conf import settings
from django.shortcuts import redirect
from social_core import exceptions as social_exceptions


class SocialAuthErrorRedirectMiddleware:
    ERROR_CODES = (
        (social_exceptions.AuthAlreadyAssociated, "already_associated"),
        (social_exceptions.AuthCanceled, "cancelled"),
        (social_exceptions.AuthForbidden, "forbidden"),
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if not isinstance(exception, social_exceptions.SocialAuthBaseException):
            return None

        code = next(
            (code for cls, code in self.ERROR_CODES if isinstance(exception, cls)),
            "failed",
        )
        frontend = getattr(settings, "SOCIAL_AUTH_FRONTEND_URL", "http://localhost:3000")
        return redirect(f"{frontend}/login?{urlencode({'social_error': code})}")
