"""採点の集計の共通部分（追加の部品は要らない）。analyze_scores.py と finalize_baseline.py が使う。"""
import csv, hashlib, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CODES = ("accuracy", "logic", "clarity")
NAMES = {"accuracy": "正確さ", "logic": "論理性", "clarity": "分かりやすさ"}
WEIGHTS = {"accuracy": 40, "logic": 30, "clarity": 30}  # 版 draft-2026-11（ADR-015。仮の値）
UNRATED = "UNRATED"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def expected_ids(set_name):
    if set_name == "induced":
        return {p["induced_id"] for p in json.loads((HERE / "induced.json").read_text(encoding="utf-8"))["pairs"]}
    split = json.loads((HERE / "split.json").read_text(encoding="utf-8"))
    return set(split[{"tuning": "tuning", "evaluation": "evaluation"}[set_name]])


def read_rater(path, set_name):
    """採点者のCSVを読む。戻り値：({id: {code: 1..5 または 'UNRATED'}}, 問題の一覧, 採点者の名前, 宣言)"""
    rows = list(csv.DictReader(Path(path).read_text(encoding="utf-8-sig").splitlines()))
    problems, out = [], {}
    names, decl = set(), set()
    want = expected_ids(set_name)
    for r in rows:
        i = r.get("id", "").strip()
        names.add(r.get("rater", "").strip()); decl.add(r.get("declared_no_ai", "").strip())
        if i in out: problems.append(f"{i}: 行が重複している"); continue
        comment = r.get("comment", "") or ""
        unrated = set()
        if comment.strip().startswith("UNRATED:"):
            unrated = set(comment.strip()[len("UNRATED:"):].split(" ")[0].split(","))
        vals = {}
        for c in CODES:
            v = (r.get(c) or "").strip()
            if c in unrated:
                if v: problems.append(f"{i}/{c}: 評価保留なのに、段階が入っている")
                vals[c] = UNRATED
            elif v.isdigit() and 1 <= int(v) <= 5:
                vals[c] = int(v)
            elif v == "":
                problems.append(f"{i}/{c}: 空欄（段階か、評価保留（comment に UNRATED:{c} と理由）が必要）")
            else:
                problems.append(f"{i}/{c}: 段階は 1〜5 の整数（いまは「{v}」）")
        if UNRATED in vals.values() and not comment.strip().split(" ", 1)[-1].strip() == "" and False:
            pass
        out[i] = vals
    if set(out) != want:
        problems.append(f"会話のIDが、対象の会話と一致しない（足りない {sorted(want - set(out))[:5]}／余分 {sorted(set(out) - want)[:5]}）")
    return out, problems, names - {""}, decl - {""}


def total_score(levels):
    """段階（1〜5。UNRATED は除く）から、0〜100点。評価保留の観点は、合計から除いて、残りの配点で割り戻す。全部保留なら None"""
    used = [(WEIGHTS[c], v * 20) for c, v in levels.items() if isinstance(v, (int, float))]
    return None if not used else sum(w * s for w, s in used) / sum(w for w, _ in used)
