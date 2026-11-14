from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from learning.models import LearningSession

from .services import ExerciseError, attempt_exercise, create_exercise, exercise_json


def _error(e):
    return Response({"code": e.code, "message": e.message}, status=e.status)


class ExerciseCreateView(APIView):
    """POST /api/v1/sessions/{id}/exercises/ ユーザーが問題を出し、検証の状態を受け取る（201）"""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = LearningSession.objects.filter(id=session_id, owner=request.user).first()
        if session is None:
            return Response({"code": "NOT_FOUND", "message": "授業が見つかりません。"}, status=status.HTTP_404_NOT_FOUND)
        try:
            ex = create_exercise(session, request.data)
        except ExerciseError as e:
            return _error(e)
        return Response(exercise_json(ex), status=status.HTTP_201_CREATED)


class ExerciseAttemptView(APIView):
    """POST /api/v1/exercises/{id}/attempt/ ぴあ友が問題を解き、検証した結果を受け取る（200）"""

    permission_classes = [IsAuthenticated]

    def post(self, request, exercise_id):
        data = request.data if isinstance(request.data, dict) else {}
        if set(data) - {"request_id"}:
            return Response({"code": "INVALID_FIELDS", "message": "受け付けない項目が含まれています。"}, status=400)
        try:
            payload = attempt_exercise(request.user, exercise_id, data.get("request_id"))
        except ExerciseError as e:
            return _error(e)
        return Response(payload)
