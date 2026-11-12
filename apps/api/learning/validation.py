"""DeepSeek の出力を検証し、だめなら定型の応答にする（docs/03 の B）。

- 形（JSON・型・長さ）、action と概念が DRF の決めたものと同じか、を確かめる。
- 習得したと自分で言う・答えを言ってしまう発言は捨てる（ぴあ友が知らないはずのことを言わない）。
- 検証に通らなければ action=fallback の定型文にし、知識の状態は変えない。
"""

import re

from .policy import Decision

ALLOWED_EMOTIONS = {"question", "listening", "thinking", "practice_success"}
CRITERIA = {"accuracy", "logic", "clarity"}
MAX_MESSAGE = 200
MAX_NOTE = 100

_SELF_MASTERY = re.compile(r"(習得し|全部(わか|分か)り?まし|完璧に(わか|分か|理解))")
_GIVES_ANSWER = re.compile(r"[xXｘ]\s*[=＝]\s*[-−]?\s*[0-9０-９]")

FALLBACK_MESSAGE = "ごめんなさい、うまく言葉にできませんでした。もう一度、別の言い方で教えてもらえますか？"


def fallback(decision: Decision) -> dict:
    return {"action": "fallback", "concept_id": decision.concept_id, "message": FALLBACK_MESSAGE, "emotion": "thinking"}


def validate(parsed, decision: Decision) -> tuple[dict | None, list[dict]]:
    """(画面に返すぴあ友の応答, 所見の一覧) を返す。応答が None なら検証に通らなかった。"""
    if not isinstance(parsed, dict):
        return None, []
    if parsed.get("action") != decision.action:
        return None, []
    if parsed.get("concept_id") != decision.concept_id or isinstance(parsed.get("concept_id"), bool):
        return None, []
    message = parsed.get("message")
    if not isinstance(message, str):
        return None, []
    message = message.strip()
    if not message or len(message) > MAX_MESSAGE:
        return None, []
    if _SELF_MASTERY.search(message) or _GIVES_ANSWER.search(message):
        return None, []
    emotion = parsed.get("emotion")
    if emotion not in ALLOWED_EMOTIONS:
        emotion = "question"  # 表情は安全な既定値にする（mastery_success は DRF だけが決める）
    peer = {"action": decision.action, "concept_id": decision.concept_id, "message": message, "emotion": emotion}
    return peer, _valid_findings(parsed.get("findings"))


def _valid_findings(findings) -> list[dict]:
    """所見は観点のコード・段階（1〜5、なければ None）・100字以内の文だけ。観点ごとに1件。

    会話の引用（「」）は入れない。合わないものは捨てる。段階だけおかしいときは、文は残して段階を空にする。
    """
    result = []
    if not isinstance(findings, list):
        return result
    seen = set()
    for f in findings[:10]:
        if not isinstance(f, dict) or f.get("criterion") not in CRITERIA or not isinstance(f.get("note"), str):
            continue
        if f["criterion"] in seen:
            continue
        note = f["note"].strip()
        if not note or len(note) > MAX_NOTE or "「" in note:
            continue
        level = f.get("level")
        if not isinstance(level, int) or isinstance(level, bool) or not 1 <= level <= 5:
            level = None
        seen.add(f["criterion"])
        result.append({"criterion": f["criterion"], "level": level, "note": note})
    return result
