"""授業の評価をつくり、学習レポートの形にする（Issue #42）。

- 授業を終えたとき（POST /sessions/{id}/finish/）に評価する。失敗しても、GET /evaluation/ のときにもう一度試す。
- 1つの授業に評価は1つ。2回呼ばれても作り直さない。
- 評価が終わったら、ターンの所見（TurnNote）は消す（docs/03 の G：所見は評価が終わるまでだけ保存）。
"""

import logging

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction

from learning.models import LearningSession, LearningTurn, TurnNote
from lessons.models import Lesson, LessonConcept
from lessons.queries import _prerequisite_edges, visible_lessons
from peers.models import KnowledgeStatus, PeerKnowledge

from .models import CriterionResult, Evaluation, Rubric
from .scoring import CriterionSpec, Finding, aggregate

logger = logging.getLogger(__name__)

SCORE_LABEL = "ぴあとも独自の説明力スコア"
ENGINE = "deepseek-findings"  # Jev（#28）ができたら、その評価候補に置き換える
MAX_NEXT_LESSONS = 3
READY = {KnowledgeStatus.PRACTICING, KnowledgeStatus.MASTERED}


def active_rubric(lesson_ids=()) -> Rubric:
    """使うルーブリック：授業の小単元専用のものがあればそれ、なければ共通のもの（いちばん新しい使用中）。"""
    active = Rubric.objects.filter(status=Rubric.Status.ACTIVE).prefetch_related("criteria")
    rubric = active.filter(lesson_id__in=list(lesson_ids)).first() or active.filter(lesson__isnull=True).first()
    if rubric is None:
        raise ImproperlyConfigured("使用中のルーブリックがありません（evaluations のマイグレーションを確認）。")
    return rubric


def _model_version():
    from integrations.deepseek import MockDeepSeekClient, get_client  # noqa: PLC0415

    return "mock" if isinstance(get_client(), MockDeepSeekClient) else settings.DEEPSEEK_MODEL


def _knowledge_changes(session):
    """授業の中のターンで起きた変化を、概念ごとに「最初の前 → 最後の後」にまとめる。"""
    merged: dict[int, dict] = {}
    turns = LearningTurn.objects.filter(session=session, status=LearningTurn.Status.DONE).order_by("id")
    for turn in turns:
        for change in (turn.result_cache or {}).get("knowledge_changes", []):
            cid = change["concept_id"]
            if cid in merged:
                merged[cid]["new_status"] = change["new_status"]
            else:
                merged[cid] = dict(change)
    return [c for c in merged.values() if c["old_status"] != c["new_status"]]


def _status_map(peer, concept_ids):
    return dict(PeerKnowledge.objects.filter(peer=peer, concept_id__in=concept_ids).values_list("concept_id", "status"))


def _next_lessons(session, user, peer):
    """次の学習の候補（docs/04 の 7.1）。公開中の小単元のうち、まだ習得済みになっていない概念を含むもの。

    ① 今回の授業の小単元、② 前提がそろった別の小単元（同じ校種・教科）の順に最大3件。
    """
    visible = visible_lessons(user)
    has_children = set(visible.exclude(parent__isnull=True).values_list("parent_id", flat=True))
    concepts_of: dict[int, list[int]] = {}
    for lc in LessonConcept.objects.filter(lesson__in=visible).order_by("sort_order", "id"):
        concepts_of.setdefault(lc.lesson_id, []).append(lc.concept_id)
    status = _status_map(peer, {c for ids in concepts_of.values() for c in ids})
    prereqs: dict[int, set[int]] = {}
    for e in _prerequisite_edges():
        prereqs.setdefault(e["target"], set()).add(e["source"])

    def open_lesson(lesson_id):
        ids = concepts_of.get(lesson_id, [])
        return lesson_id not in has_children and any(status.get(c) != KnowledgeStatus.MASTERED for c in ids)

    def prerequisites_ready(lesson_id):
        own = set(concepts_of.get(lesson_id, []))
        needed = set().union(*(prereqs.get(c, set()) for c in own)) - own if own else set()
        return all(status.get(c) in READY for c in needed)

    result = [lid for lid in session.lesson_ids() if open_lesson(lid)]
    first = Lesson.objects.filter(id__in=session.lesson_ids()[:1]).first()
    others = visible.exclude(id__in=session.lesson_ids())
    if first is not None:
        others = others.filter(school_level=first.school_level, subject=first.subject)
    for lesson in others.order_by("grade", "sort_order", "id"):
        if len(result) >= MAX_NEXT_LESSONS:
            break
        if open_lesson(lesson.id) and prerequisites_ready(lesson.id):
            result.append(lesson.id)
    return result[:MAX_NEXT_LESSONS]


