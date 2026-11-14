#!/usr/bin/env python3
"""採点実験のデータの整合を確かめる（追加の部品は要らない）。

  python3 docs/experiments/scoring/check_data.py                      # 公開してよいデータだけを検査
  python3 docs/experiments/scoring/check_data.py --key answer_key.json  # 採点が終わったあと、キーも含めて検査
"""
import argparse, csv, hashlib, json, re, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
problems = []
def need(cond, msg):
    if not cond: problems.append(msg)

ap = argparse.ArgumentParser(); ap.add_argument("--key"); args = ap.parse_args()
conv = json.loads((HERE / "conversations.json").read_text(encoding="utf-8"))["conversations"]
split = json.loads((HERE / "split.json").read_text(encoding="utf-8"))
ind = json.loads((HERE / "induced.json").read_text(encoding="utf-8"))
by_id = {c["id"]: c for c in conv}

# ── 件数と、IDの形
need(len(conv) == 45, f"会話は45件のはずが {len(conv)} 件")
need(len(by_id) == len(conv), "会話のIDが重複している")
need(all(re.fullmatch(r"C\d{2}", i) for i in by_id), "会話のIDが C01〜C45 の形でない")
for c in conv:
    for f in ("lesson", "teacher_explanation", "peer_question", "teacher_answer"):
        need(isinstance(c.get(f), str) and c[f].strip(), f"{c['id']} の {f} が空")
    need(set(c) == {"id", "lesson", "teacher_explanation", "peer_question", "teacher_answer"}, f"{c['id']} に、余計な項目がある（種類などを書かない）")

# ── 分割：調整用9・評価用36、重ならない、合わせて45
t, e = set(split["tuning"]), set(split["evaluation"])
need(len(t) == 9 and len(e) == 36, f"調整用 {len(t)} 件・評価用 {len(e)} 件（9 と 36 のはず）")
need(not (t & e), f"調整用と評価用が重なっている: {sorted(t & e)}")
need(t | e == set(by_id), "調整用と評価用を合わせても、45件にならない")

# ── 採点誘導：12ペア。元は評価用。誘導は、元の文のあとに、書き足しただけ
pairs, ic = ind["pairs"], {c["id"]: c for c in ind["conversations"]}
need(len(pairs) == 12 and len(ic) == 12, "採点誘導のペアは12件のはず")
need(len({p["base_id"] for p in pairs}) == 12, "元の会話が、重複している")
for p in pairs:
    base, x = by_id.get(p["base_id"]), ic.get(p["induced_id"])
    need(base is not None and x is not None, f"{p['pair_id']}: 元か誘導の会話がない")
    if base and x:
        need(p["base_id"] in e, f"{p['pair_id']}: 元の会話 {p['base_id']} が評価用でない")
        need(x["lesson"] == base["lesson"] and x["teacher_explanation"] == base["teacher_explanation"] and x["peer_question"] == base["peer_question"], f"{p['pair_id']}: 誘導の前後で、説明や質問が変わっている")
        need(x["teacher_answer"] == base["teacher_answer"] + p["injected_text"], f"{p['pair_id']}: 誘導の文以外が、元と違う")

# ── 個人情報などが入っていない（目安の検査。完全ではない）
PII = [(r"[\w.+-]+@[\w-]+\.[\w.]+", "メールアドレス"), (r"https?://", "URL"), (r"\d{2,4}-\d{2,4}-\d{3,4}", "電話番号らしい数字"), (r"\d{7,}", "長い数字"), (r"[一-龥]{1,6}(小学校|中学校|高等学校|高校)", "学校名らしい語"), (r"(様|氏)\b", "人名らしい敬称")]
for c in list(conv) + list(ic.values()):
    text = " ".join(c[f] for f in ("teacher_explanation", "peer_question", "teacher_answer"))
    for pat, name in PII:
        need(not re.search(pat, text), f"{c['id']}: {name}が入っているかもしれない")

