from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from lessons.test_api import make_tree

from .models import LearningSession


class SessionApiTests(TestCase):
    def setUp(self):
        self.t = make_tree()
        User = get_user_model()
        self.a = User.objects.create_user(firebase_uid="uid-a")
        self.b = User.objects.create_user(firebase_uid="uid-b")

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def start(self, user, lesson_ids):
        return self.client_for(user).post("/api/v1/sessions/", {"mode": "preset", "lesson_ids": lesson_ids}, format="json")

    def test_requires_login(self):
        self.assertIn(APIClient().post("/api/v1/sessions/", {}, format="json").status_code, (401, 403))

    def test_start_with_multiple_lessons(self):
        res = self.start(self.a, [self.t["l2"].id, self.t["l3"].id])
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["lesson_ids"], [self.t["l2"].id, self.t["l3"].id])
        self.assertEqual(set(body), {"id", "status", "mode", "lesson_ids", "knowledge_version", "started_at"})
        # 取り直しても同じ
        again = self.client_for(self.a).get(f"/api/v1/sessions/{body['id']}/").json()
        self.assertEqual(again, body)

    def test_unit_is_expanded_to_its_published_lessons(self):
        body = self.start(self.a, [self.t["unit"].id]).json()
        self.assertEqual(body["lesson_ids"], [self.t["l1"].id, self.t["l2"].id, self.t["l3"].id])  # 下書きは入らない

    def test_duplicates_are_removed(self):
        body = self.start(self.a, [self.t["l3"].id, self.t["l3"].id]).json()
        self.assertEqual(body["lesson_ids"], [self.t["l3"].id])

    def test_invalid_lessons(self):
        self.assertEqual(self.start(self.a, []).status_code, 400)
        self.assertEqual(self.start(self.a, ["x"]).status_code, 400)
        self.assertEqual(self.start(self.a, [99999]).status_code, 400)
        self.assertEqual(self.start(self.a, [self.t["draft"].id]).status_code, 400)

    def test_other_users_session_is_404(self):
        sid = self.start(self.a, [self.t["l3"].id]).json()["id"]
        self.assertEqual(self.client_for(self.b).get(f"/api/v1/sessions/{sid}/").status_code, 404)
        self.assertEqual(self.client_for(self.b).post(f"/api/v1/sessions/{sid}/finish/").status_code, 404)
        self.assertEqual(self.client_for(self.b).get("/api/v1/sessions/").json(), {"results": []})

    def test_list_is_newest_first_with_limit(self):
        first = self.start(self.a, [self.t["l1"].id]).json()["id"]
        second = self.start(self.a, [self.t["l2"].id]).json()["id"]
        res = self.client_for(self.a).get("/api/v1/sessions/?limit=1").json()["results"]
        self.assertEqual([s["id"] for s in res], [second])
        all_ids = [s["id"] for s in self.client_for(self.a).get("/api/v1/sessions/").json()["results"]]
        self.assertEqual(all_ids, [second, first])
        self.assertIsNone(res[0]["total_score"])

    def test_finish_is_idempotent(self):
        sid = self.start(self.a, [self.t["l3"].id]).json()["id"]
        c = self.client_for(self.a)
        r1 = c.post(f"/api/v1/sessions/{sid}/finish/")
        self.assertEqual(r1.status_code, 202)
        self.assertEqual(r1.json(), {"session_id": sid, "status": "evaluation_pending"})
        finished_at = LearningSession.objects.get(id=sid).finished_at
        r2 = c.post(f"/api/v1/sessions/{sid}/finish/")
        self.assertEqual(r2.json()["status"], "evaluation_pending")
        self.assertEqual(LearningSession.objects.get(id=sid).finished_at, finished_at)  # 2回目で変わらない

    def test_session_belongs_to_own_peer(self):
        sid = self.start(self.a, [self.t["l3"].id]).json()["id"]
        s = LearningSession.objects.get(id=sid)
        self.assertEqual(s.peer.owner, self.a)
