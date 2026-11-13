#!/usr/bin/env python3
"""協議の結果から、比較基準（人の基準）を作って、固定する。

  python3 docs/experiments/scoring/finalize_baseline.py --set evaluation rater_A_evaluation.csv rater_B_evaluation.csv disagreements_evaluation.csv

disagreements_<セット>.csv の「協議後の基準」（1〜5、または UNRATED）と「理由」を、2名で話し合って、すべて埋めてから実行する。
埋まっていない行があれば、作らずに、止まる。AIが基準を決めることは、できない（人の協議の結果だけを使う）。
"""
import argparse, csv, json, sys
from datetime import date
from pathlib import Path
from scoring_common import CODES, UNRATED, read_rater, sha256, total_score

ap = argparse.ArgumentParser()
ap.add_argument("--set", required=True, choices=["tuning", "evaluation", "induced"])
ap.add_argument("a"); ap.add_argument("b"); ap.add_argument("disagreements")
ap.add_argument("--threshold", type=int, default=1, help="analyze_scores.py と同じ値にする")
ap.add_argument("--rubric-version", default="draft-2026-11")
ap.add_argument("--out", default=".")
args = ap.parse_args()
A, pa, na, _ = read_rater(args.a, args.set); B, pb, nb, _ = read_rater(args.b, args.set)
errors = [f"採点者A: {p}" for p in pa] + [f"採点者B: {p}" for p in pb]
if na and na == nb: errors.append("2つのファイルの採点者の名前が同じ")
final = {}
for r in csv.DictReader(Path(args.disagreements).read_text(encoding="utf-8-sig").splitlines()):
    i, c, f, why = r["会話ID"], r["観点"], (r["協議後の基準"] or "").strip(), (r["理由"] or "").strip()
    if f.upper() == UNRATED: val = UNRATED
    elif f.isdigit() and 1 <= int(f) <= 5: val = int(f)
    else: errors.append(f"{i}/{c}: 「協議後の基準」が、1〜5 か UNRATED になっていない（いま「{f}」）"); continue
    if not why: errors.append(f"{i}/{c}: 「理由」が空")
    final[(i, c)] = val
base, src = {}, {}
for i in sorted(set(A) & set(B)):
    base[i], src[i] = {}, {}
    for c in CODES:
        a, b = A[i][c], B[i][c]
        if a == b: base[i][c], src[i][c] = a, "一致"
        elif a == UNRATED or b == UNRATED or abs(a - b) >= args.threshold:
            if (i, c) in final: base[i][c], src[i][c] = final[(i, c)], "協議"
            else: errors.append(f"{i}/{c}: 差があるのに、協議の記録（{a}／{b}）がない")
        else: base[i][c], src[i][c] = (a + b) / 2, "平均（差が小さい）"
if errors:
    print("基準を作れません。次を直してください：", *[" - " + e for e in errors[:40]], sep="\n"); sys.exit(1)
out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
result = {"set": args.set, "rubric_version": args.rubric_version, "finalized_on": date.today().isoformat(), "threshold": args.threshold,
          "raters": {"A": sorted(na), "B": sorted(nb)},
          "inputs_sha256": {"rater_a": sha256(args.a), "rater_b": sha256(args.b), "disagreements": sha256(args.disagreements)},
          "baseline": {i: {**{c: base[i][c] for c in CODES}, "total_score": total_score(base[i]), "source": src[i]} for i in base}}
(out / f"baseline_{args.set}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
with open(out / f"baseline_{args.set}.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f); w.writerow(["id", *CODES, "total_score", *[c + "_source" for c in CODES]])
    for i in base: w.writerow([i, *[base[i][c] for c in CODES], "" if result["baseline"][i]["total_score"] is None else round(result["baseline"][i]["total_score"], 1), *[src[i][c] for c in CODES]])
n = {k: sum(1 for i in src for c in CODES if src[i][c] == k) for k in ("一致", "協議", "平均（差が小さい）")}
print(f"比較基準を作った（{args.set}・{len(base)}件・版 {args.rubric_version}）：{n}\n書き出した：{out / ('baseline_' + args.set + '.json')}、{out / ('baseline_' + args.set + '.csv')}")
