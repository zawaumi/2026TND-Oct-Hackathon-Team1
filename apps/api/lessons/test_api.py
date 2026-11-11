from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from peers.models import PeerKnowledge
from peers.services import get_or_create_peer

from .models import Concept, Lesson, LessonConcept, Scope

PUB = Lesson.Status.PUBLISHED


def make_tree():
    """数と式 → 一次方程式 → 3つの小単元（公開）＋下書き1つ、中2の単元1つ"""
    domain = Lesson.objects.create(title="数と式", grade=1, status=PUB)
    unit = Lesson.objects.create(title="一次方程式", parent=domain, grade=1, status=PUB)
    c1 = Concept.objects.create(code="M1-EQ-PROP", title="等式の性質", description="両辺に同じ操作をしても等式は成り立つ")
    c2 = Concept.objects.create(code="M1-EQ-SOLVE", title="方程式の解法")
    c3 = Concept.objects.create(code="M1-EQ-TRANS", title="移項")
    l1 = Lesson.objects.create(title="等式の性質", parent=unit, grade=1, status=PUB, sort_order=1)
    l2 = Lesson.objects.create(title="方程式の解法", parent=unit, grade=1, status=PUB, sort_order=2)
    l3 = Lesson.objects.create(title="移項", parent=unit, grade=1, status=PUB, sort_order=3)
    draft = Lesson.objects.create(title="方程式の利用", parent=unit, grade=1, status=Lesson.Status.DRAFT, sort_order=4)
    LessonConcept.objects.create(lesson=l1, concept=c1)
    LessonConcept.objects.create(lesson=l2, concept=c1, sort_order=1)
    LessonConcept.objects.create(lesson=l2, concept=c2, sort_order=2)
    LessonConcept.objects.create(lesson=l3, concept=c3)
    g2 = Lesson.objects.create(title="連立方程式", grade=2, status=PUB)
    return {"domain": domain, "unit": unit, "l1": l1, "l2": l2, "l3": l3, "draft": draft, "g2": g2, "c1": c1, "c2": c2, "c3": c3}


class LessonApiTests(TestCase):
    def setUp(self):
        self.t = make_tree()
        self.user = get_user_model().objects.create_user(firebase_uid="uid-a")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_requires_login(self):
        self.assertIn(APIClient().get("/api/v1/lessons/").status_code, (401, 403))

    def test_list_filtered_by_grade_includes_parents_and_hides_drafts(self):
        res = self.client.get("/api/v1/lessons/?school_level=middle&grade=1&subject=math")
        self.assertEqual(res.status_code, 200)
        titles = [l["title"] for l in res.json()["results"]]
        self.assertIn("数と式", titles)  # 親も一緒に返す
        self.assertIn("一次方程式", titles)
        self.assertIn("移項", titles)
        self.assertNotIn("方程式の利用", titles)  # 下書きは出さない
        self.assertNotIn("連立方程式", titles)  # 中2

    def test_lesson_shape_matches_contract(self):
        item = next(l for l in self.client.get("/api/v1/lessons/").json()["results"] if l["title"] == "方程式の解法")
        self.assertEqual(
            set(item), {"id", "parent_id", "curriculum_item_code", "title", "grade", "mode", "published", "concept_ids"}
        )
        self.assertEqual(item["concept_ids"], [self.t["c1"].id, self.t["c2"].id])
        self.assertTrue(item["published"])

    def test_high_school_returns_empty(self):
        self.assertEqual(self.client.get("/api/v1/lessons/?school_level=high").json(), {"results": []})

    def test_bad_parameters(self):
        self.assertEqual(self.client.get("/api/v1/lessons/?grade=x").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/lessons/?grade=4").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/lessons/?school_level=college").status_code, 400)

    def test_detail_and_draft_is_404(self):
        self.assertEqual(self.client.get(f"/api/v1/lessons/{self.t['l3'].id}/").json()["title"], "移項")
        self.assertEqual(self.client.get(f"/api/v1/lessons/{self.t['draft'].id}/").status_code, 404)

    def test_private_lesson_of_others_is_hidden(self):
        other = get_user_model().objects.create_user(firebase_uid="uid-b")
        mine = Lesson.objects.create(title="Bの教材", scope=Scope.PRIVATE, owner=other, status=PUB, grade=1)
        self.assertEqual(self.client.get(f"/api/v1/lessons/{mine.id}/").status_code, 404)
        self.assertNotIn("Bの教材", [l["title"] for l in self.client.get("/api/v1/lessons/").json()["results"]])

    def test_knowledge_graph_with_status(self):
        peer = get_or_create_peer(self.user)
        PeerKnowledge.objects.create(peer=peer, concept=self.t["c1"], status="MASTERED")
        res = self.client.get(f"/api/v1/knowledge-graph/?lesson_id={self.t['l2'].id}").json()
        by_id = {n["id"]: n for n in res["nodes"]}
        self.assertEqual(set(by_id), {self.t["c1"].id, self.t["c2"].id})
        self.assertEqual(by_id[self.t["c1"].id]["status"], "MASTERED")
        self.assertEqual(by_id[self.t["c2"].id]["status"], "UNKNOWN")
        self.assertEqual(by_id[self.t["c1"].id]["label"], "等式の性質")
        self.assertEqual(res["edges"], [])  # 前提関係は #16 で入る
        # 単元を渡すと、その下の小単元の概念がまとめて出る
        unit_nodes = self.client.get(f"/api/v1/knowledge-graph/?lesson_id={self.t['unit'].id}").json()["nodes"]
        self.assertEqual(len(unit_nodes), 3)
        self.assertEqual(self.client.get(f"/api/v1/knowledge-graph/?lesson_id={self.t['draft'].id}").status_code, 404)
