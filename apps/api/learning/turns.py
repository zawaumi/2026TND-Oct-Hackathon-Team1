"""1ターンの処理（docs/01 の 3、docs/03、Issue #32。受付と競合は #23・#24 の最小限）。

流れ：
  1. 受付（短いトランザクション）：(授業, request_id) で再送か新しい送信かを判定し、処理中として記録する
  2. 方針（#29）：DRF が action と対象の概念を決める
  3. DeepSeek（#30）：ロックを持たずに呼ぶ（AI を待つ間に DB をふさがない）
  4. 検証（#31）：だめなら定型の応答にし、知識は変えない
  5. 確定（短いトランザクション）：ぴあ友の知識の版が受付のときと同じなら、状態を進めて応答を保存する
"""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from integrations.deepseek import get_client
from integrations.payload import ContextLine, PeerTurnInput
from lessons.queries import _prerequisite_edges
from peers.knowledge import advance
from peers.models import KnowledgeStatus, Peer, PeerKnowledge

from .input_check import classify
from .models import LearningSession, LearningTurn, TurnNote
from .policy import ConceptState, Decision, choose
from .validation import fallback, validate

PROCESSING_TTL = timedelta(seconds=60)  # これを過ぎた「処理中」は、同じ送信の再送でやり直せる（#25 の最小限）


class TurnError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(frozen=True)
class TurnOutcome:
    pending: bool
    response: dict | None = None


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _parse_request_id(value) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise TurnError(400, "INVALID_REQUEST_ID", "request_id は UUID で指定してください。") from None


def _session_concepts(session):
    """授業の概念（小単元の並び順・重複なし）と、その概念が入っている小単元の名前。"""
    concepts, lesson_of = [], {}
    for sl in session.session_lessons.select_related("lesson").order_by("sort_order", "id"):
        for lc in sl.lesson.lesson_concepts.select_related("concept").order_by("sort_order", "id"):
            if lc.concept_id not in lesson_of:
                concepts.append(lc.concept)
                lesson_of[lc.concept_id] = sl.lesson.title
    return concepts, lesson_of


def _concept_states(peer, concepts):
    status = dict(PeerKnowledge.objects.filter(peer=peer, concept__in=concepts).values_list("concept_id", "status"))
    edges = _prerequisite_edges()
    ready = {KnowledgeStatus.PRACTICING, KnowledgeStatus.MASTERED}
    states = []
    for c in concepts:
        prereqs = [e["source"] for e in edges if e["target"] == c.id]
        prereq_status = dict(PeerKnowledge.objects.filter(peer=peer, concept_id__in=prereqs).values_list("concept_id", "status"))
        states.append(
            ConceptState(
                id=c.id,
                status=status.get(c.id, KnowledgeStatus.UNKNOWN),
                prerequisites_ready=all(prereq_status.get(p) in ready for p in prereqs),
            )
        )
    return states


def _recent_context(raw) -> tuple[ContextLine, ...]:
    """画面から届く直近の会話。権威はない（習得の根拠にしない）ので、AI の文脈としてだけ使う。"""
    if not isinstance(raw, list):
        return ()
    lines = []
    for item in raw[-8:]:
        if isinstance(item, dict) and item.get("role") in ("user", "peer") and isinstance(item.get("content"), str):
            lines.append(ContextLine(item["role"], item["content"]))
    return tuple(lines)


def _accept(session, request_id, input_hash):
    """受付。新しい送信なら処理中のターンを作って返す。再送なら (None, 前の結果) を返す。"""
    now = timezone.now()
    with transaction.atomic():
        LearningSession.objects.select_for_update().get(pk=session.pk)  # 同じ授業の受付を1つずつにする
        turn = LearningTurn.objects.select_for_update().filter(session=session, request_id=request_id).first()
        if turn:
            if turn.input_hash != input_hash:
                raise TurnError(409, "REQUEST_ID_CONFLICT", "同じ送信IDで、違う内容が送られました。")
            if turn.status == LearningTurn.Status.DONE:
                return None, TurnOutcome(False, turn.result_cache)
            if turn.status == LearningTurn.Status.PROCESSING and turn.expires_at > now:
                return None, TurnOutcome(True)
            # 失敗した・期限切れの送信は、同じ送信IDでやり直す
        busy = LearningTurn.objects.filter(
            session=session, status=LearningTurn.Status.PROCESSING, expires_at__gt=now
        ).exclude(request_id=request_id)
        if busy.exists():
            raise TurnError(409, "TURN_IN_PROGRESS", "前の送信をまだ処理しています。少し待ってから送ってください。")
        peer = Peer.objects.get(pk=session.peer_id)
        if turn is None:
            try:
                turn = LearningTurn.objects.create(
                    session=session,
                    request_id=request_id,
                    input_hash=input_hash,
                    knowledge_version=peer.knowledge_version,
                    expires_at=now + PROCESSING_TTL,
                )
            except IntegrityError:
                raise TurnError(409, "TURN_IN_PROGRESS", "同じ送信を処理しています。") from None
        else:
            turn.status = LearningTurn.Status.PROCESSING
            turn.knowledge_version = peer.knowledge_version
            turn.expires_at = now + PROCESSING_TTL
            turn.save(update_fields=["status", "knowledge_version", "expires_at"])
        return turn, None


