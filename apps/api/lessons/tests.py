from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from .models import Concept, CurriculumItem, CurriculumRevision, Lesson, LessonConcept, Scope


class LessonHierarchyTests(TestCase):
    def setUp(self):
        self.unit = Lesson.objects.create(title="一次方程式", grade=1, status=Lesson.Status.PUBLISHED)
        self.lesson1 = Lesson.objects.create(title="等式の性質", parent=self.unit, grade=1, sort_order=1)
        self.lesson2 = Lesson.objects.create(title="方程式の解法", parent=self.unit, grade=1, sort_order=2)
        self.concept = Concept.objects.create(code="M1-EQ-PROP", title="等式の性質", description="両辺に同じ操作をしても等式は成り立つ")

    def test_hierarchy_is_saved_and_read_back(self):
        self.assertEqual(list(self.unit.children.values_list("title", flat=True)), ["等式の性質", "方程式の解法"])
        self.assertEqual(Lesson.objects.get(pk=self.lesson2.pk).parent, self.unit)

    def test_same_concept_is_shared_by_two_lessons(self):
        LessonConcept.objects.create(lesson=self.lesson1, concept=self.concept)
        LessonConcept.objects.create(lesson=self.lesson2, concept=self.concept)
        self.assertEqual(Concept.objects.count(), 1)  # 教材ごとに複製しない
        self.assertEqual(list(self.lesson1.concepts.all()), [self.concept])
        self.assertEqual(list(self.lesson2.concepts.all()), [self.concept])
        self.assertEqual(set(self.concept.lessons.all()), {self.lesson1, self.lesson2})

    def test_duplicate_lesson_concept_is_rejected(self):
        LessonConcept.objects.create(lesson=self.lesson1, concept=self.concept)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LessonConcept.objects.create(lesson=self.lesson1, concept=self.concept)

    def test_cycle_in_lesson_tree_is_rejected(self):
        self.unit.parent = self.lesson1  # 一次方程式 → 等式の性質 → 一次方程式
        with self.assertRaises(ValidationError):
            self.unit.save()
        self.lesson1.parent = self.lesson1
        with self.assertRaises(ValidationError):
            self.lesson1.save()

    def test_grade_out_of_range_is_rejected(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Lesson.objects.create(title="学年が不正", grade=4)
        # 高校の科目は学年なし
        Lesson.objects.create(title="数学Ⅰ", school_level="high", grade=None, subject="math1")


class OwnershipTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(firebase_uid="uid-a")

    def test_private_concept_requires_owner(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Concept.objects.create(code="P-1", title="私の概念", scope=Scope.PRIVATE)
        Concept.objects.create(code="P-2", title="私の概念", scope=Scope.PRIVATE, owner=self.user)

    def test_curated_concept_must_not_have_owner(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Concept.objects.create(code="C-1", title="公開の概念", scope=Scope.CURATED, owner=self.user)

    def test_private_lesson_requires_owner(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Lesson.objects.create(title="私の教材", scope=Scope.PRIVATE)
        Lesson.objects.create(title="私の教材", scope=Scope.PRIVATE, owner=self.user)


class CurriculumTests(TestCase):
    def test_official_code_is_unique_within_revision(self):
        rev = CurriculumRevision.objects.create(code="jhs-2017", name="中学校学習指導要領（平成29年告示）", issued_year=2017)
        math = CurriculumItem.objects.create(revision=rev, title="数学", type=CurriculumItem.Type.SUBJECT)
        CurriculumItem.objects.create(revision=rev, parent=math, official_code="A(3)", title="一元一次方程式", type="content")
        # 記号がない項目は何件あってもよい
        CurriculumItem.objects.create(revision=rev, parent=math, title="補足1", type="content")
        CurriculumItem.objects.create(revision=rev, parent=math, title="補足2", type="content")
        with self.assertRaises(IntegrityError), transaction.atomic():
            CurriculumItem.objects.create(revision=rev, official_code="A(3)", title="重複", type="content")
        lesson = Lesson.objects.create(title="一次方程式", curriculum_item=math.children.get(official_code="A(3)"))
        self.assertEqual(lesson.curriculum_item.title, "一元一次方程式")
