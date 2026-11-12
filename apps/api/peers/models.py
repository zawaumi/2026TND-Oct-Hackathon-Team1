"""ぴあ友と、その知識の状態（docs/02_data_model.md の 1・4）。

- ぴあ友はユーザー1人に1人（MVP）。
- 知識の状態は (ぴあ友, 概念) ごとに1行。行がない概念は「未習（UNKNOWN）」とみなす。
- 状態を変えてよいのは状態の遷移サービス（peers/knowledge.py）だけ。画面から送られた状態を正にしない。
"""

from django.conf import settings
from django.db import models

from lessons.models import Concept


class KnowledgeStatus(models.TextChoices):
    UNKNOWN = "UNKNOWN", "未習"
    INTRODUCED = "INTRODUCED", "説明済み"
    PRACTICING = "PRACTICING", "練習中"
    MASTERED = "MASTERED", "習得済み"


class Peer(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="peer")
    display_name = models.CharField("名前", max_length=40, default="ぴあ友")
    avatar_id = models.CharField("アバター", max_length=40, default="default")
    persona_code = models.CharField("人物像", max_length=40, blank=True)
    # 知識が変わるたびに増やす。同時に届いた処理の衝突の検出に使う（docs/01 の競合制御）
    knowledge_version = models.PositiveIntegerField("知識の版", default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ぴあ友"
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"{self.display_name}（{self.owner}）"


class PeerKnowledge(models.Model):
    peer = models.ForeignKey(Peer, on_delete=models.CASCADE, related_name="knowledge")
    concept = models.ForeignKey(Concept, on_delete=models.PROTECT, related_name="peer_knowledge")
    status = models.CharField("状態", max_length=10, choices=KnowledgeStatus.choices, default=KnowledgeStatus.UNKNOWN)
    # 習得の根拠になった、検証済みの正答の数。習得判定が更新する
    verified_correct = models.PositiveIntegerField("検証済みの正答", default=0)
    # 知識リセットの世代。リセットのたびに増え、前の世代の根拠は数えない
    reset_epoch = models.PositiveIntegerField("リセットの世代", default=0)
    mastered_at = models.DateTimeField("習得した日時", null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ぴあ友の知識"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(fields=["peer", "concept"], name="peers_peerknowledge_unique"),
            # 習得済みのときだけ習得日時を持つ
            models.CheckConstraint(
                condition=models.Q(status=KnowledgeStatus.MASTERED) | models.Q(mastered_at__isnull=True),
                name="peers_peerknowledge_mastered_at_only_when_mastered",
            ),
        ]
        indexes = [models.Index(fields=["peer", "status"], name="peers_pk_peer_status")]

    def __str__(self):
        return f"{self.peer} - {self.concept}: {self.status}"