def submit_turn(session, raw_request_id, content, recent_context=None) -> TurnOutcome:
    if session.status != LearningSession.Status.ACTIVE:
        raise TurnError(409, "SESSION_NOT_ACTIVE", "この授業はもう終わっています。")
    request_id = _parse_request_id(raw_request_id)
    verdict, text = classify(content)
    if verdict == "REJECT":
        raise TurnError(400, "INVALID_CONTENT", "説明を1文字以上、4000文字以内で入力してください。")

    turn, previous = _accept(session, request_id, _hash(text))
    if previous is not None:
        return previous

    try:
        response = _process(session, turn, text, verdict, recent_context)
    except Exception:
        # 失敗したターンは、同じ送信IDの再送でやり直せる
        LearningTurn.objects.filter(pk=turn.pk).update(status=LearningTurn.Status.FAILED)
        raise
    return TurnOutcome(False, response)


def _process(session, turn, text, verdict, recent_context):
    peer = Peer.objects.get(pk=session.peer_id)
    concepts, lesson_of = _session_concepts(session)
    if not concepts:
        raise TurnError(409, "NO_CONCEPTS", "この授業には、教えられる概念がありません。")
    done_turns = LearningTurn.objects.filter(session=session, status=LearningTurn.Status.DONE).count()
    decision: Decision = choose(_concept_states(peer, concepts), text, done_turns, data_only=verdict == "DATA_ONLY")
    concept = next(c for c in concepts if c.id == decision.concept_id)

    # AI はロックの外で呼ぶ
    result = get_client().generate(
        PeerTurnInput(
            action=decision.action,
            concept_id=concept.id,
            concept_title=concept.title,
            concept_description=concept.description,
            lesson_title=lesson_of.get(concept.id, ""),
            teacher_message=text,
            recent_context=_recent_context(recent_context),
        )
    )
    peer_response, findings = validate(result.parsed, decision) if result.ok else (None, [])
    fallback_used = peer_response is None
    if fallback_used:
        peer_response, findings = fallback(decision), []

    with transaction.atomic():
        locked = Peer.objects.select_for_update().get(pk=peer.pk)
        if locked.knowledge_version != turn.knowledge_version:
            # 処理している間に、ほかの処理（リセットや演習）で知識が変わった。古い処理として捨てる（#24）
            raise TurnError(409, "STALE_KNOWLEDGE_VERSION", "状態が更新されました。最新情報を取得してください。")
        changes = []
        if decision.introduce and not fallback_used:
            change = advance(locked, concept, KnowledgeStatus.INTRODUCED)
            if change:
                changes.append(change)
        response = {
            "request_id": str(turn.request_id),
            "turn_id": turn.id,
            "knowledge_version": locked.knowledge_version,
            "peer_response": peer_response,
            "knowledge_changes": changes,
            "fallback_used": fallback_used,
        }
        LearningTurn.objects.filter(pk=turn.pk).update(status=LearningTurn.Status.DONE, result_cache=response)
        TurnNote.objects.bulk_create(
            [TurnNote(session=session, turn=turn, criterion=f["criterion"], note=f["note"]) for f in findings]
        )
    return response


def get_turn(session, raw_request_id) -> TurnOutcome:
    """GET /sessions/{id}/turns/{request_id}/ 送信の処理の状態"""
    request_id = _parse_request_id(raw_request_id)
    turn = LearningTurn.objects.filter(session=session, request_id=request_id).first()
    if turn is None:
        raise TurnError(404, "NOT_FOUND", "送信が見つかりません。")
    if turn.status == LearningTurn.Status.DONE:
        return TurnOutcome(False, turn.result_cache)
    if turn.status == LearningTurn.Status.PROCESSING and turn.expires_at > timezone.now():
        return TurnOutcome(True)
    raise TurnError(410, "TURN_EXPIRED", "送信の結果を取り出せませんでした。もう一度送ってください。")
