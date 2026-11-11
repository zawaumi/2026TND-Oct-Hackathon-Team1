from django.db import transaction
from django.utils import timezone

from lessons.queries import leaf_lessons, visible_lessons
from peers.services import get_or_create_peer

from .models import LearningSession, SessionLesson

# 一度に選べる小単元の上限（docs/04 の 4.1）
MAX_LESSONS = 10


class SessionError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


@transaction.atomic
def start_session(user, lesson_ids, mode=LearningSession.Mode.PRESET):
    """授業を始める。選んだ教材を小単元まで展開して記録する（docs/02 の 2）。"""
    if mode != LearningSession.Mode.PRESET:
        raise SessionError("UNSUPPORTED_MODE", "いまは単元学習（preset）だけに対応しています。")
    if not isinstance(lesson_ids, list) or not lesson_ids or not all(isinstance(i, int) for i in lesson_ids):
        raise SessionError("INVALID_LESSONS", "小単元を1つ以上選んでください。")
    ids = list(dict.fromkeys(lesson_ids))  # 重複を除く（順番は保つ）
    found = {l.id: l for l in visible_lessons(user).filter(id__in=ids)}
    missing = [i for i in ids if i not in found]
    if missing:
        raise SessionError("LESSON_NOT_FOUND", "選んだ小単元の中に、見つからないものがあります。")
    leaves = leaf_lessons([found[i] for i in ids])
    if not leaves:
        raise SessionError("INVALID_LESSONS", "選んだ教材に、授業ができる小単元がありません。")
    if len(leaves) > MAX_LESSONS:
        raise SessionError("TOO_MANY_LESSONS", f"一度に選べる小単元は{MAX_LESSONS}個までです。")

    peer = get_or_create_peer(user)
    session = LearningSession.objects.create(owner=user, peer=peer, knowledge_version=peer.knowledge_version)
    SessionLesson.objects.bulk_create(
        [SessionLesson(session=session, lesson=lesson, sort_order=i) for i, lesson in enumerate(leaves)]
    )
    return session


@transaction.atomic
def finish_session(session):
    """授業を終えて評価を待つ状態にする。2回呼ばれても状態は変わらない（冪等）。"""
    session = LearningSession.objects.select_for_update().get(pk=session.pk)
    if session.status == LearningSession.Status.ACTIVE:
        session.status = LearningSession.Status.EVALUATION_PENDING
        session.finished_at = timezone.now()
        session.save(update_fields=["status", "finished_at"])
    return session
