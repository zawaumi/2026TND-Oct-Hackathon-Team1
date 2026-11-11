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


class LearningTurn(models.Model):
    """1回の送信（ターン）の受付と結果（docs/02、Issue #23・#24 の最小限）。

    - (授業, request_id) で一意。同じ送信の再送には前の結果を返し、二重に処理しない。
    - 会話の本文は保存しない。本文の一致はハッシュ（input_hash）で確かめる。
    - result_cache は画面に返した応答（ぴあ友の発言を含む）。再送のためだけの短期の保存。
    """

    class Status(models.TextChoices):
        PROCESSING = "processing", "処理中"
        DONE = "done", "完了"
        FAILED = "failed", "失敗"

    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE, related_name="turns")
    request_id = models.UUIDField("送信ID")
    input_hash = models.CharField("本文のハッシュ", max_length=64)
    status = models.CharField("状態", max_length=10, choices=Status.choices, default=Status.PROCESSING)
    # 受け付けたときのぴあ友の知識の版。確定のときに変わっていたら古い処理として捨てる
    knowledge_version = models.PositiveIntegerField("知識の版")
    expires_at = models.DateTimeField("処理中の期限")
    result_cache = models.JSONField("返した応答", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ターン"
        verbose_name_plural = verbose_name
        constraints = [models.UniqueConstraint(fields=["session", "request_id"], name="learning_turn_request_unique")]


class TurnNote(models.Model):
    """ターンごとの短い所見（観点のコード＋100字以内）。授業の評価（#42）が終わるまでだけ保存する（docs/03 の G）。"""

    class Criterion(models.TextChoices):
        ACCURACY = "accuracy", "正確さ"
        LOGIC = "logic", "論理性"
        CLARITY = "clarity", "分かりやすさ"

    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE, related_name="notes")
    turn = models.ForeignKey(LearningTurn, on_delete=models.CASCADE, related_name="notes")
    criterion = models.CharField("観点", max_length=10, choices=Criterion.choices)
    note = models.CharField("所見", max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ターンの所見"
        verbose_name_plural = verbose_name
