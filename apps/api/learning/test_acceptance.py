"""MVP の受入試験（API 側）。AT 番号は docs/06 の受入テストの表に対応する。

実際の API（Django の ORM と DB を使う）で、1人の利用者が、授業を始めて教える流れを通す。
外部の AI（DeepSeek）だけをモックにして、AI がどう答えても DRF が状態を決める、ことを確かめる。
画面（Web）側の確認は、docs/e2e_acceptance.md を参照。

出題・検証・習得判定（AT-04・05・12）は、公開教材のデータを入れて、教える → 問題を出す → 習得 を API だけで通す。
"""

import uuid
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from integrations.deepseek import DeepSeekResult, MockDeepSeekClient
from lessons.test_api import make_tree
from peers.models import KnowledgeStatus, Peer, PeerKnowledge

GOOD = "移項は、等式の性質を使うから符号が変わるんだよ。たとえば x + 3 = 7 なら両辺から3を引く。"


def rid():
    return str(uuid.uuid4())


class ConfidentDeepSeek:
    """AI が「分かった」と、何度も言う（出力の検証には通る言い方）。習得を確定するのは DRF だけ、を確かめるための偽の AI。"""

    def generate(self, turn):
        return DeepSeekResult(
            {
                "action": turn.action,
                "concept_id": turn.concept_id,
                "message": "なるほど、すごくよく分かりました！もう大丈夫です！",
                "emotion": "mastery_success",  # AI が成功の表情を出そうとしても、DRF は採用しない
                "findings": [],
            },
            None,
            0,
            (),
        )


class AcceptanceBase(TestCase):
    def setUp(self):
        self.t = make_tree()
        self.user = get_user_model().objects.create_user(firebase_uid="uid-accept")
        self.client_a = APIClient()
        self.client_a.force_authenticate(self.user)
        # 「移項」の小単元で授業を始める（教材選択 → セッション作成）
        res = self.client_a.post("/api/v1/sessions/", {"mode": "preset", "lesson_ids": [self.t["l3"].id]}, format="json")
        assert res.status_code == 201, res.content
        self.sid = res.json()["id"]
        self.peer = Peer.objects.get(owner=self.user)

    def send(self, content, ai=None, client=None):
        with mock.patch("learning.turns.get_client", return_value=ai or MockDeepSeekClient("normal")):
            return (client or self.client_a).post(
                f"/api/v1/sessions/{self.sid}/messages/", {"request_id": rid(), "content": content}, format="json"
            )

    def statuses(self):
        return {pk.concept_id: pk.status for pk in PeerKnowledge.objects.filter(peer=self.peer)}


class AT03_AiSaysUnderstood(AcceptanceBase):
    """AT-03：説明のあとに、AI が「分かった」と言っても、MASTERED にしない。"""

    def test_AT03_confident_ai_never_masters(self):
        ai = ConfidentDeepSeek()
        emotions, changes = set(), []
        for i in range(6):  # 理由も例もある説明を、くり返し送る
            res = self.send(GOOD + f" （{i + 1}回目の説明）" + "あ" * i, ai=ai)
            self.assertEqual(res.status_code, 200, res.content)
            body = res.json()
            emotions.add(body["peer_response"]["emotion"])
            changes += body["knowledge_changes"]
        # 画面に返る表情に、習得の成功（mastery_success）は出ない
        self.assertNotIn("mastery_success", emotions)
        # 習得済みへの変化は、1つもない
        self.assertEqual([c for c in changes if c["new_status"] == KnowledgeStatus.MASTERED], [])
        # DB の状態：習得済みの概念がなく、習得した日時も入っていない
        self.assertNotIn(KnowledgeStatus.MASTERED, self.statuses().values())
        self.assertFalse(PeerKnowledge.objects.filter(peer=self.peer, mastered_at__isnull=False).exists())
        # 本人の知識状態の API からも、習得済みは見えない
        items = self.client_a.get("/api/v1/peers/me/knowledge/").json()["items"]
        self.assertTrue(items)
        self.assertNotIn("MASTERED", {i["status"] for i in items})

    def test_AT03_master_all_output_is_rejected_and_knowledge_is_unchanged(self):
        before = self.statuses()
        res = self.send(GOOD, ai=MockDeepSeekClient("master_all"))
        body = res.json()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(body["fallback_used"])  # 検証に通らず、定型の応答になる
        self.assertEqual(body["knowledge_changes"], [])
        self.assertEqual(self.statuses(), before)


