"""API の応答を、途中の CDN やブラウザにキャッシュさせない。

本番は Firebase Hosting の CDN を通る。本人だけの情報（プロフィール・授業・レポート）が
ほかの人に返されないよう、/api/ の応答には Cache-Control: private, no-store を付ける。
"""


class ApiNoStoreMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/") and "Cache-Control" not in response:
            response["Cache-Control"] = "private, no-store"
        return response
