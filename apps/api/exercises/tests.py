import uuid
from fractions import Fraction
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from lessons.models import Concept, Lesson
from lessons.skills import AUX_SKILLS, SKILL_LABELS, concept_meta
from peers.knowledge import advance
from peers.models import KnowledgeStatus, Peer, PeerKnowledge

from . import solver
from .models import MasteryEvidence

ALL = frozenset(SKILL_LABELS)
ADD_SUB = frozenset({"add_both_sides", "subtract_both_sides"}) | AUX_SKILLS


def rid():
    return str(uuid.uuid4())


class ParseTests(SimpleTestCase):
    def test_supported(self):
        cases = {
            "x+3=7": 4,
            "2x+3=11": 4,
            "3x-4=x+8": 6,
            "4x+1=2x-9": -5,
            "x/4=3": 12,
            "2x+1=4": Fraction(3, 2),
            "-x=5": -5,
            "2(x+1)=8": 3,
            "7=x+3": 4,
            "3x−2=2x+4": 6,  # 長いマイナス
        }
        for text, answer in cases.items():
            with self.subTest(text):
                self.assertEqual(solver.parse_equation(text).solution, answer)

    def test_latex(self):
        self.assertEqual(solver.parse_input("\\frac{x}{4}=3", None).solution, 12)
        self.assertEqual(solver.parse_input("\\frac{1}{2}x+1=3", None).solution, 4)
        self.assertEqual(solver.parse_input("2\\times x=6", None).solution, 3)
        self.assertEqual(solver.parse_input(None, "x+3=7").solution, 4)

    def test_unsupported_with_reason(self):
        for text in ("x^2=4", "y+1=2", "0.5x=1", "x=x+1", "1=1", "x+1", "x=1=1", "√x=2", "x*x=4", "1/x=2", "x/0=1", "9" * 6 + "x=1", "x" * 201):
            with self.subTest(text), self.assertRaises(solver.UnsupportedEquation) as cm:
                solver.parse_equation(text)
            self.assertTrue(str(cm.exception))
        for latex in ("\\sqrt{x}=2", "\\href{http://a}{x}=1", "x^{2}=4"):
            with self.subTest(latex), self.assertRaises(solver.UnsupportedEquation):
                solver.parse_input(latex, None)

    def test_form(self):
        f = lambda t: solver.form_code(solver.parse_equation(t))  # noqa: E731
        self.assertEqual(f("x+3=7"), f("x+8=13"))
        self.assertNotEqual(f("x+3=7"), f("x-3=9"))
        self.assertNotEqual(f("2x+3=11"), f("3x-4=x+8"))
        self.assertEqual(f("2x+3=11"), "ax+n=n")


class PlanTests(SimpleTestCase):
    def solve_all(self, text):
        eq = solver.parse_input(text, None)
        plan = solver.make_plan(eq, ALL, text)
        self.assertIsNone(plan.blocked_skill)
        self.assertTrue(solver.verify_plan(eq, plan), text)
        return plan

    def test_curated_examples(self):
        for text, last in [
            ("x+3=7", "x=4"),
            ("x-5=2", "x=7"),
            ("3x=12", "x=4"),
            ("x/4=3", "x=12"),
            ("2x=x+5", "x=5"),
            ("3x-2=2x+4", "x=6"),
            ("4x+1=2x-9", "x=-5"),
            ("2x+1=4", "x=\\frac{3}{2}"),
            ("-x=5", "x=-5"),
            ("\\frac{2}{3}x=4", "x=6"),
        ]:
            with self.subTest(text):
                self.assertEqual(self.solve_all(text).steps[-1].expr, last)

    def test_steps_and_skills(self):
        plan = self.solve_all("3x-4=x+8")
        self.assertEqual([s.expr for s in plan.steps], ["3x-4=x+8", "2x-4=8", "2x=12", "x=6"])
        self.assertEqual([s.skill for s in plan.steps], [None, "subtract_both_sides", "add_both_sides", "divide_nonzero"])
        self.assertEqual(plan.steps[3].skill_label, "両辺を0以外の同じ数でわる")

    def test_tidies_input_first(self):
        plan = self.solve_all("2(x+1)=8")
        self.assertEqual(plan.steps[1].skill, "distribute")
        self.assertEqual(plan.steps[1].expr, "2x+2=8")

    def test_blocked_when_skill_unknown(self):
        eq = solver.parse_equation("2x+3=11")
        plan = solver.make_plan(eq, ADD_SUB, "2x+3=11")
        self.assertEqual(plan.blocked_skill, "divide_nonzero")
        self.assertEqual([s.expr for s in plan.steps], ["2x+3=11", "2x=8"])
        self.assertFalse(solver.verify_plan(eq, plan))

    def test_verify_rejects_a_wrong_step(self):
        eq = solver.parse_equation("x+3=7")
        plan = solver.make_plan(eq, ALL, "x+3=7")
        bad = solver.Plan((plan.steps[0], solver.Step("x=5", "subtract_both_sides", "")), plan.used, None)
        self.assertFalse(solver.verify_plan(eq, bad))


