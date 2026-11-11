"""入力の形式の検査と振り分け（docs/03 の A、Issue #26 の最小限）。

ALLOW：ふつうに扱う ／ DATA_ONLY：命令らしい文が混ざっている。教わる内容（データ）としてだけ扱い、
知識の状態は変えない ／ REJECT：空・長すぎるなど、受け付けない。
振り分けは補助の対策で、これだけで安全にはならない（DeepSeek へは指示とデータを分けて渡す、#30）。
"""

import re
import unicodedata

MAX_CONTENT = 4000  # contracts/openapi.yaml の MessageRequest.content

_INJECTION = re.compile(
    r"(指示を無視|命令を無視|ルールを無視|システムプロンプト|あなたは今から|"
    r"ignore (all |the )?(previous|above) (instructions|prompts)|system prompt|you are now|"
    r"master_all|習得済みにして|全部習得)",
    re.IGNORECASE,
)


def clean(text: str) -> str:
    """制御文字を除く（改行とタブは残す）。"""
    return "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C").strip()


def classify(content) -> tuple[str, str]:
    """(振り分け, 整えた本文) を返す。振り分けは ALLOW・DATA_ONLY・REJECT。"""
    if not isinstance(content, str):
        return "REJECT", ""
    text = clean(content)
    if not text or len(text) > MAX_CONTENT:
        return "REJECT", text
    if _INJECTION.search(text):
        return "DATA_ONLY", text
    return "ALLOW", text
