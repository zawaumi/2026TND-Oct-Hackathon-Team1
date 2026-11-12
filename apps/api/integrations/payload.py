"""外部AIへ渡すデータを最小にする（docs/03 の A、docs/05）。

- 送ってよいのは、教材（小単元・概念の名前と説明）・DRFが決めた方針・直近の会話の一部・今回の説明文だけ。
- ユーザーの識別子（UID・メール・ID）や認証情報（トークン・Authorization）は、この関数の引数にそもそも取らない。
- 文章に混ざったメールアドレス・電話番号・URL は伏せ字にする。ただし検知は完全ではない（画面の説明と合わせる）。
"""

import re
from dataclasses import dataclass, field

# 送る文章の上限（文字数）
MAX_MESSAGE = 1000
MAX_CONTEXT_ITEM = 300
MAX_CONTEXT_ITEMS = 6
MAX_DESCRIPTION = 200

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_PHONE = re.compile(r"(?<!\d)(0\d{1,4}[-ー\s]?\d{1,4}[-ー\s]?\d{3,4})(?!\d)")
_URL = re.compile(r"https?://\S+")


def redact(text: str) -> tuple[str, list[str]]:
    """個人情報らしいものを伏せ字にする。何を伏せたかの種類も返す（ログには種類だけを出す）。"""
    found = []
    if _EMAIL.search(text):
        found.append("email")
        text = _EMAIL.sub("［メール］", text)
    if _URL.search(text):
        found.append("url")
        text = _URL.sub("［URL］", text)
    if _PHONE.search(text):
        found.append("phone")
        text = _PHONE.sub("［電話番号］", text)
    return text, found


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


@dataclass(frozen=True)
class ContextLine:
    role: str  # "user"（教える人）か "peer"（ぴあ友）
    content: str


@dataclass(frozen=True)
class PeerTurnInput:
    """ぴあ友の発話を作るために DeepSeek へ渡すもの。DRF が方針（action・概念）を決めてから作る。"""

    action: str
    concept_id: int
    concept_title: str
    concept_description: str
    lesson_title: str
    teacher_message: str
    recent_context: tuple[ContextLine, ...] = field(default_factory=tuple)


def build_peer_turn_payload(turn: PeerTurnInput) -> tuple[dict, list[str]]:
    """DeepSeek へ送る「データ」の部分を作る。返すのは (データ, 伏せ字にした種類)。"""
    message, found = redact(_clip(turn.teacher_message, MAX_MESSAGE))
    context = []
    for line in list(turn.recent_context)[-MAX_CONTEXT_ITEMS:]:
        if line.role not in ("user", "peer"):
            continue
        text, f = redact(_clip(line.content, MAX_CONTEXT_ITEM))
        found.extend(f)
        context.append({"role": "teacher" if line.role == "user" else "peer", "content": text})
    data = {
        "lesson": _clip(turn.lesson_title, 80),
        "concept": {
            "id": turn.concept_id,
            "title": _clip(turn.concept_title, 80),
            "description": _clip(turn.concept_description, MAX_DESCRIPTION),
        },
        "action": turn.action,
        "recent_context": context,
        "teacher_message": message,
    }
    return data, sorted(set(found))
