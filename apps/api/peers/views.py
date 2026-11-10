from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import get_or_create_peer, knowledge_items


class PeerMeView(APIView):
    """GET /api/v1/peers/me/ 本人のぴあ友（contracts/openapi.yaml の Peer）"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        peer = get_or_create_peer(request.user)
        return Response(
            {
                "id": peer.id,
                "name": peer.display_name,
                "avatar_id": peer.avatar_id,
                "knowledge_version": peer.knowledge_version,
            }
        )


class PeerKnowledgeView(APIView):
    """GET /api/v1/peers/me/knowledge/?concept_ids=1,2 本人のぴあ友の知識の状態"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        concept_ids = None
        raw = request.query_params.get("concept_ids")
        if raw:
            try:
                concept_ids = [int(x) for x in raw.split(",") if x.strip()]
            except ValueError:
                return Response(
                    {"code": "INVALID_CONCEPT_IDS", "message": "concept_ids は数字をカンマで区切って指定してください。"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        peer = get_or_create_peer(request.user)
        return Response({"knowledge_version": peer.knowledge_version, "items": knowledge_items(peer, concept_ids)})
