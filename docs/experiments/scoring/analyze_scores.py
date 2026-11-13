#!/usr/bin/env python3
"""2名の採点を集計して、不一致の一覧（協議の資料）を作る。

  python3 docs/experiments/scoring/analyze_scores.py --set evaluation rater_A_evaluation.csv rater_B_evaluation.csv

出力（--out の場所。既定は、いまのフォルダ）：
  agreement_<セット>.md           一致の度合い（一致率・MAE・重み付きκ・Spearman）
  disagreements_<セット>.csv      協議する行（「協議後の基準」と「理由」を、2名で話し合って、埋める）
"""
import argparse, csv, math, sys
from pathlib import Path
from scoring_common import CODES, NAMES, UNRATED, read_rater, sha256, total_score


def qwk(a, b, k=5):
    """重み付き Cohen κ（二乗の重み）。段階は 1〜k。ずれが大きいほど重く数える。分母が0なら None"""
    n = len(a)
    if n == 0: return None
    O = [[0] * k for _ in range(k)]
    for x, y in zip(a, b): O[x - 1][y - 1] += 1
    ha = [sum(r) for r in O]; hb = [sum(O[i][j] for i in range(k)) for j in range(k)]
    num = sum(((i - j) ** 2) * O[i][j] for i in range(k) for j in range(k)) / (k - 1) ** 2
    den = sum(((i - j) ** 2) * ha[i] * hb[j] / n for i in range(k) for j in range(k)) / (k - 1) ** 2
    return None if den == 0 else 1 - num / den


def ranks(x):
    order = sorted(range(len(x)), key=lambda i: x[i]); r = [0.0] * len(x); i = 0
    while i < len(x):
        j = i
        while j + 1 < len(x) and x[order[j + 1]] == x[order[i]]: j += 1
        for t in range(i, j + 1): r[order[t]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(x, y):
    if len(x) < 3: return None
    rx, ry = ranks(x), ranks(y); mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    sx = math.sqrt(sum((a - mx) ** 2 for a in rx)); sy = math.sqrt(sum((b - my) ** 2 for b in ry))
    return None if sx == 0 or sy == 0 else sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / (sx * sy)


def fmt(v, d=3): return "—" if v is None else f"{v:.{d}f}"

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", required=True, choices=["tuning", "evaluation", "induced"])
    ap.add_argument("a"); ap.add_argument("b")
    ap.add_argument("--threshold", type=int, default=1, help="段階の差が、この値以上のものを、協議の対象にする（既定 1＝違うものは、すべて協議）")
    ap.add_argument("--out", default=".")
    ap.add_argument("--allow-incomplete", action="store_true")
    args = ap.parse_args()
    A, pa, na, da = read_rater(args.a, args.set); B, pb, nb, db = read_rater(args.b, args.set)
    bad = [f"採点者A: {p}" for p in pa] + [f"採点者B: {p}" for p in pb]
    if na and na == nb: bad.append(f"2つのファイルの採点者の名前が同じ（{sorted(na)}）。別々の人が採点したことを、確かめてください")
    if bad and not args.allow_incomplete:
        print("問題があります。直してから、もう一度実行してください：", *[" - " + p for p in bad[:30]], sep="\n"); sys.exit(1)
    ids = sorted(set(A) & set(B)); out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    lines = [f"# 採点の一致（{args.set}）", "", f"- 採点者A：{sorted(na) or '（名前なし）'}（AIを使っていない宣言：{sorted(da) or '（なし）'}）", f"- 採点者B：{sorted(nb) or '（名前なし）'}（AIを使っていない宣言：{sorted(db) or '（なし）'}）",
             f"- 入力のSHA-256：A `{sha256(args.a)[:16]}…`／B `{sha256(args.b)[:16]}…`", f"- 会話の数：{len(ids)}／協議の対象にする差：{args.threshold} 段階以上（または、片方だけが評価保留）", "",
             "| 観点 | 比べた数 | 完全に一致 | 差が1以内 | MAE（段階） | 重み付きκ | 評価保留（A／B） |", "|---|---:|---:|---:|---:|---:|---|"]
    rows = []
    for c in CODES:
        pairs = [(A[i][c], B[i][c]) for i in ids if isinstance(A[i][c], int) and isinstance(B[i][c], int)]
        x, y = [p[0] for p in pairs], [p[1] for p in pairs]; n = len(pairs)
        ex = sum(p == q for p, q in pairs) / n if n else None; w1 = sum(abs(p - q) <= 1 for p, q in pairs) / n if n else None
        mae = sum(abs(p - q) for p, q in pairs) / n if n else None
        lines.append(f"| {NAMES[c]} | {n} | {fmt(ex, 2)} | {fmt(w1, 2)} | {fmt(mae, 2)} | {fmt(qwk(x, y))} | {sum(A[i][c] == UNRATED for i in ids)}／{sum(B[i][c] == UNRATED for i in ids)} |")
        for i in ids:
            a, b = A[i][c], B[i][c]
            if a == b: continue
            if a == UNRATED or b == UNRATED or abs(a - b) >= args.threshold:
                rows.append([i, c, a, b, "" if UNRATED in (a, b) else abs(a - b), "", ""])
    ta = {i: total_score(A[i]) for i in ids}; tb = {i: total_score(B[i]) for i in ids}
    both = [i for i in ids if ta[i] is not None and tb[i] is not None]
    lines += ["", f"- 合計点（0〜100）：比べた数 {len(both)}、MAE {fmt(sum(abs(ta[i]-tb[i]) for i in both)/len(both), 1) if both else '—'} 点、Spearman {fmt(spearman([ta[i] for i in both], [tb[i] for i in both]))}",
              f"- 協議する行：{len(rows)} 行（`disagreements_{args.set}.csv`）", "", "※件数が少ない（予備実験）ので、一致の度合いは、目安として読む。"]
    (out / f"agreement_{args.set}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    with open(out / f"disagreements_{args.set}.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(["会話ID", "観点", "採点者A", "採点者B", "差", "協議後の基準", "理由"]); w.writerows(rows)
    print("\n".join(lines)); print(f"\n書き出した：{out / ('agreement_' + args.set + '.md')}、{out / ('disagreements_' + args.set + '.csv')}")
