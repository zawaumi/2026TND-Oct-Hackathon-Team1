"""教材の取得。画面の GET /lessons/・/knowledge-graph/ のための絞り込みと組み立て。"""

from django.db.models import Q

from peers.models import KnowledgeStatus, PeerKnowledge

from .models import Concept, Lesson, Scope


def visible_lessons(user):
    """本人が見てよい公開中の教材：公開教材（CURATED）と本人の私有。下書きは出さない（docs/04 の 4.1）。"""
    return Lesson.objects.filter(status=Lesson.Status.PUBLISHED).filter(
        Q(scope=Scope.CURATED) | Q(scope=Scope.PRIVATE, owner=user)
    )


def filter_lessons(user, *, school_level=None, grade=None, subject=None, parent_id=None):
    """絞り込んだ教材と、その上の階層（領域・単元）をまとめて返す。

    画面は平らな一覧から木を組み立てる（apps/web の lib/lessons.ts）ので、
    絞り込みに合った小単元の親も一緒に返さないと、木の途中が抜けてしまう。
    学年・教科などで絞り込むのは「子を持たない教材（小単元）」だけで、親は自動で足す。
    """
    base = visible_lessons(user).select_related("curriculum_item").prefetch_related("lesson_concepts")
    matched = base
    if school_level:
        matched = matched.filter(school_level=school_level)
    if grade is not None:
        matched = matched.filter(grade=grade)
    if subject:
        matched = matched.filter(subject=subject)
    if parent_id is not None:
        matched = matched.filter(parent_id=parent_id)
        return list(matched.order_by("sort_order", "id"))

    found = {l.id: l for l in matched}
    # 親をたどって足す（見てよい公開中の教材だけ）
    visible_by_id = {l.id: l for l in base}
    pending = [l.parent_id for l in found.values() if l.parent_id]
    while pending:
        pid = pending.pop()
        if pid in found or pid not in visible_by_id:
            continue
        parent = visible_by_id[pid]
        found[pid] = parent
        if parent.parent_id:
            pending.append(parent.parent_id)
    return sorted(found.values(), key=lambda l: (l.parent_id or 0, l.sort_order, l.id))


def lesson_json(lesson):
    """contracts/openapi.yaml の Lesson の形にする。"""
    concept_ids = [lc.concept_id for lc in sorted(lesson.lesson_concepts.all(), key=lambda lc: (lc.sort_order, lc.id))]
    return {
        "id": lesson.id,
        "parent_id": lesson.parent_id,
        "curriculum_item_code": (lesson.curriculum_item.official_code or None) if lesson.curriculum_item else None,
        "title": lesson.title,
        "grade": lesson.grade,
        "mode": lesson.mode,
        "published": lesson.status == Lesson.Status.PUBLISHED,
        "concept_ids": concept_ids,
    }


def leaf_lessons(lessons):
    """選ばれた教材を小単元（子のない教材）まで展開する（docs/02 の 2）。順番は保つ。"""
    result = []
    seen = set()

    def walk(lesson):
        children = list(lesson.children.filter(status=Lesson.Status.PUBLISHED).order_by("sort_order", "id"))
        if not children:
            if lesson.id not in seen:
                seen.add(lesson.id)
                result.append(lesson)
            return
        for child in children:
            walk(child)

    for lesson in lessons:
        walk(lesson)
    return result


def knowledge_graph(user, peer, lesson_id=None):
    """知識マップの概念（ノード）と前提関係（辺）。lesson_id があれば、その教材の概念とその前提だけ。"""
    concepts = Concept.objects.filter(Q(scope=Scope.CURATED) | Q(scope=Scope.PRIVATE, owner=user))
    if lesson_id is not None:
        lesson = visible_lessons(user).filter(id=lesson_id).first()
        if lesson is None:
            return None
        ids = set(lesson.concepts.values_list("id", flat=True))
        for leaf in leaf_lessons([lesson]):
            ids.update(leaf.concepts.values_list("id", flat=True))
        ids |= _prerequisites_of(ids)
        concepts = concepts.filter(id__in=ids)
    concepts = list(concepts.order_by("id"))
    status = dict(
        PeerKnowledge.objects.filter(peer=peer, concept__in=concepts).values_list("concept_id", "status")
    )
    nodes = [
        {
            "id": c.id,
            "code": c.code,
            "label": c.title,
            "description": c.description or None,
            "status": status.get(c.id, KnowledgeStatus.UNKNOWN),
        }
        for c in concepts
    ]
    ids = {c.id for c in concepts}
    edges = [e for e in _prerequisite_edges() if e["source"] in ids and e["target"] in ids]
    return {"nodes": nodes, "edges": edges}


def _prerequisite_edges():
    """前提関係（ConceptPrerequisite）。まだモデルがないときは空。"""
    try:
        from .models import ConceptPrerequisite  # noqa: PLC0415  前提関係のモデルを足したら使われる
    except ImportError:
        return []
    return [
        {"source": p.prerequisite_id, "target": p.concept_id, "relation": "prerequisite"}
        for p in ConceptPrerequisite.objects.all()
    ]


def _prerequisites_of(concept_ids):
    """概念の前提を、たどれるだけたどって返す。"""
    edges = _prerequisite_edges()
    result = set()
    frontier = set(concept_ids)
    while frontier:
        nxt = {e["source"] for e in edges if e["target"] in frontier} - result - set(concept_ids)
        result |= nxt
        frontier = nxt
    return result
