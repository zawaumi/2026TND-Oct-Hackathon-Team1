from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def health(request):
    return Response({"status": "ok", "service": "piatomo-api"})


def build_urlpatterns(admin_enabled):
    patterns = [
        path("api/v1/health/", health, name="health"),
        path("api/v1/", include("accounts.urls")),
        path("api/v1/", include("peers.urls")),
        path("api/v1/", include("lessons.urls")),
        path("api/v1/", include("learning.urls")),
        path("api/v1/", include("exercises.urls")),
    ]
    if admin_enabled:
        # 管理画面（管理者だけがログインできる）。本番では既定で出さない（DJANGO_ADMIN_ENABLED、config/settings/production.py）
        patterns.append(path("admin/", admin.site.urls))
    return patterns


urlpatterns = build_urlpatterns(getattr(settings, "ADMIN_ENABLED", True))
