from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from peers.services import get_or_create_peer

from .authentication import UnregisteredFirebaseUser


def profile_json(user):
    """contracts/openapi.yaml の Profile の形"""
    return {
        "id": user.id,
        "nickname": user.nickname,
        "school_level": user.school_level,
        "grade": user.grade,
        "onboarding_completed": user.onboarding_completed,
    }


class MeView(APIView):
    """GET /api/v1/users/me/ 本人の最小プロフィール。未登録なら 403 ONBOARDING_REQUIRED（認証で判定）"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(profile_json(request.user))


def _bad(code, message):
    return Response({"code": code, "message": message}, status=status.HTTP_400_BAD_REQUEST)


class OnboardingView(APIView):
    """POST /api/v1/onboarding/complete/ 説明と同意のあとに初回登録する（#12）。

    初回は 201、登録済みの再送は 200（中身は変えない）。同意がなければ登録しない。
    """

    permission_classes = [IsAuthenticated]
    allow_unregistered = True  # 未登録の人も呼べる（accounts/authentication.py）

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        allowed = {"nickname", "school_level", "grade", "terms_version", "privacy_notice_version", "consent_confirmed"}
        if set(data) - allowed:
            return _bad("INVALID_FIELDS", "受け付けない項目が含まれています。")
        if data.get("consent_confirmed") is not True:
            return _bad("CONSENT_REQUIRED", "説明を読んで、同意のチェックを入れてください。")
        nickname = data.get("nickname")
        if not isinstance(nickname, str) or not nickname.strip() or len(nickname.strip()) > 40:
            return _bad("INVALID_NICKNAME", "ニックネームは1〜40文字で入力してください。")
        if data.get("school_level") not in ("middle", "high"):
            return _bad("INVALID_SCHOOL_LEVEL", "校種を選んでください。")
        grade = data.get("grade")
        if not isinstance(grade, int) or isinstance(grade, bool) or not 1 <= grade <= 3:
            return _bad("INVALID_GRADE", "学年は1〜3で選んでください。")
        versions = {}
        for key in ("terms_version", "privacy_notice_version"):
            value = data.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > 32:
                return _bad("INVALID_CONSENT_VERSION", "同意した文書の版が正しくありません。")
            versions[key] = value.strip()

        user = request.user
        if not isinstance(user, UnregisteredFirebaseUser):
            return Response(profile_json(user), status=status.HTTP_200_OK)  # 登録済みの再送
        try:
            with transaction.atomic():
                user = get_user_model().objects.create_user(
                    firebase_uid=user.firebase_uid,
                    nickname=nickname.strip(),
                    school_level=data["school_level"],
                    grade=grade,
                    consented_at=timezone.now(),
                    **versions,
                )
                get_or_create_peer(user)
        except IntegrityError:
            # 同時に2回送られたとき：先に登録された方を返す
            user = get_user_model().objects.get(firebase_uid=request.user.firebase_uid)
            return Response(profile_json(user), status=status.HTTP_200_OK)
        return Response(profile_json(user), status=status.HTTP_201_CREATED)