# ── 採点シート：IDが、ちょうどそろっている（種類・調整用・評価用の列がない）
for name, ids in (("score_sheet_tuning.csv", t), ("score_sheet_evaluation.csv", e), ("score_sheet_induced.csv", set(ic))):
    rows = list(csv.DictReader((HERE / name).read_text(encoding="utf-8-sig").splitlines()))
    need(set(rows[0]) == {"id", "accuracy", "logic", "clarity", "comment"}, f"{name}: 列が決まりどおりでない")
    need(Counter(r["id"] for r in rows) == Counter(ids), f"{name}: IDが、対象の会話とちょうど一致しない")


# ── 固定の記録（指紋）：データが、固定したときのままか
man = json.loads((HERE / "frozen_manifest.json").read_text(encoding="utf-8"))
for name, want in man["sha256"].items():
    got = hashlib.sha256((HERE / name).read_bytes()).hexdigest()
    need(got == want, f"{name} が、固定したときから変わっている（指紋が一致しない）")

# ── 採点ツール（score_tool.html）：中のデータが、会話・分割・採点シートと同じ
html = (HERE / "score_tool.html").read_text(encoding="utf-8")
m = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S)
need(m is not None, "score_tool.html に、データが見つからない")
if m:
    tool = json.loads(m.group(1).replace("<\\/", "</"))
    strip = lambda c: {k: c[k] for k in ("lesson", "teacher_explanation", "peer_question", "teacher_answer")}
    need(tool["items"]["base"] == {i: strip(c) for i, c in by_id.items()}, "score_tool.html の会話が、conversations.json と違う")
    need(tool["items"]["induced"] == {c["id"]: strip(c) for c in ic.values()}, "score_tool.html の誘導の会話が、induced.json と違う")
    for key_, fname in (("tuning", "score_sheet_tuning.csv"), ("evaluation", "score_sheet_evaluation.csv"), ("induced", "score_sheet_induced.csv")):
        order = [r["id"] for r in csv.DictReader((HERE / fname).read_text(encoding="utf-8-sig").splitlines())]
        need(tool["sets"][key_] == order, f"score_tool.html の {key_} の順番が、{fname} と違う")
    need("category" not in html and "intended_defect" not in html, "score_tool.html に、種類を示す項目が入っている")

# ── キー（採点が終わったあと）
if args.key:
    raw = Path(args.key).read_bytes(); key = json.loads(raw)
    print("キーの SHA-256:", hashlib.sha256(raw).hexdigest(), "（README に記録した値と同じか、確かめる）")
    cats = key["categories"]
    need(Counter(cats.values()) == Counter({"正しい": 15, "不完全": 15, "誤り": 15}), "種類の数が、15・15・15 でない")
    need(set(cats) == set(by_id), "キーの会話のIDが、会話と一致しない")
    need(set(key["tuning"]) == t and set(key["evaluation"]) == e, "キーの分割が、split.json と違う")
    need(Counter(cats[i] for i in t) == Counter({"正しい": 3, "不完全": 3, "誤り": 3}), "調整用の種類が、3・3・3 でない")
    need(Counter(cats[i] for i in e) == Counter({"正しい": 12, "不完全": 12, "誤り": 12}), "評価用の種類が、12・12・12 でない")
    need(Counter(cats[p["base_id"]] for p in pairs) == Counter({"正しい": 4, "不完全": 4, "誤り": 4}), "誘導ペアの元の種類が、4・4・4 でない")
    lessons = Counter((by_id[i]["lesson"], cats[i]) for i in by_id)
    need(all(v == 5 for v in lessons.values()) and len(lessons) == 9, "小単元×種類が、5件ずつでない")

print("問題:", "なし" if not problems else "")
for p in problems: print(" -", p)
print(f"会話 {len(conv)}（調整用 {len(t)}・評価用 {len(e)}）／採点誘導 {len(pairs)} ペア" + ("／キーも検査" if args.key else "／キーは検査していない"))
sys.exit(1 if problems else 0)
