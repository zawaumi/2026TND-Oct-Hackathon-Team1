import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from evaluations.services import evaluate_session, report_json

from .models import LearningSession
from .services import SessionError, finish_session, start_session
from .turns import TurnError, get_turn, submit_turn

logger = logging.getLogger(__name__)


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
    """contracts/openapi.yaml の SessionSummary の形。点数は評価が済んでいなければ null"""
    evaluation = getattr(s, "evaluation", None) if s.status == LearningSession.Status.FINISHED else None
    return {
        "id": s.id,
        "status": s.status,
        "mode": s.mode,
        "lesson_ids": s.lesson_ids(),
        "started_at": s.started_at.isoformat(),
        "finished_at": s.finished_at.isoformat() if s.finished_at else None,
        "total_score": evaluation.total_score if evaluation else None,
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
        sessions = (
            LearningSession.objects.filter(owner=request.user)
            .select_related("evaluation")
            .prefetch_related("session_lessons")[:limit]
        )
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
        try:
            evaluated = evaluate_session(session) is not None
        except Exception:
            # 評価に失敗しても授業は終える。GET /evaluation/ のときにもう一度試す
            logger.exception("evaluation failed session=%s", session.pk)
            evaluated = False
        result = "evaluation_complete" if evaluated else "evaluation_pending"
        return Response({"session_id": session.id, "status": result}, status=status.HTTP_202_ACCEPTED)


class EvaluationView(APIView):
    """GET /api/v1/sessions/{id}/evaluation/ 学習レポート（3観点の説明力スコア・習得の変化・次の学習の候補）"""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = own_session(request, session_id)
        if session is None:
            return _not_found()
        if session.status == LearningSession.Status.ACTIVE:
            return Response(
                {"code": "SESSION_NOT_FINISHED", "message": "授業を終えると、学習レポートが見られます。"},
                status=status.HTTP_404_NOT_FOUND,
            )
        evaluation = evaluate_session(session)
        return Response(report_json(evaluation, request.user))


def _turn_result(outcome, request_id):
    if outcome.pending:
        return Response({"status": "processing", "request_id": str(request_id)}, status=status.HTTP_202_ACCEPTED)
    return Response(outcome.response)


class MessageView(APIView):
    """POST /api/v1/sessions/{id}/messages/ 説明を送り、検証済みのぴあ友の応答を受け取る"""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = own_session(request, session_id)
        if session is None:
            return _not_found()
        data = request.data if isinstance(request.data, dict) else {}
        try:
            outcome = submit_turn(session, data.get("request_id"), data.get("content"), data.get("recent_context"))
        except TurnError as e:
            return Response({"code": e.code, "message": e.message}, status=e.status)
        return _turn_result(outcome, data.get("request_id"))


class TurnView(APIView):
    """GET /api/v1/sessions/{id}/turns/{request_id}/ 送信の処理の状態"""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id, request_id):
        session = own_session(request, session_id)
        if session is None:
            return _not_found()
        try:
            outcome = get_turn(session, request_id)
        except TurnError as e:
            return Response({"code": e.code, "message": e.message}, status=e.status)
        return _turn_result(outcome, request_id)
