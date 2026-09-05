"""
URL configuration for GameTrackr (config project).
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),

    # API de la aplicación (incluye auth: register/login/me, JWT y los viewsets)
    path('api/', include('apps.core.urls')),
    path('api/steam/', include('apps.steam.urls')),
    path('api/psn/', include('apps.psn.urls')),
    path('api/recommendations/', include('apps.recommendations.urls')),

    # Social: seguir, amigos, búsqueda y perfil público (antes de social_django)
    path('api/social/', include('apps.core.social_urls')),

    # Login social (Google / Steam) -> /api/social/login/<backend>/
    path('api/social/', include('social_django.urls', namespace='social')),
]

# En desarrollo, Django sirve los ficheros subidos por los usuarios (media).
# En producción los sirve el servidor web / almacenamiento dedicado.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
