"""API のエラーを contracts/openapi.yaml の ApiError（{"code", "message"}）の形にそろえる。"""

from rest_framework.views import exception_handler as drf_exception_handler

DEFAULT_CODES = {400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict) and set(data) == {"code", "message"}:
        return response  # すでに ApiError の形
    code = DEFAULT_CODES.get(response.status_code, "ERROR")
    message = "エラーが起きました。"
    detail = getattr(exc, "detail", None)
    if isinstance(detail, str):
        message = str(detail)
        code = getattr(detail, "code", None) or code
    elif isinstance(data, dict) and "detail" in data:
        message = str(data["detail"])
        code = getattr(data["detail"], "code", None) or code
    if code in ("not_authenticated", "authentication_failed"):
        code = "UNAUTHORIZED"
    elif code == "permission_denied":
        code = "FORBIDDEN"
    response.data = {"code": str(code), "message": message}
    return response
