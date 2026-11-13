"""開発中に、画面（http://localhost:3000）から API（:8000）を呼べるようにする（CORS）。

本番は Firebase Hosting から /api/** を Cloud Run へ転送し、同じ場所に見せるので CORS は要らない（docs/01 の本番構成）。
許可するのは CORS_ALLOWED_ORIGINS に書いた場所だけ。ほかの場所からの呼び出しには何も付けない。
"""

from django.conf import settings
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers


class SimpleCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        allowed = origin in getattr(settings, "CORS_ALLOWED_ORIGINS", ())
        if allowed and request.method == "OPTIONS" and "Access-Control-Request-Method" in request.headers:
            response = HttpResponse(status=204)  # 事前確認（preflight）にはここで答える
        else:
            response = self.get_response(request)
        if origin:
            patch_vary_headers(response, ("Origin",))  # 呼び出し元ごとに答えが変わるので、キャッシュを分けてもらう
        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
            response["Access-Control-Max-Age"] = "600"
        return response
