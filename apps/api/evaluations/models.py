"""評価（docs/02 の evaluations）。

- Rubric（ルーブリック）は版で管理する。評価には、使ったルーブリックの版を記録する（何の尺度で判定したか追えるように）。
- 観点（Criterion）は accuracy・logic・clarity の3つ（ADR-015）。配点は 40・30・30（仮）。
- Evaluation は授業ごとに1つ。点数はぴあとも独自の参考指標で、学校の成績ではない。
- 会話の本文や長い引用は保存しない（docs/05）。保存するのは点数・観点の短い説明・良かったところだけ。
"""

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models import Q

from learning.models import LearningSession
from lessons.models import Lesson


class Rubric(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "下書き"
        ACTIVE = "active", "使用中"
        RETIRED = "retired", "使用終了"

    # 空なら全教材共通。小単元ごとのルーブリックは、国研の資料と対応させてから足す
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, null=True, blank=True, related_name="rubrics")
    version = models.CharField("版", max_length=32)
    source_ref = models.CharField("根拠の資料", max_length=200, blank=True)
    status = models.CharField("状態", max_length=8, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ルーブリック"
        verbose_name_plural = verbose_name
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["lesson", "version"], name="evaluations_rubric_lesson_version_unique"),
            # 共通（lesson が空）のものも版で一意にする（NULL は一意制約で比べられないため）
            models.UniqueConstraint(
                fields=["version"], condition=Q(lesson__isnull=True), name="evaluations_rubric_common_version_unique"
            ),
        ]

    def __str__(self):
        return f"{self.lesson or '共通'} {self.version}"

    def clean(self):
        if self.status == self.Status.ACTIVE and self.pk:
            criteria = list(self.criteria.all())
            if {c.code for c in criteria} != set(Criterion.Code.values) or sum(c.weight for c in criteria) != 100:
                raise ValidationError("使用中のルーブリックは、3観点がそろい、配点の合計が100である必要があります。")


class Criterion(models.Model):
    class Code(models.TextChoices):
        ACCURACY = "accuracy", "正確さ"
        LOGIC = "logic", "論理性"
        CLARITY = "clarity", "分かりやすさ"

    rubric = models.ForeignKey(Rubric, on_delete=models.CASCADE, related_name="criteria")
    code = models.CharField("観点のコード", max_length=10, choices=Code.choices)
    perspective = models.CharField("観点の名前", max_length=20)
    weight = models.PositiveSmallIntegerField("配点", validators=[MaxValueValidator(100)])
    # 段階1〜5の文（下から順に）
    levels = models.JSONField("段階", default=list)
    sort_order = models.PositiveSmallIntegerField("並び順", default=0)

    class Meta:
        verbose_name = "観点"
        verbose_name_plural = verbose_name
        ordering = ["rubric", "sort_order", "id"]
        constraints = [models.UniqueConstraint(fields=["rubric", "code"], name="evaluations_criterion_unique")]

    def __str__(self):
        return f"{self.perspective}（{self.weight}）"

    def clean(self):
        if not (isinstance(self.levels, list) and len(self.levels) == 5 and all(isinstance(s, str) and s for s in self.levels)):
            raise ValidationError({"levels": "段階は5つの文の一覧にしてください。"})


class Evaluation(models.Model):
    class Status(models.TextChoices):
        COMPLETE = "COMPLETE", "すべての観点を評価"
        PARTIAL = "PARTIAL", "評価保留の観点がある"
        UNAVAILABLE = "UNAVAILABLE", "評価できなかった"

    session = models.OneToOneField(LearningSession, on_delete=models.CASCADE, related_name="evaluation")
    rubric = models.ForeignKey(Rubric, on_delete=models.PROTECT, related_name="evaluations")
    # 評価候補を出したもの。Jev が使えるようになるまでは DeepSeek のターンごとの所見
    engine = models.CharField("評価候補の出どころ", max_length=32)
    model_version = models.CharField("モデル", max_length=64, blank=True)
    status = models.CharField("状態", max_length=12, choices=Status.choices)
    total_score = models.PositiveSmallIntegerField("合計", null=True, blank=True, validators=[MaxValueValidator(100)])
    # 画面に出すための、評価したときの写し（あとで知識をリセットしてもレポートは変わらない）
    strengths = models.JSONField("良かったところ", default=list)
    knowledge_changes = models.JSONField("習得の変化", default=list)
    mastered_concept_ids = models.JSONField("習得済みの概念", default=list)
    next_lesson_ids = models.JSONField("次の学習の候補", default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "授業の評価"
        verbose_name_plural = verbose_name
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"評価 {self.session_id}（{self.total_score}）"


class CriterionResult(models.Model):
    class Status(models.TextChoices):
        SCORED = "SCORED", "評価した"
        UNRATED = "UNRATED", "評価保留"

    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="results")
    criterion = models.ForeignKey(Criterion, on_delete=models.PROTECT, related_name="results")
    status = models.CharField("状態", max_length=8, choices=Status.choices)
    score = models.PositiveSmallIntegerField("点数", null=True, blank=True, validators=[MaxValueValidator(100)])
    # 点数の根拠にした所見の数（会話の本文は保存しない）
    evidence_count = models.PositiveSmallIntegerField("根拠の数", default=0)
    explanation = models.CharField("説明", max_length=500, blank=True)

    class Meta:
        verbose_name = "観点の結果"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(fields=["evaluation", "criterion"], name="evaluations_result_unique"),
            models.CheckConstraint(
                condition=Q(status="SCORED", score__isnull=False) | Q(status="UNRATED", score__isnull=True),
                name="evaluations_result_score_matches_status",
            ),
        ]