class ExerciseApiTests(TestCase):
    def setUp(self):
        call_command("load_curated_lessons", "--publish", stdout=StringIO())
        User = get_user_model()
        self.a = User.objects.create_user(firebase_uid="uid-a")
        self.b = User.objects.create_user(firebase_uid="uid-b")
        self.c = APIClient()
        self.c.force_authenticate(self.a)
        self.addsub = Concept.objects.get(code="equality-add-subtract")
        self.muldiv = Concept.objects.get(code="equality-multiply-divide")
        self.trans = Concept.objects.get(code="transposition")
        self.solving = Concept.objects.get(code="linear-equation-solving")

    def start(self, title):
        lesson = Lesson.objects.get(title=title)
        res = self.c.post("/api/v1/sessions/", {"mode": "preset", "lesson_ids": [lesson.id]}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.sid = res.json()["id"]
        self.peer = Peer.objects.get(owner=self.a)
        return self.sid

    def introduce(self, *concepts):
        for c in concepts:
            advance(self.peer, c, KnowledgeStatus.INTRODUCED)

    def create(self, latex, concept, request_id=None, kind="math_equation", client=None):
        return (client or self.c).post(
            f"/api/v1/sessions/{self.sid}/exercises/",
            {"request_id": request_id or rid(), "kind": kind, "question": latex, "latex": latex, "target_concept_id": concept.id},
            format="json",
        )

    def attempt(self, exercise_id, request_id=None):
        return self.c.post(f"/api/v1/exercises/{exercise_id}/attempt/", {"request_id": request_id or rid()}, format="json")

    def solve(self, latex, concept):
        ex = self.create(latex, concept)
        self.assertEqual(ex.status_code, 201, ex.content)
        res = self.attempt(ex.json()["id"])
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def status_of(self, concept):
        row = PeerKnowledge.objects.filter(peer=self.peer, concept=concept).first()
        return row.status if row else KnowledgeStatus.UNKNOWN

    # ---- 問題を出す

    def test_classification(self):
        self.start("等式の性質")
        ok = self.create("x+3=7", self.addsub).json()
        self.assertEqual((ok["verification_status"], ok["reason"], ok["target_concept_id"]), ("VERIFIED", None, self.addsub.id))
        self.assertEqual(set(ok), {"id", "kind", "verification_status", "reason", "target_concept_id"})
        bad = self.create("x^2=4", self.addsub).json()
        self.assertEqual(bad["verification_status"], "UNSUPPORTED")
        self.assertIn("2乗", bad["reason"])
        # たす・ひくを使わずに解ける問題は、練習にはなるが回数に入らない
        prov = self.create("3x=12", self.addsub).json()
        self.assertEqual(prov["verification_status"], "PROVISIONAL")
        text = self.create("x+3=7", self.addsub, kind="free_text").json()
        self.assertEqual(text["verification_status"], "PROVISIONAL")

    def test_create_rejects(self):
        self.start("等式の性質")
        self.assertEqual(self.create("x+3=7", self.trans).json()["code"], "INVALID_TARGET")  # この授業の概念ではない
        res = self.c.post(f"/api/v1/sessions/{self.sid}/exercises/", {"request_id": "x", "kind": "math_equation", "question": "x=1", "target_concept_id": self.addsub.id}, format="json")
        self.assertEqual(res.json()["code"], "INVALID_REQUEST_ID")
        res = self.c.post(f"/api/v1/sessions/{self.sid}/exercises/", {"request_id": rid(), "kind": "math_equation", "question": "x=1", "target_concept_id": self.addsub.id, "is_staff": True}, format="json")
        self.assertEqual(res.json()["code"], "INVALID_FIELDS")
        other = APIClient()
        other.force_authenticate(self.b)
        self.assertEqual(self.create("x+3=7", self.addsub, client=other).status_code, 404)  # 他人の授業
        self.c.post(f"/api/v1/sessions/{self.sid}/finish/")
        self.assertEqual(self.create("x+3=7", self.addsub).json()["code"], "SESSION_NOT_ACTIVE")

    def test_create_is_idempotent(self):
        self.start("等式の性質")
        r = rid()
        first = self.create("x+3=7", self.addsub, request_id=r).json()
        self.assertEqual(self.create("x+3=7", self.addsub, request_id=r).json()["id"], first["id"])
        self.assertEqual(self.create("x+4=7", self.addsub, request_id=r).json()["code"], "REQUEST_ID_CONFLICT")

    # ---- ぴあ友が解く

    def test_untaught_concept_blocks(self):
        self.start("等式の性質")
        res = self.solve("x+3=7", self.addsub)
        self.assertEqual(res["result"], "blocked")
        self.assertEqual(res["blocked_skill"], self.addsub.title)
        self.assertEqual(res["steps"], [{"expr": "x+3=7", "skill": None, "skill_label": None}])
        self.assertEqual(res["knowledge_changes"], [])

    def test_basic_concept_masters_with_one_answer(self):
        self.start("等式の性質")
        self.introduce(self.addsub)
        res = self.solve("x+3=7", self.addsub)
        self.assertEqual(res["result"], "correct")
        self.assertIsNone(res["reason"])
        self.assertEqual(res["verification_status"], "VERIFIED")
        self.assertEqual([s["expr"] for s in res["steps"]], ["x+3=7", "x=4"])
        self.assertEqual(res["steps"][1]["skill_label"], "両辺から同じ数や式をひく")
        self.assertEqual(
            res["knowledge_changes"],
            [
                {"concept_id": self.addsub.id, "old_status": "INTRODUCED", "new_status": "PRACTICING"},
                {"concept_id": self.addsub.id, "old_status": "PRACTICING", "new_status": "MASTERED"},
            ],
        )
        self.assertEqual(res["knowledge_version"], Peer.objects.get(pk=self.peer.pk).knowledge_version)
        items = {i["concept_id"]: i for i in self.c.get("/api/v1/peers/me/knowledge/").json()["items"]}
        self.assertEqual((items[self.addsub.id]["verified_correct"], items[self.addsub.id]["required_correct"]), (1, 1))
        self.assertEqual(items[self.trans.id]["required_correct"], 2)

    def test_standard_concept_needs_two_forms(self):
        self.start("移項")
        self.introduce(self.addsub, self.trans)
        first = self.solve("x+8=13", self.trans)
        self.assertEqual([c["new_status"] for c in first["knowledge_changes"]], ["PRACTICING"])
        same = self.solve("x+5=9", self.trans)  # 同じ形
        self.assertEqual((same["result"], same["reason"], same["knowledge_changes"]), ("correct", "duplicate_form", []))
        second = self.solve("x-3=9", self.trans)
        self.assertEqual([c["new_status"] for c in second["knowledge_changes"]], ["MASTERED"])
        self.assertEqual(self.status_of(self.trans), KnowledgeStatus.MASTERED)
        self.assertEqual(MasteryEvidence.objects.filter(concept=self.trans).count(), 2)

    def test_stops_at_a_skill_not_taught(self):
        self.start("方程式の解法")
        self.introduce(self.addsub)
        res = self.solve("2x+3=11", self.addsub)
        self.assertEqual(res["result"], "blocked")
        self.assertEqual(res["blocked_skill"], "両辺を0以外の同じ数でわる")
        self.assertEqual([s["expr"] for s in res["steps"]], ["2x+3=11", "2x=8"])
        self.assertEqual(self.status_of(self.addsub), KnowledgeStatus.INTRODUCED)

    def test_solving_concept_uses_both_skills(self):
        self.start("方程式の解法")
        self.introduce(self.addsub, self.muldiv, self.solving)
        self.assertEqual(self.create("x+3=7", self.solving).json()["verification_status"], "PROVISIONAL")  # わらずに解ける
        res = self.solve("2x+3=11", self.solving)
        self.assertEqual((res["result"], res["reason"]), ("correct", None))
        self.assertEqual(self.status_of(self.solving), KnowledgeStatus.PRACTICING)

    def test_provisional_and_unsupported_attempts(self):
        self.start("等式の性質")
        self.introduce(self.addsub, self.muldiv)
        res = self.solve("3x=12", self.addsub)  # PROVISIONAL
        self.assertEqual((res["result"], res["reason"], res["knowledge_changes"]), ("correct", "provisional", []))
        self.assertEqual(self.status_of(self.addsub), KnowledgeStatus.INTRODUCED)
        bad = self.create("x^2=4", self.addsub).json()
        self.assertEqual(self.attempt(bad["id"]).json()["code"], "UNSUPPORTED_EXERCISE")
        text = self.create("説明してね", self.addsub, kind="free_text").json()
        self.assertEqual(self.attempt(text["id"]).json()["result"], "unverified")

    def test_attempt_is_idempotent_and_private(self):
        self.start("等式の性質")
        self.introduce(self.addsub)
        ex = self.create("x+3=7", self.addsub).json()
        r = rid()
        first = self.attempt(ex["id"], r).json()
        again = self.attempt(ex["id"], r).json()
        self.assertEqual(first, again)
        self.assertEqual(MasteryEvidence.objects.count(), 1)
        other = APIClient()
        other.force_authenticate(self.b)
        self.assertEqual(other.post(f"/api/v1/exercises/{ex['id']}/attempt/", {"request_id": rid()}, format="json").status_code, 404)
        self.assertEqual(self.c.post(f"/api/v1/exercises/{ex['id']}/attempt/", {"request_id": "x"}, format="json").json()["code"], "INVALID_REQUEST_ID")

    def test_report_includes_changes_from_exercises(self):
        self.start("等式の性質")
        self.introduce(self.addsub)
        self.solve("x+3=7", self.addsub)
        self.c.post(f"/api/v1/sessions/{self.sid}/finish/")
        report = self.c.get(f"/api/v1/sessions/{self.sid}/evaluation/").json()
        self.assertIn({"concept_id": self.addsub.id, "old_status": "INTRODUCED", "new_status": "MASTERED"}, report["knowledge_changes"])
        self.assertIn(self.addsub.id, report["mastered_concept_ids"])

    def test_curated_policies_are_read(self):
        self.assertEqual(concept_meta("equality-add-subtract").policy.required_correct, 1)
        self.assertEqual(concept_meta("transposition").policy.required_variants, 2)
        self.assertIsNone(concept_meta("equation-word-problem").policy)
        self.assertIsNone(concept_meta("no-such-concept").policy)
