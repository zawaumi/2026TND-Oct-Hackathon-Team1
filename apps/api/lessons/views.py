from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from peers.services import get_or_create_peer

from .queries import filter_lessons, knowledge_graph, lesson_json, visible_lessons


def _bad_request(code, message):
    return Response({"code": code, "message": message}, status=status.HTTP_400_BAD_REQUEST)


def _int_param(request, name, *, minimum=1, maximum=None):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None, None
    try:
        value = int(raw)
    except ValueError:
        return None, _bad_request("INVALID_PARAMETER", f"{name} は数字で指定してください。")
    if value < minimum or (maximum is not None and value > maximum):
        return None, _bad_request("INVALID_PARAMETER", f"{name} の値が範囲外です。")
    return value, None


class LessonListView(APIView):
    """GET /api/v1/lessons/?school_level=&grade=&subject=&parent_id= 公開中の教材の一覧（ADR-031）"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        school_level = request.query_params.get("school_level") or None
        if school_level not in (None, "middle", "high"):
            return _bad_request("INVALID_PARAMETER", "school_level は middle か high です。")
        grade, err = _int_param(request, "grade", maximum=3)
        if err:
            return err
        parent_id, err = _int_param(request, "parent_id")
        if err:
            return err
        subject = (request.query_params.get("subject") or "").strip()[:50] or None
        lessons = filter_lessons(
            request.user, school_level=school_level, grade=grade, subject=subject, parent_id=parent_id
        )
        return Response({"results": [lesson_json(l) for l in lessons]})


class LessonDetailView(APIView):
    """GET /api/v1/lessons/{id}/ 公開中の教材1件。見てよくないものは 404"""

    permission_classes = [IsAuthenticated]

    def get(self, request, lesson_id):
        lesson = visible_lessons(request.user).filter(id=lesson_id).prefetch_related("lesson_concepts").first()
        if lesson is None:
            return Response({"code": "NOT_FOUND", "message": "教材が見つかりません。"}, status=status.HTTP_404_NOT_FOUND)
        return Response(lesson_json(lesson))


class KnowledgeGraphView(APIView):
    """GET /api/v1/knowledge-graph/?lesson_id= 概念と前提関係。状態は本人のぴあ友のもの"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        lesson_id, err = _int_param(request, "lesson_id")
        if err:
            return err
        graph = knowledge_graph(request.user, get_or_create_peer(request.user), lesson_id)
        if graph is None:
            return Response({"code": "NOT_FOUND", "message": "教材が見つかりません。"}, status=status.HTTP_404_NOT_FOUND)
        return Response(graph)
