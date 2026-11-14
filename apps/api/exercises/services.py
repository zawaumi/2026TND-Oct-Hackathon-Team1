"""問題を出す（POST /sessions/{id}/exercises/）・ぴあ友が解く（POST /exercises/{id}/attempt/）。

流れ：
1. 問題を出す：式を読み、検証できるかを決める（VERIFIED／PROVISIONAL／UNSUPPORTED）。
   - VERIFIED：一次方程式で、解き方の中で対象の概念の技能を使うもの
   - PROVISIONAL：解けるが、対象の概念の技能を使わない／対象の概念が問題で習得を確かめられない（習得の回数に入らない）
   - UNSUPPORTED：一次方程式（文字は x 1つ）として読めない。理由を返す
2. ぴあ友が解く：説明済み以上の概念の技能だけで、1ステップずつ解く（solver.make_plan）。
   - 使えない技能に来たら blocked（足りない技能を返す）。対象の概念がまだ教わっていなければ blocked
   - 解けたら、別の方法で検証し（solver.verify_plan）、VERIFIED なら習得の根拠を記録する
3. 習得の判定：根拠の数（問題の形ごとに1回）が習得条件に届いたら、習得済みにする。
   状態を変えるのは peers/knowledge.py の advance だけ（1段ずつ：説明済み → 練習中 → 習得済み）。
"""

import hashlib
import json
import uuid
from dataclasses import dataclass
from fractions import Fraction

from django.db import IntegrityError, transaction

from learning.models import LearningSession
from lessons.curated import Lin
from lessons.skills import AUX_SKILLS, SKILL_LABELS, concept_meta, required_skill_groups
from peers.knowledge import advance
from peers.models import KnowledgeStatus, Peer, PeerKnowledge

from . import solver
from .models import Exercise, ExerciseAttempt, MasteryEvidence, VerificationStatus

KNOWN = {KnowledgeStatus.INTRODUCED, KnowledgeStatus.PRACTICING, KnowledgeStatus.MASTERED}
ALL_MAIN_SKILLS = frozenset(SKILL_LABELS) - AUX_SKILLS
MAX_QUESTION = 2000
MAX_LATEX = 1500


class ExerciseError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(frozen=True)
class Classified:
    status: str
    reason: str
    equation: solver.Equation | None


def _parse_uuid(raw):
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        raise ExerciseError(400, "INVALID_REQUEST_ID", "送信IDの形が正しくありません。") from None


def _session_concept_ids(session):
    ids = []
    for sl in session.session_lessons.select_related("lesson").order_by("sort_order", "id"):
        for cid in sl.lesson.lesson_concepts.order_by("sort_order", "id").values_list("concept_id", flat=True):
            if cid not in ids:
                ids.append(cid)
    return ids


def _eq_to_json(eq):
    return {k: str(v) for k, v in (("a", eq.left.a), ("b", eq.left.b), ("c", eq.right.a), ("d", eq.right.b))}


def _eq_from_json(d):
    return solver.Equation(Lin(Fraction(d["a"]), Fraction(d["b"])), Lin(Fraction(d["c"]), Fraction(d["d"])))


def _uses_target_skills(code, used):
    groups = required_skill_groups(code)
    return bool(groups) and all(used & g for g in groups)


def classify(kind, latex, question, concept):
    """問題の検証の状態を決める（ぴあ友の知識には関係なく、問題そのものについて）"""
    if kind != Exercise.Kind.MATH_EQUATION:
        return Classified(VerificationStatus.PROVISIONAL, "数式の問題でないため、自動で検証できません。", None)
    try:
        eq = solver.parse_input(latex, question)
    except solver.UnsupportedEquation as e:
        return Classified(VerificationStatus.UNSUPPORTED, str(e), None)
    meta = concept_meta(concept.code)
    if not meta.verified or meta.policy is None:
        return Classified(VerificationStatus.PROVISIONAL, f"「{concept.title}」は、問題で習得を確かめられない概念です。", eq)
    plan = solver.make_plan(eq, ALL_MAIN_SKILLS | AUX_SKILLS, solver.format_equation(eq.left, eq.right))
    if not _uses_target_skills(concept.code, plan.used):
        return Classified(
            VerificationStatus.PROVISIONAL, f"この問題は「{concept.title}」の技能を使わずに解けるため、習得の回数には入りません。", eq
        )
    return Classified(VerificationStatus.VERIFIED, "", eq)


