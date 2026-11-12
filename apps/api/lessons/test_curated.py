"""公開教材データの検査と投入のテスト。"""

import copy
import json
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from .curated import check_example, parse_equation, solve, validate_dataset
from .management.commands.load_curated_lessons import DEFAULT_FILE
from .models import Concept, Lesson, LessonConcept, Scope

DATA = json.loads(Path(DEFAULT_FILE).read_text(encoding="utf-8"))


def find_example(data, example_id):
    for c in data["concepts"]:
        for e in c["examples"]:
            if e["id"] == example_id:
                return e
    raise KeyError(example_id)


def run(*args, **kwargs):
    out = StringIO()
    call_command("load_curated_lessons", *args, stdout=out, **kwargs)
    return out.getvalue()


class ExpressionTests(SimpleTestCase):
    def test_solve(self):
        for text, answer in [("x+3=7", "4"), ("3x-4=x+8", "6"), ("2x=x+5", "5"), ("x/4=3", "12"), ("2x+1=4", "3/2")]:
            self.assertEqual(str(solve(*parse_equation(text))), answer, text)

    def test_unsupported_expressions_are_rejected(self):
        for text in ["x*x=4", "x^2=4", "__import__('os')=1", "x=y", "1/x=2", "x/0=1", "x=1=2"]:
            with self.assertRaises(ValueError, msg=text):
                parse_equation(text)

    def test_no_unique_solution(self):
        self.assertIsNone(solve(*parse_equation("x+1=x+2")))


class DatasetTests(SimpleTestCase):
    def test_shipped_dataset_has_no_problems(self):
        self.assertEqual(validate_dataset(DATA), [])

    def test_every_verified_example_is_correct(self):
        n = 0
        for c in DATA["concepts"]:
            for e in c["examples"]:
                self.assertEqual(check_example(e), [], e["id"])
                n += 1
        self.assertGreaterEqual(n, 12)

    def mutated(self, mutate):
        data = copy.deepcopy(DATA)
        mutate(data)
        return validate_dataset(data)

    def test_detects_wrong_solution_and_steps(self):
        self.assertTrue(self.mutated(lambda d: find_example(d, "ex-add-sub-1").update(solution="5")))
        self.assertTrue(self.mutated(lambda d: find_example(d, "ex-add-sub-1")["steps"][1].update(expr="x+3-3=7-4")))
        self.assertTrue(self.mutated(lambda d: find_example(d, "ex-transpose-1")["steps"][1].update(expr="x=13+8")))  # 符号の変え忘れ
        self.assertTrue(self.mutated(lambda d: find_example(d, "ex-add-sub-2")["steps"][1].update(expr="x-5+5=2")))  # 片辺だけ
        self.assertTrue(self.mutated(lambda d: find_example(d, "ex-mul-div-1")["steps"][1]["ops"][0].update(arg="0")))  # 0でわる
        self.assertTrue(self.mutated(lambda d: find_example(d, "ex-solve-1")["steps"].pop()))  # 最後が x=（数）でない

    def test_detects_skill_not_in_concept_or_prerequisites(self):
        problems = self.mutated(lambda d: find_example(d, "ex-transpose-1")["steps"][1]["ops"][0].update(rule="divide_nonzero", arg="1"))
        self.assertTrue(any("技能" in p or "結果と一致" in p for p in problems))

    def test_detects_prerequisite_cycle_and_unknown_prerequisite(self):
        def cycle(d):
            next(c for c in d["concepts"] if c["code"] == "equality-add-subtract")["prerequisites"].append("transposition")

        self.assertTrue(any("循環" in p for p in self.mutated(cycle)))

        def unknown(d):
            next(c for c in d["concepts"] if c["code"] == "transposition")["prerequisites"].append("nothing")

        self.assertTrue(any("前提" in p for p in self.mutated(unknown)))

    def test_mastery_policy_must_be_satisfiable_by_examples(self):
        def drop(d):
            next(c for c in d["concepts"] if c["code"] == "equality-multiply-divide")["examples"].pop()

        self.assertTrue(any("習得条件" in p for p in self.mutated(drop)))

    def test_word_problem_lesson_cannot_be_published(self):
        def publish(d):
            next(l for l in d["lessons"] if l["key"] == "lesson-word-problem")["publish_scope"] = "mvp"

        self.assertTrue(any("ADR-028" in p for p in self.mutated(publish)))

    def test_review_rules(self):
        self.assertTrue(self.mutated(lambda d: d["review"].update(status="approved")))  # レビュー者が空
        self.assertTrue(
            self.mutated(lambda d: d["review"].update(status="approved", math_reviewer=d["review"]["author"], source_reviewer="b", reviewed_on="2026-11-13"))
        )  # 作った人が自分でレビュー
        self.assertEqual(
            self.mutated(lambda d: d["review"].update(status="approved", math_reviewer="a", source_reviewer="b", reviewed_on="2026-11-13")), []
        )


