from django.db import IntegrityError, transaction

from lessons.models import Concept, Scope
from lessons.skills import concept_meta

from .models import KnowledgeStatus, Peer, PeerKnowledge

# 習得に必要な検証済みの正答の数。教材データに習得条件がない概念の既定値（docs/03・ADR-023）
DEFAULT_REQUIRED_CORRECT = 2


def get_or_create_peer(user):
    """本人のぴあ友を返す。まだいなければ作る（1ユーザー1ぴあ友）。"""
    peer = Peer.objects.filter(owner=user).first()
    if peer:
        return peer
    try:
        with transaction.atomic():
            return Peer.objects.create(owner=user)
    except IntegrityError:
        # 同時に2回呼ばれたときは、先に作られた方を使う
        return Peer.objects.get(owner=user)


def visible_concepts(user):
    """本人が見てよい概念：公開教材の概念と、本人の私有の概念。"""
    return Concept.objects.filter(scope=Scope.CURATED) | Concept.objects.filter(scope=Scope.PRIVATE, owner=user)


def knowledge_items(peer, concept_ids=None):
    """概念ごとの状態の一覧。行がない概念は未習として返す。

    concept_ids を渡したときは、その中で本人が見てよい概念だけを返す（他人の私有の概念は返さない）。
    """
    concepts = visible_concepts(peer.owner)
    if concept_ids is not None:
        concepts = concepts.filter(id__in=concept_ids)
    rows = {k.concept_id: k for k in PeerKnowledge.objects.filter(peer=peer, concept__in=concepts)}
    items = []
    for concept_id, code in concepts.order_by("id").values_list("id", "code"):
        policy = concept_meta(code).policy
        row = rows.get(concept_id)
        items.append(
            {
                "concept_id": concept_id,
                "status": row.status if row else KnowledgeStatus.UNKNOWN,
                "verified_correct": row.verified_correct if row else 0,
                "required_correct": policy.required_correct if policy else DEFAULT_REQUIRED_CORRECT,
                "reset_epoch": row.reset_epoch if row else 0,
            }
        )
    return items