def exercise_json(ex):
    return {
        "id": ex.id,
        "kind": ex.kind,
        "verification_status": ex.verification_status,
        "reason": ex.reason or None,
        "target_concept_id": ex.target_concept_id,
    }


def create_exercise(session, data):
    """問題を出す。同じ送信の再送には、同じ問題を返す"""
    if session.status != LearningSession.Status.ACTIVE:
        raise ExerciseError(409, "SESSION_NOT_ACTIVE", "この授業はもう終わっています。")
    allowed = {"request_id", "kind", "question", "latex", "target_concept_id"}
    if not isinstance(data, dict) or set(data) - allowed:
        raise ExerciseError(400, "INVALID_FIELDS", "受け付けない項目が含まれています。")
    request_id = _parse_uuid(data.get("request_id"))
    kind = data.get("kind")
    if kind not in Exercise.Kind.values:
        raise ExerciseError(400, "INVALID_KIND", "問題の種類が正しくありません。")
    question, latex = data.get("question"), data.get("latex")
    if not isinstance(question, str) or not question.strip() or len(question) > MAX_QUESTION:
        raise ExerciseError(400, "INVALID_QUESTION", "問題を入力してください。")
    if latex is not None and (not isinstance(latex, str) or len(latex) > MAX_LATEX):
        raise ExerciseError(400, "INVALID_LATEX", "式が長すぎます。")
    target_id = data.get("target_concept_id")
    if not isinstance(target_id, int) or isinstance(target_id, bool) or target_id not in _session_concept_ids(session):
        raise ExerciseError(400, "INVALID_TARGET", "この授業の概念を選んでください。")

    input_hash = hashlib.sha256(json.dumps([kind, question, latex, target_id], ensure_ascii=False).encode()).hexdigest()
    existing = Exercise.objects.filter(session=session, request_id=request_id).first()
    if existing is not None:
        if existing.input_hash != input_hash:
            raise ExerciseError(409, "REQUEST_ID_CONFLICT", "同じ送信IDで、違う問題が送られました。")
        return existing

    from lessons.models import Concept  # noqa: PLC0415

    concept = Concept.objects.get(id=target_id)
    c = classify(kind, latex, question, concept)
    try:
        with transaction.atomic():
            return Exercise.objects.create(
                session=session,
                target_concept=concept,
                request_id=request_id,
                input_hash=input_hash,
                kind=kind,
                verification_status=c.status,
                reason=c.reason[:200],
                equation=_eq_to_json(c.equation) if c.equation else None,
                form=solver.form_code(c.equation) if c.equation else "",
            )
    except IntegrityError:
        return Exercise.objects.get(session=session, request_id=request_id)


def _status_of(peer, concept_ids):
    return dict(PeerKnowledge.objects.filter(peer=peer, concept_id__in=concept_ids).values_list("concept_id", "status"))


def _allowed_skills(peer):
    """ぴあ友が説明を受けた（説明済み以上の）概念の技能と、式を整える補助"""
    from lessons.models import Concept  # noqa: PLC0415

    known = PeerKnowledge.objects.filter(peer=peer, status__in=KNOWN).values_list("concept_id", flat=True)
    skills = set(AUX_SKILLS)
    for code in Concept.objects.filter(id__in=list(known)).values_list("code", flat=True):
        skills |= concept_meta(code).skills
    return frozenset(skills)


def attempt_exercise(user, exercise_id, raw_request_id):
    """ぴあ友が解く。同じ送信の再送には、同じ結果を返す"""
    request_id = _parse_uuid(raw_request_id)
    ex = (
        Exercise.objects.select_related("session", "target_concept")
        .filter(id=exercise_id, session__owner=user)
        .first()
    )
    if ex is None:
        raise ExerciseError(404, "NOT_FOUND", "問題が見つかりません。")
    done = ExerciseAttempt.objects.filter(exercise=ex, request_id=request_id).first()
    if done is not None:
        return done.result_cache
    if ex.session.status != LearningSession.Status.ACTIVE:
        raise ExerciseError(409, "SESSION_NOT_ACTIVE", "この授業はもう終わっています。")
    if ex.verification_status == VerificationStatus.UNSUPPORTED:
        raise ExerciseError(400, "UNSUPPORTED_EXERCISE", ex.reason or "この問題には対応していません。")

    try:
        with transaction.atomic():
            peer = Peer.objects.select_for_update().get(pk=ex.session.peer_id)
            return _attempt_locked(ex, peer, request_id)
    except IntegrityError:
        # 同じ送信が同時に2回届いた：先に確定した方を返す
        return ExerciseAttempt.objects.get(exercise=ex, request_id=request_id).result_cache


