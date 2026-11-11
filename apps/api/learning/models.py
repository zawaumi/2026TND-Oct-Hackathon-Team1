"""授業（学習セッション）と、授業で選んだ小単元（docs/02_data_model.md の 1・2、Issue #19）。

- 授業は本人とそのぴあ友に属する（owner と peer の持ち主は同じ）。
- 小単元は複数選べる。単元を選んだときは小単元まで展開して SessionLesson に記録する。
- 会話の本文はここに保存しない（docs/00 のプライバシー方針）。
"""

from django.conf import settings
from django.db import models

from lessons.models import Lesson
from peers.models import Peer


class LearningSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "授業中"
        EVALUATION_PENDING = "evaluation_pending", "評価中"
        FINISHED = "finished", "終了"

    class Mode(models.TextChoices):
        PRESET = "preset", "単元学習"
        FREE = "free", "自由学習"
        INQUIRY = "inquiry", "探究学習"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="learning_sessions")
    peer = models.ForeignKey(Peer, on_delete=models.CASCADE, related_name="sessions")
    mode = models.CharField("学習の種類", max_length=8, choices=Mode.choices, default=Mode.PRESET)
    status = models.CharField("状態", max_length=20, choices=Status.choices, default=Status.ACTIVE)
    # 授業を始めたときのぴあ友の知識の版（画面の 409 判定などで使う）
    knowledge_version = models.PositiveIntegerField("知識の版", default=0)
    started_at = models.DateTimeField("開始", auto_now_add=True)
    finished_at = models.DateTimeField("終了", null=True, blank=True)
    lessons = models.ManyToManyField(Lesson, through="SessionLesson", related_name="sessions")

    class Meta:
        verbose_name = "授業"
        verbose_name_plural = verbose_name
        ordering = ["-started_at", "-id"]
        indexes = [models.Index(fields=["owner", "-started_at"], name="learning_session_owner_recent")]

    def __str__(self):
        return f"授業 {self.pk}（{self.owner}）"

    def lesson_ids(self):
        return list(self.session_lessons.order_by("sort_order", "id").values_list("lesson_id", flat=True))


class SessionLesson(models.Model):
    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE, related_name="session_lessons")
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, related_name="session_lessons")
    sort_order = models.PositiveIntegerField("並び順", default=0)

    class Meta:
        verbose_name = "授業の小単元"
        verbose_name_plural = verbose_name
        constraints = [models.UniqueConstraint(fields=["session", "lesson"], name="learning_sessionlesson_unique")]
