from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from lessons.models import Concept, Scope

from .models import KnowledgeStatus, Peer, PeerKnowledge
from .services import get_or_create_peer


class PeerModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(firebase_uid="uid-a")
        self.concept = Concept.objects.create(code="M1-EQ-PROP", title="等式の性質")

    def test_one_peer_per_user(self):
        peer = get_or_create_peer(self.user)
        self.assertEqual(get_or_create_peer(self.user), peer)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Peer.objects.create(owner=self.user)

    def test_one_row_per_peer_and_concept(self):
        peer = get_or_create_peer(self.user)
        PeerKnowledge.objects.create(peer=peer, concept=self.concept, status=KnowledgeStatus.INTRODUCED)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PeerKnowledge.objects.create(peer=peer, concept=self.concept)

    def test_mastered_at_only_when_mastered(self):
        from django.utils import timezone

        peer = get_or_create_peer(self.user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PeerKnowledge.objects.create(peer=peer, concept=self.concept, status="PRACTICING", mastered_at=timezone.now())


class PeerApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.a = User.objects.create_user(firebase_uid="uid-a")
        self.b = User.objects.create_user(firebase_uid="uid-b")
        self.c1 = Concept.objects.create(code="M1-EQ-PROP", title="等式の性質")
        self.c2 = Concept.objects.create(code="M1-EQ-SOLVE", title="方程式の解法")
        self.private_b = Concept.objects.create(code="B-PRIVATE", title="Bの概念", scope=Scope.PRIVATE, owner=self.b)
        peer_a = get_or_create_peer(self.a)
        PeerKnowledge.objects.create(peer=peer_a, concept=self.c1, status=KnowledgeStatus.INTRODUCED)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_requires_login(self):
        self.assertIn(APIClient().get("/api/v1/peers/me/").status_code, (401, 403))
        self.assertIn(APIClient().get("/api/v1/peers/me/knowledge/").status_code, (401, 403))

    def test_get_my_peer(self):
        res = self.client_for(self.a).get("/api/v1/peers/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "ぴあ友")
        self.assertEqual(res.json()["knowledge_version"], 0)

    def test_state_is_kept_between_requests(self):
        # 別のセッション（別の接続）で取り直しても同じ状態が返る
        first = self.client_for(self.a).get("/api/v1/peers/me/knowledge/").json()
        second = self.client_for(self.a).get("/api/v1/peers/me/knowledge/").json()
        self.assertEqual(first, second)
        by_id = {i["concept_id"]: i for i in first["items"]}
        self.assertEqual(by_id[self.c1.id]["status"], "INTRODUCED")
        self.assertEqual(by_id[self.c2.id]["status"], "UNKNOWN")  # 行がない概念は未習
        self.assertEqual(by_id[self.c1.id]["required_correct"], 2)

    def test_other_users_state_is_not_visible(self):
        items = self.client_for(self.b).get("/api/v1/peers/me/knowledge/").json()["items"]
        by_id = {i["concept_id"]: i for i in items}
        self.assertEqual(by_id[self.c1.id]["status"], "UNKNOWN")  # A の「説明済み」は見えない
        self.assertNotEqual(Peer.objects.get(owner=self.a).id, Peer.objects.get(owner=self.b).id)

    def test_private_concepts_of_others_are_hidden(self):
        ids = [i["concept_id"] for i in self.client_for(self.a).get("/api/v1/peers/me/knowledge/").json()["items"]]
        self.assertNotIn(self.private_b.id, ids)
        ids = [
            i["concept_id"]
            for i in self.client_for(self.a)
            .get(f"/api/v1/peers/me/knowledge/?concept_ids={self.private_b.id},{self.c2.id}")
            .json()["items"]
        ]
        self.assertEqual(ids, [self.c2.id])

    def test_concept_ids_filter_and_bad_input(self):
        res = self.client_for(self.a).get(f"/api/v1/peers/me/knowledge/?concept_ids={self.c1.id}")
        self.assertEqual([i["concept_id"] for i in res.json()["items"]], [self.c1.id])
        self.assertEqual(self.client_for(self.a).get("/api/v1/peers/me/knowledge/?concept_ids=a,b").status_code, 400)
