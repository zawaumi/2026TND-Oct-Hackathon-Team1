"""ぴあ友の知識の状態を変える唯一の入口（docs/02 の 4。最小限の実装）。

- 許可する変化は1段ずつ進むことだけ：未習 → 説明済み → 練習中 → 習得済み。戻すのは知識リセットだけ。
- 習得済みにできるのは、検証済みの根拠と習得条件で判定する処理（習得判定）だけ（allow_mastered=True）。
- 変えたら Peer.knowledge_version を1つ増やす（同時に届いた処理の衝突の検出に使う、docs/01 の競合制御）。
- 呼ぶ側はトランザクションの中で、ぴあ友の行をロックしてから呼ぶ。
"""

from django.utils import timezone

from .models import KnowledgeStatus, PeerKnowledge

ORDER = [KnowledgeStatus.UNKNOWN, KnowledgeStatus.INTRODUCED, KnowledgeStatus.PRACTICING, KnowledgeStatus.MASTERED]


class TransitionError(Exception):
    pass


def advance(peer, concept, new_status, *, allow_mastered=False):
    """概念の状態を1段進める。変わらなければ None、変われば変化（前 → 後）を返す。"""
    if new_status == KnowledgeStatus.MASTERED and not allow_mastered:
        raise TransitionError("習得済みにできるのは習得判定だけです")
    row, _ = PeerKnowledge.objects.select_for_update().get_or_create(peer=peer, concept=concept)
    old = row.status
    old_rank, new_rank = ORDER.index(old), ORDER.index(new_status)
    if new_rank <= old_rank:
        return None  # 後戻りや同じ状態にはしない
    if new_rank - old_rank > 1:
        raise TransitionError(f"{old} から {new_status} へは一度に進めません")
    row.status = new_status
    if new_status == KnowledgeStatus.MASTERED:
        row.mastered_at = timezone.now()
    row.save(update_fields=["status", "mastered_at", "updated_at"])
    peer.knowledge_version += 1
    peer.save(update_fields=["knowledge_version"])
    return {"concept_id": concept.id, "old_status": old, "new_status": new_status}
