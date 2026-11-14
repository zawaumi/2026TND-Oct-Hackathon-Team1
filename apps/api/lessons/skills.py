"""概念ごとの技能・前提・習得条件（公開教材のデータファイルから読む）。

DB には、概念の技能や習得条件（MasteryPolicy）を入れるモデルがまだない。
公開教材のデータファイル（lessons/data/*.json）は版管理されていて、検査（lessons/curated.py）も通っているので、
問題を解く処理（exercises）は、そこから概念のコードで引く。データファイルにない概念（私有の概念など）は、
技能も習得条件もないものとして扱う（＝問題で習得を確かめられない）。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

# 技能（規則）の表示名。画面にそのまま出す
SKILL_LABELS = {
    "add_both_sides": "両辺に同じ数や式をたす",
    "subtract_both_sides": "両辺から同じ数や式をひく",
    "multiply_nonzero": "両辺に同じ数をかける",
    "divide_nonzero": "両辺を0以外の同じ数でわる",
    "simplify_arithmetic": "式を整理する",
    "distribute": "かっこをはずす",
}
# 式を整えるだけの補助。学年相応の前提知識として、いつでも使える（docs/03 D）
AUX_SKILLS = frozenset({"simplify_arithmetic", "distribute"})


@dataclass(frozen=True)
class MasteryPolicy:
    required_correct: int
    required_variants: int


@dataclass(frozen=True)
class ConceptMeta:
    code: str
    skills: frozenset[str] = field(default_factory=frozenset)
    prerequisites: tuple[str, ...] = ()
    verified: bool = False  # 問題の解き方を自動で検証できる概念か
    policy: MasteryPolicy | None = None


@lru_cache(maxsize=1)
def _load() -> dict[str, ConceptMeta]:
    metas: dict[str, ConceptMeta] = {}
    for path in sorted(DATA_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for c in data.get("concepts", []):
            p = c.get("mastery_policy")
            metas[c["code"]] = ConceptMeta(
                code=c["code"],
                skills=frozenset(c.get("skills", [])),
                prerequisites=tuple(c.get("prerequisites", [])),
                verified=c.get("verification") == "VERIFIED",
                policy=MasteryPolicy(p["required_correct"], p["required_problem_variants"]) if p else None,
            )
    return metas


def concept_meta(code: str) -> ConceptMeta:
    return _load().get(code) or ConceptMeta(code=code)


def required_skill_groups(code: str) -> list[frozenset[str]]:
    """その概念の問題として数えるために、解き方の中で使っていなければならない技能のまとまり。

    - 技能を持つ概念（例：等式の両辺に同じ数をたす・ひく）：その技能のどれか1つを使う
    - 技能を持たない概念（例：移項、方程式を解く）：前提の概念それぞれについて、その技能のどれか1つを使う
    """
    meta = concept_meta(code)
    if meta.skills:
        return [meta.skills]
    return [concept_meta(p).skills for p in meta.prerequisites if concept_meta(p).skills]
