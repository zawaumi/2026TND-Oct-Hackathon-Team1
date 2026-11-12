"""DRF の認証：Authorization: Bearer <Firebase の ID トークン>。

- 認証の処理の中ではユーザーを作らない。登録は初回設定（POST /onboarding/complete/）で、同意を受け取ってから。
- 登録済みなら、そのユーザーとして通す。
- ログインはしているが未登録なら、初回設定のビュー（allow_unregistered = True）だけを通し、
  ほかは 403 ONBOARDING_REQUIRED（contracts の Forbidden：初回設定未完了）にする。
"""

from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .firebase import InvalidToken, verify_id_token


class UnregisteredFirebaseUser:
    """ログインはしているが、まだ初回設定をしていない人。DB には保存しない。"""

    is_authenticated = True
    is_anonymous = False
    is_active = True
    is_staff = False
    is_superuser = False
    pk = None
    id = None

    def __init__(self, firebase_uid: str):
        self.firebase_uid = firebase_uid

    def __str__(self):
        return "unregistered"


class OnboardingRequired(exceptions.PermissionDenied):
    default_detail = "初回設定をしてください。"
    default_code = "ONBOARDING_REQUIRED"


class FirebaseAuthentication(BaseAuthentication):
    keyword = b"bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None  # トークンなし → ほかの認証（管理画面のセッション）か、未ログイン
        if len(parts) != 2:
            raise exceptions.AuthenticationFailed("ログインの情報が正しくありません。", code="INVALID_TOKEN")
        try:
            claims = verify_id_token(parts[1].decode("ascii"))
        except (InvalidToken, UnicodeDecodeError):
            raise exceptions.AuthenticationFailed("ログインの期限が切れたか、正しくありません。", code="INVALID_TOKEN") from None

        uid = claims["sub"]
        user = get_user_model().objects.filter(firebase_uid=uid).first()
        if user is not None:
            if not user.is_active:
                raise exceptions.AuthenticationFailed("このアカウントは使えません。", code="ACCOUNT_DISABLED")
            return user, claims
        view = (getattr(request, "parser_context", None) or {}).get("view")
        if getattr(view, "allow_unregistered", False):
            return UnregisteredFirebaseUser(uid), claims
        raise OnboardingRequired()

    def authenticate_header(self, request):
        # これがあると、未ログインのときに 403 ではなく 401 を返す（画面がログイン画面へ戻せる）
        return 'Bearer realm="api"'
