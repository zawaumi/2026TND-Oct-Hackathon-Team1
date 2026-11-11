"""対話の方針を DRF が決める（docs/03 の B、Issue #29）。

同じ入力（教材・知識の状態・説明文・ターンの番号）なら、いつも同じ方針になる。
action と対象の概念は、ここで決めたものだけを使う。DeepSeek には言い方だけを任せる。
Jev の評価候補（#28）ができたら、理由・例の有無の判定をそれに置き換える。
"""

import re
from dataclasses import dataclass

from peers.models import KnowledgeStatus

ACTIONS = ("ask_why", "request_example", "check_prerequisite", "contrast_cases", "attempt_exercise", "explain_back")

_REASON = re.compile(r"(から|ので|ため|理由|なぜなら|だって|というのは|つまり|性質)")
_EXAMPLE = re.compile(r"([0-9０-９]|例えば|たとえば|例|具体)")
MIN_EXPLANATION = 15  # これより短い説明では「説明済み」にしない


@dataclass(frozen=True)
class ConceptState:
    id: int
    status: str
    prerequisites_ready: bool = True  # 前提（#16）が練習中か習得済み。前提関係がなければ True


@dataclass(frozen=True)
class Decision:
    action: str
    concept_id: int
    introduce: bool  # この説明で「説明済み」に進めるか


def choose(concepts: list[ConceptState], message: str, turn_index: int, *, data_only: bool = False) -> Decision:
    """concepts は授業の概念を並び順で。turn_index はこの授業ですでに終わったターンの数。"""
    if not concepts:
        raise ValueError("授業に概念がありません")
    # いま教えている概念：まだ習得済みでない最初の概念（docs/04 の 5.2）
    target = next((c for c in concepts if c.status != KnowledgeStatus.MASTERED), concepts[0])
    text = message.strip()
    has_reason = bool(_REASON.search(text))
    has_example = bool(_EXAMPLE.search(text))
    introduce = (
        not data_only and target.status == KnowledgeStatus.UNKNOWN and len(text) >= MIN_EXPLANATION
    )

    if not target.prerequisites_ready:
        action = "check_prerequisite"
    elif not has_reason:
        action = "ask_why"
    elif not has_example:
        action = "request_example"
    elif target.status == KnowledgeStatus.UNKNOWN:
        action = "explain_back"  # 初めて教わったので、言い直して確かめる
    elif turn_index % 2 == 0:
        action = "contrast_cases"
    else:
        action = "attempt_exercise"  # 理由も例もそろったので、問題をやってみたい
    return Decision(action=action, concept_id=target.id, introduce=introduce)
