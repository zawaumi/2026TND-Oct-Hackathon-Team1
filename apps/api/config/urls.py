from django.contrib import admin
from django.urls import include, path
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def health(request):
    return Response({"status": "ok", "service": "piatomo-api"})


urlpatterns = [
    path("api/v1/health/", health, name="health"),
    path("api/v1/", include("peers.urls")),
    # 教材データの入力用（管理者だけがログインできる）
    path("admin/", admin.site.urls),
]