def _attempt_locked(ex, peer, request_id):
    concept = ex.target_concept
    row, _ = PeerKnowledge.objects.get_or_create(peer=peer, concept=concept)
    base = {"verification_status": ex.verification_status, "knowledge_changes": []}

    def finish(result, *, reason="", blocked_skill="", steps=(), changes=()):
        attempt = ExerciseAttempt.objects.create(
            exercise=ex,
            peer=peer,
            request_id=request_id,
            result=result,
            reason=reason,
            blocked_skill=blocked_skill,
            reset_epoch=row.reset_epoch,
        )
        payload = {
            **base,
            "id": attempt.id,
            "result": result,
            "reason": reason or None,
            "blocked_skill": blocked_skill or None,
            "steps": [{"expr": s.expr, "skill": s.skill, "skill_label": s.skill_label} for s in steps],
            "knowledge_changes": list(changes),
            "knowledge_version": peer.knowledge_version,
        }
        attempt.result_cache = payload
        attempt.save(update_fields=["result_cache"])
        return attempt, payload

    if ex.kind != Exercise.Kind.MATH_EQUATION or not ex.equation:
        return finish(ExerciseAttempt.Result.UNVERIFIED, reason="provisional")[1]

    eq = _eq_from_json(ex.equation)
    original = solver.format_equation(eq.left, eq.right)
    if row.status == KnowledgeStatus.UNKNOWN:
        # 対象の概念をまだ教わっていない：解き始めない
        first = (solver.Step(expr=original, skill=None, skill_label=None),)
        return finish(ExerciseAttempt.Result.BLOCKED, blocked_skill=concept.title[:60], steps=first)[1]

    plan = solver.make_plan(eq, _allowed_skills(peer), original)
    if plan.blocked_skill is not None:
        return finish(ExerciseAttempt.Result.BLOCKED, blocked_skill=SKILL_LABELS[plan.blocked_skill], steps=plan.steps)[1]
    if not solver.verify_plan(eq, plan):
        return finish(ExerciseAttempt.Result.UNVERIFIED, steps=plan.steps)[1]

    if ex.verification_status != VerificationStatus.VERIFIED:
        return finish(ExerciseAttempt.Result.CORRECT, reason="provisional", steps=plan.steps)[1]

    # 検証済みの正解：習得の根拠にする（同じ形の問題は1回だけ）
    if MasteryEvidence.objects.filter(peer=peer, concept=concept, reset_epoch=row.reset_epoch, variant_code=ex.form).exists():
        return finish(ExerciseAttempt.Result.CORRECT, reason="duplicate_form", steps=plan.steps)[1]

    attempt, _ = finish(ExerciseAttempt.Result.CORRECT, steps=plan.steps)
    MasteryEvidence.objects.create(
        peer=peer, concept=concept, attempt=attempt, reset_epoch=row.reset_epoch, variant_code=ex.form
    )
    changes = []
    change = advance(peer, concept, KnowledgeStatus.PRACTICING)  # 説明済み → 練習中（すでに先なら何もしない）
    if change:
        changes.append(change)
    evidence = MasteryEvidence.objects.filter(peer=peer, concept=concept, reset_epoch=row.reset_epoch)
    count = evidence.count()
    variants = evidence.values("variant_code").distinct().count()
    policy = concept_meta(concept.code).policy
    PeerKnowledge.objects.filter(pk=row.pk).update(verified_correct=count)
    if policy and count >= policy.required_correct and variants >= policy.required_variants:
        change = advance(peer, concept, KnowledgeStatus.MASTERED, allow_mastered=True)
        if change:
            changes.append(change)
    if not changes:
        # 状態は変わらなくても、正答の数は変わった：知識の版を進める
        peer.knowledge_version += 1
        peer.save(update_fields=["knowledge_version"])
    payload = {
        **attempt.result_cache,
        "knowledge_changes": changes,
        "knowledge_version": peer.knowledge_version,
    }
    attempt.result_cache = payload
    attempt.save(update_fields=["result_cache"])
    return payload
