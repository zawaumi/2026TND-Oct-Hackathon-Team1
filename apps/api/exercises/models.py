"""問題を出す・ぴあ友が解く（docs/02 の exercises）。

- Exercise：ユーザーが授業の中で出した問題。問題の文は保存せず、読み取った一次方程式の係数と、問題の形だけを持つ。
- ExerciseAttempt：ぴあ友の1回の解答。(問題, request_id) で一意で、同じ送信の再送には前の結果を返す。
- MasteryEvidence：習得の根拠。(ぴあ友, 概念, リセットの世代, 問題の形) で一意にし、同じ形の問題を二重に数えない。
"""

from django.db import models

from learning.models import LearningSession
from lessons.models import Concept
from peers.models import Peer


class VerificationStatus(models.TextChoices):
    VERIFIED = "VERIFIED", "検証できる"
    PROVISIONAL = "PROVISIONAL", "練習として使える（習得の回数に入らない）"
    UNSUPPORTED = "UNSUPPORTED", "対応していない"


class Exercise(models.Model):
    class Kind(models.TextChoices):
        MATH_EQUATION = "math_equation", "数式"
        MULTIPLE_CHOICE = "multiple_choice", "選択肢"
        FREE_TEXT = "free_text", "自由記述"

    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE, related_name="exercises")
    target_concept = models.ForeignKey(Concept, on_delete=models.PROTECT, related_name="exercises")
    request_id = models.UUIDField("送信ID")
    input_hash = models.CharField("入力のハッシュ", max_length=64)
    kind = models.CharField("種類", max_length=20, choices=Kind.choices)
    verification_status = models.CharField("検証", max_length=12, choices=VerificationStatus.choices)
    reason = models.CharField("理由", max_length=200, blank=True)
    # 読み取った一次方程式（左辺 ax+b、右辺 cx+d の係数を分数の文字で）。対応外なら空
    equation = models.JSONField("方程式", null=True, blank=True)
    form = models.CharField("問題の形", max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "問題"
        verbose_name_plural = verbose_name
        constraints = [models.UniqueConstraint(fields=["session", "request_id"], name="exercises_exercise_request_unique")]


class ExerciseAttempt(models.Model):
    class Result(models.TextChoices):
        CORRECT = "correct", "正解"
        INCORRECT = "incorrect", "不正解"
        BLOCKED = "blocked", "止まった"
        UNVERIFIED = "unverified", "検証できない"

    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="attempts")
    peer = models.ForeignKey(Peer, on_delete=models.CASCADE, related_name="exercise_attempts")
    request_id = models.UUIDField("送信ID")
    result = models.CharField("結果", max_length=12, choices=Result.choices)
    reason = models.CharField("回数に入らない理由", max_length=30, blank=True)
    blocked_skill = models.CharField("足りない技能", max_length=60, blank=True)
    reset_epoch = models.PositiveIntegerField("リセットの世代", default=0)
    # 画面に返した結果（同じ送信の再送に、同じ結果を返すため）
    result_cache = models.JSONField("返した結果", default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ぴあ友の解答"
        verbose_name_plural = verbose_name
        constraints = [models.UniqueConstraint(fields=["exercise", "request_id"], name="exercises_attempt_request_unique")]


class MasteryEvidence(models.Model):
    peer = models.ForeignKey(Peer, on_delete=models.CASCADE, related_name="mastery_evidence")
    concept = models.ForeignKey(Concept, on_delete=models.PROTECT, related_name="mastery_evidence")
    attempt = models.ForeignKey(ExerciseAttempt, on_delete=models.CASCADE, related_name="evidence")
    reset_epoch = models.PositiveIntegerField("リセットの世代", default=0)
    variant_code = models.CharField("問題の形", max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "習得の根拠"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["peer", "concept", "reset_epoch", "variant_code"], name="exercises_evidence_unique_variant"
            )
        ]
