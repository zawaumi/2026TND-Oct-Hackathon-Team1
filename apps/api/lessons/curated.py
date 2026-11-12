"""公開教材（CURATED）のデータファイルの検査（Issue #17）。

データファイル（lessons/data/*.json）の例題が数学的に正しいか、概念の前提・技能・習得条件が
つじつまが合っているかを、Django にも DB にも頼らず確かめる。SymPy などの追加の依存は使わない。

- 式は「一次方程式（整数・有理数の係数、文字は x 1つ）」の範囲だけ読む。ast で安全な文法に限り、
  eval は使わない（docs/03 D：LaTeX や文字列をそのままコードとして扱わない）。
- 各ステップは「どの規則（技能）を、両辺にどう使ったか」を ops に書き、その結果の式と一致するかを確かめる。
"""

from __future__ import annotations

import ast
import re
from fractions import Fraction

# 使ってよい規則の名前（docs/03 D、glossary の「技能」）
MAIN_RULES = ("add_both_sides", "subtract_both_sides", "multiply_nonzero", "divide_nonzero")
AUX_RULES = ("simplify_arithmetic", "distribute")  # 式を整えるだけの補助。概念の技能には数えない
ALL_RULES = MAIN_RULES + AUX_RULES

SENTENCE_END = "。"
MAX_DESCRIPTION_SENTENCES = 2  # 知識マップの説明は1〜2文（ADR-023 A6）


class Lin:
    """a*x + b（x の一次式）。係数は有理数（Fraction）で厳密に持つ。"""

    __slots__ = ("a", "b")

    def __init__(self, a=0, b=0):
        self.a = Fraction(a)
        self.b = Fraction(b)

    def __add__(self, o):
        return Lin(self.a + o.a, self.b + o.b)

    def __sub__(self, o):
        return Lin(self.a - o.a, self.b - o.b)

    def __neg__(self):
        return Lin(-self.a, -self.b)

    def is_const(self):
        return self.a == 0

    def __mul__(self, o):
        if self.is_const():
            return Lin(o.a * self.b, o.b * self.b)
        if o.is_const():
            return Lin(self.a * o.b, self.b * o.b)
        raise ValueError("x どうしのかけ算は一次式の範囲外です")

    def __truediv__(self, o):
        if not o.is_const() or o.b == 0:
            raise ValueError("0 または x でわることはできません")
        return Lin(self.a / o.b, self.b / o.b)

    def __eq__(self, o):
        return isinstance(o, Lin) and self.a == o.a and self.b == o.b

    def __repr__(self):
        return f"Lin({self.a}x + {self.b})"


def _normalize(text: str) -> str:
    s = text.replace(" ", "").replace("　", "").replace("−", "-").replace("×", "*").replace("÷", "/")
    s = s.replace("＝", "=")
    s = re.sub(r"(?<=[\dx)])(?=x)", "*", s)  # 2x → 2*x
    s = re.sub(r"(?<=[\dx)])(?=\()", "*", s)  # 2(x+1) → 2*(x+1)
    s = re.sub(r"(?<=\))(?=\d)", "*", s)  # (x+1)2 → (x+1)*2（ふつうは使わない）
    return s


