"""評価候補の集計と評価保留の判定（docs/03 の G）。DB を使わない決まった計算。

- 評価候補は、ターンごとの所見の段階（1〜5）。段階1〜5を20・40・60・80・100点にする（ADR-029）。
- 観点ごとに、根拠になる段階が MIN_EVIDENCE 件より少なければ評価保留（UNRATED）。会話の回数や発言量では採点しない。
- 観点の点数は、その観点の段階の点数の平均（四捨五入）。
- 合計は、評価した観点の点数を配点で重み付けして平均する（評価保留の観点は除き、残りの配点で割り戻す）。
  すべて評価保留なら合計は出さない。
- 観点の説明：70点未満なら、いちばん低い段階の所見（改善のヒントとして画面に出る）。70点以上なら、いちばん高い段階の所見。
- 良かったところ：段階4以上の所見から、観点がなるべく重ならないように最大3件。
"""

from dataclasses import dataclass

MIN_EVIDENCE = 2
LEVEL_POINTS = {1: 20, 2: 40, 3: 60, 4: 80, 5: 100}
HINT_BELOW = 70
STRENGTH_MIN_LEVEL = 4
MAX_STRENGTHS = 3
UNRATED_EXPLANATION = "この観点を判断できる説明が少なかったため、評価を保留しました。"


@dataclass(frozen=True)
class Finding:
    criterion: str
    level: int | None
    note: str
    order: int  # 古い順の番号（同じ段階なら新しいものを選ぶのに使う）


@dataclass(frozen=True)
class CriterionSpec:
    code: str
    weight: int


@dataclass(frozen=True)
class CriterionScore:
    code: str
    status: str  # "SCORED" | "UNRATED"
    score: int | None
    evidence_count: int
    explanation: str


@dataclass(frozen=True)
class Aggregate:
    status: str  # "COMPLETE" | "PARTIAL"
    total_score: int | None
    criteria: tuple[CriterionScore, ...]
    strengths: tuple[str, ...]


def _round(x: float) -> int:
    return int(x + 0.5)  # 0.5 は切り上げ（Python の round は偶数への丸め）


def score_criterion(code: str, findings: list[Finding]) -> CriterionScore:
    rated = [f for f in findings if f.criterion == code and f.level in LEVEL_POINTS]
    if len(rated) < MIN_EVIDENCE:
        return CriterionScore(code, "UNRATED", None, len(rated), UNRATED_EXPLANATION)
    score = _round(sum(LEVEL_POINTS[f.level] for f in rated) / len(rated))
    if score < HINT_BELOW:
        chosen = min(rated, key=lambda f: (f.level, -f.order))
    else:
        chosen = max(rated, key=lambda f: (f.level, f.order))
    return CriterionScore(code, "SCORED", score, len(rated), chosen.note)


def pick_strengths(findings: list[Finding]) -> tuple[str, ...]:
    good = sorted(
        (f for f in findings if f.level is not None and f.level >= STRENGTH_MIN_LEVEL),
        key=lambda f: (-f.level, -f.order),
    )
    picked: list[Finding] = []
    for f in good:  # まずは観点ごとに1件
        if f.criterion not in {p.criterion for p in picked} and f.note not in {p.note for p in picked}:
            picked.append(f)
    for f in good:  # 足りなければ残りから
        if len(picked) >= MAX_STRENGTHS:
            break
        if f not in picked and f.note not in {p.note for p in picked}:
            picked.append(f)
    return tuple(p.note for p in picked[:MAX_STRENGTHS])


def aggregate(specs: list[CriterionSpec], findings: list[Finding]) -> Aggregate:
    results = tuple(score_criterion(s.code, findings) for s in specs)
    weights = {s.code: s.weight for s in specs}
    scored = [r for r in results if r.status == "SCORED"]
    total = None
    if scored:
        weight_sum = sum(weights[r.code] for r in scored)
        if weight_sum > 0:
            total = _round(sum(r.score * weights[r.code] for r in scored) / weight_sum)
    status = "COMPLETE" if len(scored) == len(results) and results else "PARTIAL"
    return Aggregate(status, total, results, pick_strengths(findings))
