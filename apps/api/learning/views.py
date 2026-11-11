from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LearningSession
from .services import SessionError, finish_session, start_session


def session_json(s):
    """contracts/openapi.yaml の LearningSession の形"""
    return {
        "id": s.id,
        "status": s.status,
        "mode": s.mode,
        "lesson_ids": s.lesson_ids(),
        "knowledge_version": s.knowledge_version,
        "started_at": s.started_at.isoformat(),
    }


def summary_json(s):
    """contracts/openapi.yaml の SessionSummary の形。点数は評価（#42）ができるまで null"""
    return {
        "id": s.id,
        "status": s.status,
        "mode": s.mode,
        "lesson_ids": s.lesson_ids(),
        "started_at": s.started_at.isoformat(),
        "finished_at": s.finished_at.isoformat() if s.finished_at else None,
        "total_score": None,
    }


def _not_found():
    return Response({"code": "NOT_FOUND", "message": "授業が見つかりません。"}, status=status.HTTP_404_NOT_FOUND)


def own_session(request, session_id):
    """本人の授業だけを返す。他人の授業は存在しないものとして扱う（404）"""
    return LearningSession.objects.filter(id=session_id, owner=request.user).first()


class SessionListView(APIView):
    """GET /api/v1/sessions/?limit= 本人の授業（新しい順）／ POST /api/v1/sessions/ 授業を始める"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit") or 20)
        except ValueError:
            limit = 20
        limit = max(1, min(limit, 50))
        sessions = LearningSession.objects.filter(owner=request.user).prefetch_related("session_lessons")[:limit]
        return Response({"results": [summary_json(s) for s in sessions]})

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        try:
            session = start_session(request.user, data.get("lesson_ids"), data.get("mode", "preset"))
        except SessionError as e:
            return Response({"code": e.code, "message": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(session_json(session), status=status.HTTP_201_CREATED)


class SessionDetailView(APIView):
    """GET /api/v1/sessions/{id}/ 本人の授業（会話の本文は返さない）"""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = own_session(request, session_id)
        return Response(session_json(session)) if session else _not_found()


class SessionFinishView(APIView):
    """POST /api/v1/sessions/{id}/finish/ 授業を終えて評価を始める（202）"""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = own_session(request, session_id)
        if session is None:
            return _not_found()
        session = finish_session(session)
        result = "evaluation_complete" if session.status == LearningSession.Status.FINISHED else "evaluation_pending"
        return Response({"session_id": session.id, "status": result}, status=status.HTTP_202_ACCEPTED)