def parse_side(text: str) -> Lin:
    """片方の辺（例 '3x-2'）を一次式として読む。範囲外なら ValueError。"""
    try:
        tree = ast.parse(_normalize(text), mode="eval")
    except SyntaxError as e:
        raise ValueError(f"式を読めません: {text!r}") from e

    def walk(node) -> Lin:
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and type(node.value) is int:
            return Lin(0, node.value)
        if isinstance(node, ast.Name) and node.id == "x":
            return Lin(1, 0)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = walk(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.BinOp):
            left, right = walk(node.left), walk(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
        raise ValueError(f"対応していない式です: {text!r}")

    return walk(tree)


def parse_equation(text: str) -> tuple[Lin, Lin]:
    parts = _normalize(text).split("=")
    if len(parts) != 2 or not all(parts):
        raise ValueError(f"等式として読めません: {text!r}")
    return parse_side(parts[0]), parse_side(parts[1])


def solve(left: Lin, right: Lin) -> Fraction | None:
    """(a1-a2)x = (b2-b1) の解。解が1つに決まらないときは None。"""
    a, b = left.a - right.a, right.b - left.b
    return None if a == 0 else b / a


def parse_fraction(text: str) -> Fraction:
    return Fraction(text.replace(" ", ""))


def apply_ops(left: Lin, right: Lin, ops: list[dict]) -> tuple[Lin, Lin]:
    """ops を両辺に順に使う。0 でかける・わる、範囲外の規則は ValueError。"""
    for op in ops:
        rule = op.get("rule")
        if rule not in ALL_RULES:
            raise ValueError(f"知らない規則です: {rule!r}")
        if rule in AUX_RULES:
            continue  # 式を整えるだけ。値は変わらない
        arg = parse_side(str(op.get("arg", "")))
        if rule == "add_both_sides":
            left, right = left + arg, right + arg
        elif rule == "subtract_both_sides":
            left, right = left - arg, right - arg
        elif rule in ("multiply_nonzero", "divide_nonzero"):
            if not arg.is_const() or arg.b == 0:
                raise ValueError(f"{rule} の数は 0 以外の数だけです: {op.get('arg')!r}")
            if rule == "multiply_nonzero":
                left, right = left * arg, right * arg
            else:
                left, right = left / arg, right / arg
    return left, right


def check_example(example: dict) -> list[str]:
    """例題1つの検算。問題があれば、その説明の一覧を返す（なければ空）。"""
    eid = example.get("id", "?")
    errors: list[str] = []

    def err(msg):
        errors.append(f"例題 {eid}: {msg}")

    try:
        eq_left, eq_right = parse_equation(example["equation"])
        claimed = parse_fraction(example["solution"])
    except (KeyError, ValueError, ZeroDivisionError) as e:
        return [f"例題 {eid}: 式または解を読めません（{e}）"]

    real = solve(eq_left, eq_right)
    if real is None:
        err("解が1つに決まらない式です")
    elif real != claimed:
        err(f"解が違います（書いてある解 {claimed}、実際の解 {real}）")
    elif eq_left.a * claimed + eq_left.b != eq_right.a * claimed + eq_right.b:
        err("解を代入すると左辺と右辺が等しくなりません")

    steps = example.get("steps") or []
    if example.get("verification", "VERIFIED") == "UNSUPPORTED":
        return errors  # 立式を自動で採点できない例。解の検算だけ行う
    if len(steps) < 2:
        return errors + [f"例題 {eid}: ステップが足りません"]
    try:
        if parse_equation(steps[0]["expr"]) != (eq_left, eq_right):
            err("最初のステップが問題の式と一致しません")
        prev = parse_equation(steps[0]["expr"])
        for i, step in enumerate(steps[1:], start=2):
            ops = step.get("ops") or []
            if not ops:
                err(f"ステップ {i} に ops（使った規則）がありません")
                continue
            expected = apply_ops(prev[0], prev[1], ops)
            actual = parse_equation(step["expr"])
            if expected != actual:
                err(f"ステップ {i}（{step['expr']}）が、{_ops_text(ops)} の結果と一致しません")
            prev = actual
        if solve(*prev) is None or prev[0] != Lin(1, 0) or prev[1] != Lin(0, claimed):
            err("最後のステップが x=（解）の形になっていません")
        elif not re.fullmatch(r"x=-?\d+(/\d+)?", _normalize(steps[-1]["expr"])):
            err("最後のステップは、整理した x=（数）の形（例 x=4、x=3/2）で書いてください")
    except (KeyError, ValueError) as e:
        err(str(e))
    return errors


def _ops_text(ops) -> str:
    return "＋".join(f"{o.get('rule')}({o.get('arg', '')})" for o in ops)


def rules_used(example: dict) -> set[str]:
    used = set()
    for step in example.get("steps") or []:
        for op in step.get("ops") or []:
            used.add(op.get("rule"))
    return used


def _toposort_ok(nodes: set[str], edges: list[tuple[str, str]]) -> bool:
    """edges は (前提, 概念)。循環がなければ True。"""
    indeg = {n: 0 for n in nodes}
    out: dict[str, list[str]] = {n: [] for n in nodes}
    for p, c in edges:
        out[p].append(c)
        indeg[c] += 1
    ready = [n for n, d in indeg.items() if d == 0]
    seen = 0
    while ready:
        n = ready.pop()
        seen += 1
        for m in out[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                ready.append(m)
    return seen == len(nodes)


def validate_dataset(data: dict) -> list[str]:
    """データファイル全体の検査。問題の説明の一覧を返す（なければ空）。"""
    problems: list[str] = []
    concepts = {c["code"]: c for c in data.get("concepts", [])}
    if len(concepts) != len(data.get("concepts", [])):
        problems.append("概念のコードが重複しています")

    # ---- 概念：前提・技能・習得条件・例題
    edges = []
    for code, c in concepts.items():
        desc = c.get("description", "")
        if not desc.strip():
            problems.append(f"概念 {code}: description（知識マップの説明）がありません")
        elif desc.count(SENTENCE_END) > MAX_DESCRIPTION_SENTENCES:
            problems.append(f"概念 {code}: description は1〜2文にしてください")
        for p in c.get("prerequisites", []):
            if p == code:
                problems.append(f"概念 {code}: 自分自身を前提にできません")
            elif p not in concepts:
                problems.append(f"概念 {code}: 前提 {p} がありません")
            else:
                edges.append((p, code))
    if not _toposort_ok(set(concepts), [e for e in edges if e[0] != e[1]]):
        problems.append("概念の前提関係が循環しています")

    def usable_skills(code, seen=None) -> set[str]:
        seen = seen or set()
        if code in seen:
            return set()
        seen.add(code)
        skills = set(concepts[code].get("skills", []))
        for p in concepts[code].get("prerequisites", []):
            if p in concepts:
                skills |= usable_skills(p, seen)
        return skills

    for code, c in concepts.items():
        for s in c.get("skills", []):
            if s not in MAIN_RULES:
                problems.append(f"概念 {code}: 知らない技能 {s}")
        verified = c.get("verification") == "VERIFIED"
        examples = c.get("examples", [])
        if verified:
            policy = c.get("mastery_policy")
            if not policy:
                problems.append(f"概念 {code}: 検証できる概念には mastery_policy が必要です")
            else:
                forms = {e.get("form") for e in examples if e.get("verification", "VERIFIED") == "VERIFIED"}
                n_ok = sum(1 for e in examples if e.get("verification", "VERIFIED") == "VERIFIED")
                if n_ok < policy["required_correct"]:
                    problems.append(f"概念 {code}: 習得条件の正答数 {policy['required_correct']} に対し、例題が {n_ok} 問しかありません")
                if len(forms) < policy["required_problem_variants"]:
                    problems.append(f"概念 {code}: 習得条件の形式数 {policy['required_problem_variants']} に対し、問題の形が {len(forms)} 種類しかありません")
        elif c.get("verification") != "UNSUPPORTED":
            problems.append(f"概念 {code}: verification は VERIFIED か UNSUPPORTED にしてください")
        allowed = usable_skills(code)
        for e in examples:
            problems.extend(check_example(e))
            used = rules_used(e) - set(AUX_RULES)
            if e.get("verification", "VERIFIED") == "VERIFIED" and not used <= allowed:
                problems.append(
                    f"例題 {e.get('id')}: 概念 {code} とその前提にない技能を使っています: {sorted(used - allowed)}"
                )

    # ---- 教材（領域・単元・小単元）
    lessons = {l["key"]: l for l in data.get("lessons", [])}
    if len(lessons) != len(data.get("lessons", [])):
        problems.append("教材の key が重複しています")
    source_ids = {s["id"] for s in data.get("sources", [])}
    lesson_edges = []
    for key, l in lessons.items():
        parent = l.get("parent")
        if parent is not None:
            if parent not in lessons:
                problems.append(f"教材 {key}: 親 {parent} がありません")
            else:
                lesson_edges.append((parent, key))
        for cc in l.get("concepts", []):
            if cc not in concepts:
                problems.append(f"教材 {key}: 概念 {cc} がありません")
        for sid in l.get("sources", []):
            if sid not in source_ids:
                problems.append(f"教材 {key}: 出典 {sid} が sources にありません")
        if l.get("kind") == "lesson":
            if l.get("publish_scope") == "mvp":
                if not l.get("sources"):
                    problems.append(f"教材 {key}: 公開する小単元には出典が必要です")
                for cc in l.get("concepts", []):
                    if concepts.get(cc, {}).get("verification") != "VERIFIED":
                        problems.append(f"教材 {key}: 公開する小単元に、検証できない概念 {cc} が含まれています（ADR-028）")
                for field in ("definition", "goals", "rubric"):
                    if not l.get(field):
                        problems.append(f"教材 {key}: {field} がありません")
    if not _toposort_ok(set(lessons), lesson_edges):
        problems.append("教材の階層が循環しています")

    mvp_titles = sorted(l["title"] for l in lessons.values() if l.get("kind") == "lesson" and l.get("publish_scope") == "mvp")
    expected = sorted(["等式の性質", "方程式の解法", "移項"])
    if mvp_titles != expected:
        problems.append(f"公開する小単元は {expected} の3つだけです（ADR-028）。いまは {mvp_titles}")

    # ---- レビュー
    review = data.get("review") or {}
    status = review.get("status")
    if status not in ("pending", "approved"):
        problems.append("review.status は pending か approved にしてください")
    if status == "approved":
        for f in ("math_reviewer", "source_reviewer", "reviewed_on"):
            if not review.get(f):
                problems.append(f"review が approved なのに {f} が空です")
        if review.get("math_reviewer") and review.get("math_reviewer") == review.get("author"):
            problems.append("数学内容のレビューは、作った人とは別の人が行ってください")
    return problems