class AT10_RestartRestoresKnowledgeOnly(AcceptanceBase):
    """AT-10：授業を終えてブラウザを再起動したら、ぴあ友の習得状況だけをサーバーから復元できる（会話は復元しない）。"""

    MARKER = "ユニークな目印ABC123"

    def tables_containing(self, text):
        hits = []
        with connection.cursor() as cur:
            for table in connection.introspection.table_names(cur):
                cur.execute(f'SELECT * FROM "{table}"')  # テーブル名は DB 自身が返したもの
                for row in cur.fetchall():
                    if any(text in str(v) for v in row if v is not None):
                        hits.append(table)
                        break
        return hits

    def test_AT10_after_restart_knowledge_is_restored_but_conversation_is_not(self):
        res = self.send(GOOD + self.MARKER)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.statuses()[self.t["c3"].id], KnowledgeStatus.INTRODUCED)
        self.assertEqual(self.client_a.post(f"/api/v1/sessions/{self.sid}/finish/").status_code, 202)

        # 再起動：新しいクライアント（同じ本人）。ブラウザのメモリにあった会話は、ここにはない
        restarted = APIClient()
        restarted.force_authenticate(self.user)
        items = {i["concept_id"]: i["status"] for i in restarted.get("/api/v1/peers/me/knowledge/").json()["items"]}
        self.assertEqual(items.get(self.t["c3"].id), "INTRODUCED")  # 知識は復元できる

        detail = restarted.get(f"/api/v1/sessions/{self.sid}/")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue({"messages", "content", "conversation", "turns"}.isdisjoint(detail.json()))
        self.assertNotIn(self.MARKER, detail.content.decode("utf-8"))  # 授業の取得に、会話の本文は含まれない

    def test_AT10_the_search_tool_really_finds_text(self):
        """上の「どのテーブルにもない」検査が、何も見つけられない壊れた道具ではないことの確認（わざと入れた文字は、見つかる）"""
        get_user_model().objects.create_user(firebase_uid="uid-" + self.MARKER)
        self.assertIn("accounts_user", self.tables_containing(self.MARKER))

    def test_AT10_conversation_text_is_not_stored_in_any_table(self):
        self.send(GOOD + self.MARKER)
        self.assertEqual(self.tables_containing(self.MARKER), [], "会話の本文が、サーバーのどこかのテーブルに残っている")