def _mastered(session, peer):
    ids = set(LessonConcept.objects.filter(lesson_id__in=session.lesson_ids()).values_list("concept_id", flat=True))
    return sorted(cid for cid, s in _status_map(peer, ids).items() if s == KnowledgeStatus.MASTERED)


def evaluate_session(session) -> Evaluation | None:
    """授業を評価する。授業中なら None。評価済みなら、その評価を返す（作り直さない）。"""
    with transaction.atomic():
        session = LearningSession.objects.select_for_update().select_related("owner", "peer").get(pk=session.pk)
        existing = Evaluation.objects.filter(session=session).first()
        if existing is not None:
            return existing
        if session.status == LearningSession.Status.ACTIVE:
            return None

        rubric = active_rubric(session.lesson_ids())
        criteria = sorted(rubric.criteria.all(), key=lambda c: (c.sort_order, c.id))
        notes = TurnNote.objects.filter(session=session, turn__status=LearningTurn.Status.DONE).order_by("turn_id", "id")
        findings = [Finding(n.criterion, n.level, n.note, i) for i, n in enumerate(notes)]
        result = aggregate([CriterionSpec(c.code, c.weight) for c in criteria], findings)

        evaluation = Evaluation.objects.create(
            session=session,
            rubric=rubric,
            engine=ENGINE,
            model_version=_model_version(),
            status=result.status,
            total_score=result.total_score,
            strengths=list(result.strengths),
            knowledge_changes=_knowledge_changes(session),
            mastered_concept_ids=_mastered(session, session.peer),
            next_lesson_ids=_next_lessons(session, session.owner, session.peer),
        )
        by_code = {c.code: c for c in criteria}
        CriterionResult.objects.bulk_create(
            [
                CriterionResult(
                    evaluation=evaluation,
                    criterion=by_code[r.code],
                    status=r.status,
                    score=r.score,
                    evidence_count=r.evidence_count,
                    explanation=r.explanation,
                )
                for r in result.criteria
            ]
        )
        TurnNote.objects.filter(session=session).delete()
        session.status = LearningSession.Status.FINISHED
        session.save(update_fields=["status"])
    logger.info("evaluation session=%s status=%s total=%s", session.pk, evaluation.status, evaluation.total_score)
    return evaluation


def report_json(evaluation: Evaluation, user) -> dict:
    """contracts/openapi.yaml の EvaluationReport の形。次の学習の候補は、いまも公開中のものだけ。"""
    results = sorted(
        evaluation.results.select_related("criterion"), key=lambda r: (r.criterion.sort_order, r.criterion_id)
    )
    still_visible = set(visible_lessons(user).filter(id__in=evaluation.next_lesson_ids).values_list("id", flat=True))
    return {
        "status": evaluation.status,
        "score_label": SCORE_LABEL,
        "total_score": evaluation.total_score,
        "rubric_version": evaluation.rubric.version,
        "criterion_results": [
            {
                "code": r.criterion.code,
                "label": r.criterion.perspective,
                "weight": r.criterion.weight,
                "status": r.status,
                "score": r.score,
                "explanation": r.explanation or None,
            }
            for r in results
        ],
        "mastered_concept_ids": evaluation.mastered_concept_ids,
        "knowledge_changes": evaluation.knowledge_changes,
        "next_lesson_ids": [i for i in evaluation.next_lesson_ids if i in still_visible],
        "strengths": evaluation.strengths,
    }