class LoadCommandTests(TestCase):
    def test_check_does_not_touch_db(self):
        out = run("--check")
        self.assertIn("検査OK", out)
        self.assertEqual(Lesson.objects.count(), 0)
        self.assertEqual(Concept.objects.count(), 0)

    def test_loads_as_draft_by_default_and_is_idempotent(self):
        run()
        first = (Lesson.objects.count(), Concept.objects.count(), LessonConcept.objects.count())
        run()
        self.assertEqual(first, (Lesson.objects.count(), Concept.objects.count(), LessonConcept.objects.count()))
        self.assertEqual(Lesson.objects.count(), 6)  # 領域1＋単元1＋小単元4（文章題を含む）
        self.assertFalse(Lesson.objects.filter(status=Lesson.Status.PUBLISHED).exists())
        self.assertTrue(Concept.objects.filter(scope=Scope.CURATED, owner__isnull=True).count() == 5)

    def test_lessons_hierarchy_concepts_and_descriptions(self):
        run()
        domain = Lesson.objects.get(title="数と式")
        unit = Lesson.objects.get(title="一元一次方程式")
        self.assertEqual(unit.parent, domain)
        titles = list(Lesson.objects.filter(parent=unit).order_by("sort_order").values_list("title", flat=True))
        self.assertEqual(titles, ["等式の性質", "方程式の解法", "移項", "方程式の利用（文章題）"])
        solving = Lesson.objects.get(title="方程式の解法")
        self.assertEqual(
            list(solving.lesson_concepts.order_by("sort_order").values_list("concept__code", flat=True)),
            ["equality-add-subtract", "equality-multiply-divide", "linear-equation-solving"],
        )
        for c in Concept.objects.all():
            self.assertTrue(c.description.strip(), c.code)
            self.assertLessEqual(c.description.count("。"), 2, c.code)
        self.assertEqual(Lesson.objects.get(title="等式の性質").curriculum_item.title, "（3）一元一次方程式")

    def test_publish_refused_without_review(self):
        with self.assertRaises(CommandError):
            run("--publish")
        with self.assertRaises(CommandError):
            run("--publish", "--allow-unreviewed")  # DEBUG=False（テスト）では使えない
        with self.assertRaises(CommandError):
            run("--allow-unreviewed")
        self.assertEqual(Lesson.objects.count(), 0)

    @override_settings(DEBUG=True)
    def test_allow_unreviewed_publishes_only_the_three_in_debug(self):
        run("--publish", "--allow-unreviewed")
        published = set(Lesson.objects.filter(status=Lesson.Status.PUBLISHED).values_list("title", flat=True))
        self.assertEqual(published, {"数と式", "一元一次方程式", "等式の性質", "方程式の解法", "移項"})
        self.assertEqual(Lesson.objects.get(title="方程式の利用（文章題）").status, Lesson.Status.DRAFT)

    def test_approved_review_can_publish_and_api_returns_it(self):
        data = copy.deepcopy(DATA)
        data["review"].update(status="approved", math_reviewer="レビュー担当A", source_reviewer="レビュー担当B", reviewed_on="2026-11-13")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "approved.json"
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            run("--publish", "--file", str(path))
        user = get_user_model().objects.create_user(firebase_uid="uid-curated")
        client = APIClient()
        client.force_authenticate(user)
        res = client.get("/api/v1/lessons/?school_level=middle&grade=1&subject=math")
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        leaf_titles = [r["title"] for r in results if r["parent_id"] and r["concept_ids"]]
        self.assertEqual(sorted(leaf_titles), sorted(["等式の性質", "方程式の解法", "移項"]))
        self.assertNotIn("方程式の利用（文章題）", [r["title"] for r in results])  # 下書きは出さない
        # 概念の説明（知識マップ）が取れる
        graph = client.get("/api/v1/knowledge-graph/").json()
        by_code = {n["code"]: n for n in graph["nodes"]}
        self.assertIn("equality-add-subtract", by_code)
        self.assertTrue(by_code["transposition"]["description"])

    def test_prerequisite_edges_when_model_exists(self):
        try:
            from .models import ConceptPrerequisite
        except ImportError:
            self.skipTest("ConceptPrerequisite がまだない")
        run()
        pairs = {(p.prerequisite.code, p.concept.code) for p in ConceptPrerequisite.objects.select_related("concept", "prerequisite")}
        self.assertIn(("equality-add-subtract", "transposition"), pairs)
        self.assertIn(("equality-multiply-divide", "linear-equation-solving"), pairs)

    def test_broken_dataset_is_not_loaded(self):
        data = copy.deepcopy(DATA)
        find_example(data, "ex-add-sub-1")["solution"] = "5"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "broken.json"
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaises(CommandError):
                run("--file", str(path))
        self.assertEqual(Concept.objects.count(), 0)