class ExerciseMastery(TestCase):
    """出題・検証・習得判定（AT-04・05・12）。公開教材のデータを入れ、教える → 問題を出す → 習得、を API だけで通す。
    外部の AI（DeepSeek）だけをモックにする。"""

    def setUp(self):
        from io import StringIO

        from django.core.management import call_command

        from lessons.models import Concept, Lesson

        call_command("load_curated_lessons", "--publish", stdout=StringIO())
        self.user = get_user_model().objects.create_user(firebase_uid="uid-accept-ex")
        self.c = APIClient()
        self.c.force_authenticate(self.user)
        lesson = Lesson.objects.get(title="移項")
        res = self.c.post("/api/v1/sessions/", {"mode": "preset", "lesson_ids": [lesson.id]}, format="json")
        assert res.status_code == 201, res.content
        self.sid = res.json()["id"]
        self.peer = Peer.objects.get(owner=self.user)
        self.addsub = Concept.objects.get(code="equality-add-subtract")
        self.trans = Concept.objects.get(code="transposition")

    def teach(self):
        with mock.patch("learning.turns.get_client", return_value=MockDeepSeekClient()):
            res = self.c.post(f"/api/v1/sessions/{self.sid}/messages/", {"request_id": rid(), "content": GOOD}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def give(self, latex, concept):
        ex = self.c.post(
            f"/api/v1/sessions/{self.sid}/exercises/",
            {"request_id": rid(), "kind": "math_equation", "question": latex, "latex": latex, "target_concept_id": concept.id},
            format="json",
        )
        self.assertEqual(ex.status_code, 201, ex.content)
        return ex.json()

    def solve(self, latex, concept):
        ex = self.give(latex, concept)
        res = self.c.post(f"/api/v1/exercises/{ex['id']}/attempt/", {"request_id": rid()}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def status_of(self, concept):
        row = PeerKnowledge.objects.filter(peer=self.peer, concept=concept).first()
        return row.status if row else KnowledgeStatus.UNKNOWN

    def test_AT04_two_verified_different_forms_master_a_standard_concept(self):
        """検証済みの異形式2問で、標準概念の技能を正しく使ったら、習得条件の達成で MASTERED になる"""
        self.teach()  # 1つめの概念（等式の両辺に同じ数をたす・ひく）を説明する
        self.assertEqual(self.solve("x+3=7", self.addsub)["result"], "correct")
        self.assertEqual(self.status_of(self.addsub), KnowledgeStatus.MASTERED)  # 基礎は1問
        self.teach()  # 次の概念（移項）を説明する
        self.assertEqual(self.status_of(self.trans), KnowledgeStatus.INTRODUCED)
        first = self.solve("x+8=13", self.trans)
        self.assertEqual(self.status_of(self.trans), KnowledgeStatus.PRACTICING)
        second = self.solve("x-3=9", self.trans)  # 違う形
        self.assertEqual((first["result"], second["result"]), ("correct", "correct"))
        self.assertEqual(self.status_of(self.trans), KnowledgeStatus.MASTERED)
        self.assertIn({"concept_id": self.trans.id, "old_status": "PRACTICING", "new_status": "MASTERED"}, second["knowledge_changes"])

    def test_AT05_repeating_the_same_form_does_not_inflate_the_count(self):
        """同じ形の問題をくり返し解いても、習得の回数を水増ししない（reason: duplicate_form）"""
        self.teach()
        self.solve("x+3=7", self.addsub)
        self.teach()
        self.solve("x+8=13", self.trans)
        for latex in ("x+5=9", "x+1=2", "x+10=20"):
            res = self.solve(latex, self.trans)
            self.assertEqual((res["result"], res["reason"], res["knowledge_changes"]), ("correct", "duplicate_form", []))
        self.assertEqual(self.status_of(self.trans), KnowledgeStatus.PRACTICING)
        self.assertEqual(PeerKnowledge.objects.get(peer=self.peer, concept=self.trans).verified_correct, 1)

    def test_AT12_unsupported_problem_is_not_counted_as_evidence(self):
        """数学的に未対応の問題は UNSUPPORTED を返し、習得の根拠に数えない"""
        from exercises.models import MasteryEvidence

        self.teach()
        for latex in ("x^2=4", "y+1=2", "x=x+1"):
            ex = self.give(latex, self.addsub)
            self.assertEqual(ex["verification_status"], "UNSUPPORTED")
            self.assertTrue(ex["reason"])
            res = self.c.post(f"/api/v1/exercises/{ex['id']}/attempt/", {"request_id": rid()}, format="json")
            self.assertEqual(res.status_code, 400)
        self.assertFalse(MasteryEvidence.objects.exists())
        self.assertEqual(self.status_of(self.addsub), KnowledgeStatus.INTRODUCED)

    def test_demo_script_flow(self):
        """発表の台本（docs/submission/demo_script.md の 2 節）の流れが、そのとおりに動く"""
        from lessons.models import Concept, Lesson

        muldiv = Concept.objects.get(code="equality-multiply-divide")
        lesson = Lesson.objects.get(title="等式の性質")
        self.sid = self.c.post("/api/v1/sessions/", {"mode": "preset", "lesson_ids": [lesson.id]}, format="json").json()["id"]
        self.teach()  # 3：説明 1
        self.assertEqual(self.solve("x+3=7", self.addsub)["result"], "correct")  # 4：1 問で習得
        self.assertEqual(self.status_of(self.addsub), KnowledgeStatus.MASTERED)
        self.assertEqual(self.solve("x+5=9", self.addsub)["reason"], "duplicate_form")  # 5：同じ形
        self.assertEqual(self.give("x^2=4", self.addsub)["verification_status"], "UNSUPPORTED")  # 6：範囲外
        stopped = self.solve("2x+3=11", self.addsub)  # 7：わり算で止まる
        self.assertEqual((stopped["result"], stopped["blocked_skill"]), ("blocked", "両辺を0以外の同じ数でわる"))
        reply = self.teach()  # 8：説明 2（次の概念＝かける・わる）
        self.assertEqual(reply["peer_response"]["concept_id"], muldiv.id)
        self.assertEqual(self.status_of(muldiv), KnowledgeStatus.INTRODUCED)
        self.assertEqual(self.solve("2x+3=11", muldiv)["result"], "correct")  # 9：今度は解ける
        self.assertEqual(self.status_of(muldiv), KnowledgeStatus.PRACTICING)
        self.solve("3x=12", muldiv)  # 10：違う形で習得
        self.assertEqual(self.status_of(muldiv), KnowledgeStatus.MASTERED)
        self.c.post(f"/api/v1/sessions/{self.sid}/finish/")  # 11：レポート
        report = self.c.get(f"/api/v1/sessions/{self.sid}/evaluation/").json()
        self.assertEqual({c["concept_id"] for c in report["knowledge_changes"]}, {self.addsub.id, muldiv.id})
