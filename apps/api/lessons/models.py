"""教材の階層と概念（docs/02_data_model.md の 1〜3）。

- 学習指導要領の階層は CurriculumItem、アプリで選ぶ単位は Lesson（parent で何段でも深くできる）。
- Concept は複数の Lesson から LessonConcept で共有する。同じ概念を教材ごとに複製しない。
- 公開教材（CURATED）は所有者なし、私有教材（PRIVATE）は所有者が必須。
- Lesson の階層の循環は services.assert_no_lesson_cycle で防ぐ（DB 制約だけでは防げない）。
"""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class SchoolLevel(models.TextChoices):
    MIDDLE = "middle", "中学校"
    HIGH = "high", "高校"


class Scope(models.TextChoices):
    CURATED = "CURATED", "公開教材"
    PRIVATE = "PRIVATE", "私有"


class CurriculumRevision(models.Model):
    """学習指導要領の告示版（例：平成29年告示 中学校）。"""

    code = models.CharField("コード", max_length=40, unique=True)
    name = models.CharField("名前", max_length=120)
    issued_year = models.PositiveSmallIntegerField("告示年")
    source_url = models.URLField("出典URL", blank=True)

    class Meta:
        verbose_name = "学習指導要領の版"
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.name


class CurriculumItem(models.Model):
    """学習指導要領の項目（教科・領域・内容など）。"""

    class Type(models.TextChoices):
        SUBJECT = "subject", "教科・科目"
        DOMAIN = "domain", "領域"
        CONTENT = "content", "内容"

    revision = models.ForeignKey(CurriculumRevision, on_delete=models.PROTECT, related_name="items")
    parent = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="children")
    official_code = models.CharField("公式の記号", max_length=60, blank=True)
    title = models.CharField("名前", max_length=200)
    type = models.CharField("種類", max_length=10, choices=Type.choices)
    sort_order = models.PositiveIntegerField("並び順", default=0)

    class Meta:
        verbose_name = "学習指導要領の項目"
        verbose_name_plural = verbose_name
        ordering = ["revision", "parent_id", "sort_order", "id"]
        constraints = [
            # 公式の記号がある項目だけ、版の中で一意にする（docs/02：可能な範囲で一意）
            models.UniqueConstraint(
                fields=["revision", "official_code"],
                condition=~Q(official_code=""),
                name="lessons_curriculumitem_code_unique_in_revision",
            ),
        ]
        indexes = [models.Index(fields=["revision", "parent"], name="lessons_ci_revision_parent")]

    def __str__(self):
        return self.title


class Concept(models.Model):
    """ぴあ友が覚える概念。知識の状態はこの単位で持つ。"""

    code = models.CharField("コード", max_length=60, unique=True)
    title = models.CharField("名前", max_length=120)
    # 知識マップのノード詳細に出す、ユーザー向けの1〜2文の説明（ADR-023 A6）
    description = models.TextField("説明", blank=True)
    scope = models.CharField("公開範囲", max_length=8, choices=Scope.choices, default=Scope.CURATED)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="private_concepts"
    )
    difficulty = models.PositiveSmallIntegerField("難しさ", null=True, blank=True)

    class Meta:
        verbose_name = "概念"
        verbose_name_plural = verbose_name
        ordering = ["id"]
        constraints = [
            # 公開教材は所有者なし、私有は所有者が必須
            models.CheckConstraint(
                condition=(Q(scope=Scope.CURATED, owner__isnull=True) | Q(scope=Scope.PRIVATE, owner__isnull=False)),
                name="lessons_concept_owner_matches_scope",
            ),
        ]

    def __str__(self):
        return self.title


class Lesson(models.Model):
    """アプリで選ぶ教材の単位。末端（子がなく概念を持つもの）が小単元。"""

    class Status(models.TextChoices):
        DRAFT = "draft", "下書き"
        PUBLISHED = "published", "公開"

    class Mode(models.TextChoices):
        PRESET = "preset", "単元学習"
        FREE = "free", "自由学習"
        INQUIRY = "inquiry", "探究学習"

    parent = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="children")
    curriculum_item = models.ForeignKey(
        CurriculumItem, on_delete=models.PROTECT, null=True, blank=True, related_name="lessons"
    )
    title = models.CharField("名前", max_length=120)
    school_level = models.CharField("校種", max_length=6, choices=SchoolLevel.choices, default=SchoolLevel.MIDDLE)
    # 中学の学年（1〜3）。高校の科目は null（ADR-031）
    grade = models.PositiveSmallIntegerField(
        "学年", null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(3)]
    )
    # 教科（中学）または科目（高校）のコード。GET /lessons/?subject= で絞る（例：math）
    subject = models.CharField("教科・科目", max_length=50, default="math")
    scope = models.CharField("公開範囲", max_length=8, choices=Scope.choices, default=Scope.CURATED)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="private_lessons"
    )
    status = models.CharField("状態", max_length=10, choices=Status.choices, default=Status.DRAFT)
    mode = models.CharField("学習の種類", max_length=8, choices=Mode.choices, default=Mode.PRESET)
    sort_order = models.PositiveIntegerField("並び順", default=0)
    concepts = models.ManyToManyField(Concept, through="LessonConcept", related_name="lessons", blank=True)

    class Meta:
        verbose_name = "教材"
        verbose_name_plural = verbose_name
        ordering = ["parent_id", "sort_order", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(scope=Scope.CURATED, owner__isnull=True) | Q(scope=Scope.PRIVATE, owner__isnull=False)),
                name="lessons_lesson_owner_matches_scope",
            ),
            models.CheckConstraint(
                condition=Q(grade__isnull=True) | Q(grade__gte=1, grade__lte=3),
                name="lessons_lesson_grade_range",
            ),
            models.CheckConstraint(condition=~Q(parent=models.F("id")), name="lessons_lesson_not_own_parent"),
        ]
        indexes = [models.Index(fields=["parent", "sort_order", "status"], name="lessons_lesson_tree")]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # 管理画面や投入コマンドなど、どの経路で保存しても循環を作らせない
        from .services import assert_no_lesson_cycle

        assert_no_lesson_cycle(self, self.parent)
        super().save(*args, **kwargs)


class LessonConcept(models.Model):
    """教材と概念の対応。同じ概念を複数の教材から参照できる。"""

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="lesson_concepts")
    concept = models.ForeignKey(Concept, on_delete=models.PROTECT, related_name="lesson_concepts")
    sort_order = models.PositiveIntegerField("並び順", default=0)

    class Meta:
        verbose_name = "教材の概念"
        verbose_name_plural = verbose_name
        ordering = ["lesson", "sort_order", "id"]
        constraints = [models.UniqueConstraint(fields=["lesson", "concept"], name="lessons_lessonconcept_unique")]

    def __str__(self):
        return f"{self.lesson} - {self.concept}"
