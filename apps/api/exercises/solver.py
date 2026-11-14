"""一次方程式を読み、ぴあ友が知っている技能だけで1ステップずつ解く（docs/03 D、数学 Skill Executor の最小限）。

- 式は安全な文法だけで読む（lessons/curated.py の parse_side。ast を使い、eval はしない）。
  文字は x 1つ、係数は整数・有理数、x の1次まで。長さ・数の大きさにも上限を置く。
- 解き方は決まった手順で作る：x の項を左辺へ → 数の項を右辺へ → x の係数で割る（または逆数をかける）。
  各ステップで使う規則（技能）は固定の名前で、ぴあ友が使えない規則に来たら、そこで止まる（blocked）。
  汎用の solve の答えを「ぴあ友の考え」として出すことはしない。
- 検証は、手順の作り方とは別に行う：各ステップの式の解が、もとの式の解と同じか／最後が x=（解）か／
  解をもとの式に代入して左右が等しいか。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from fractions import Fraction

from lessons.curated import Lin, parse_side, solve
from lessons.skills import SKILL_LABELS

MAX_EXPR_LENGTH = 200
MAX_NUMBER = 10_000  # 係数・定数の分子と分母の上限（大きすぎる数は扱わない）


class UnsupportedEquation(ValueError):
    """対応していない式。メッセージはそのまま画面に出す"""


@dataclass(frozen=True)
class Equation:
    left: Lin
    right: Lin

    @property
    def solution(self) -> Fraction | None:
        return solve(self.left, self.right)


@dataclass(frozen=True)
class Step:
    expr: str  # LaTeX
    skill: str | None
    skill_label: str | None


@dataclass(frozen=True)
class Plan:
    steps: tuple[Step, ...]
    used: frozenset[str]  # 使った技能（補助を含む）
    blocked_skill: str | None  # 止まったときの規則の名前


# ---------------------------------------------------------------- 読む

_LETTER = re.compile(r"[A-Za-wyz]")


def latex_to_expr(latex: str) -> str:
    """数式入力（MathLive）の LaTeX を、parse_side が読める文字の式にする。許す命令以外は対応外。"""
    s = latex.replace("\\left", "").replace("\\right", "").replace("\\dfrac", "\\frac")
    s = re.sub(r"\\(?:cdot|times)(?![A-Za-z])", "*", s)
    s = re.sub(r"\\div(?![A-Za-z])", "/", s)
    s = s.replace("\\,", "").replace("\\ ", "")
    for _ in range(10):  # 内側の分数から順に
        new = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"((\1)/(\2))", s)
        if new == s:
            break
        s = new
    if "\\" in s:
        raise UnsupportedEquation("対応していない記号が入っています。数字・x・＋－×÷＝・分数・かっこで入力してください。")
    if "{" in s or "}" in s:
        raise UnsupportedEquation("2乗などを含む式には対応していません。一次方程式（文字は x 1つ）だけです。")
    return s


def parse_equation(text: str) -> Equation:
    """文字の式（例 '3x-4=x+8'）を読む。対応外なら UnsupportedEquation（理由つき）。"""
    s = (text or "").strip().replace("−", "-").replace("＝", "=").replace("×", "*").replace("÷", "/")
    if not s:
        raise UnsupportedEquation("式を入力してください。")
    if len(s) > MAX_EXPR_LENGTH:
        raise UnsupportedEquation(f"式が長すぎます。{MAX_EXPR_LENGTH}文字までにしてください。")
    if "^" in s or "√" in s or "**" in s:
        raise UnsupportedEquation("2乗やルートを含む式には対応していません。一次方程式（文字は x 1つ）だけです。")
    if _LETTER.search(s):
        raise UnsupportedEquation("文字は x だけにしてください（一次方程式・文字1つに対応しています）。")
    if "." in s:
        raise UnsupportedEquation("小数には対応していません。分数で入力してください。")
    if not re.fullmatch(r"[0-9x+\-*/()=\s]+", s):
        raise UnsupportedEquation("使えない記号が入っています。数字・x・＋－×÷＝・かっこで入力してください。")
    parts = s.split("=")
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        raise UnsupportedEquation("「＝」を1つだけ含む等式を入力してください。")
    try:
        left, right = parse_side(parts[0]), parse_side(parts[1])
    except ZeroDivisionError:
        raise UnsupportedEquation("0 でわる式は使えません。") from None
    except ValueError:
        raise UnsupportedEquation("一次方程式（x の2乗や、x でわる式を含まない式）だけに対応しています。") from None
    for v in (left.a, left.b, right.a, right.b):
        if abs(v.numerator) > MAX_NUMBER or v.denominator > MAX_NUMBER:
            raise UnsupportedEquation("数が大きすぎます。もう少し小さい数で出してください。")
    eq = Equation(left, right)
    if left.a == right.a:
        raise UnsupportedEquation("x の値が1つに決まらない式です。x を含む一次方程式を出してください。")
    return eq


def parse_input(latex: str | None, question: str | None) -> Equation:
    """API に届いた latex（あれば優先）か question を読む"""
    if latex and latex.strip():
        return parse_equation(latex_to_expr(latex))
    return parse_equation(question or "")


# ---------------------------------------------------------------- 書く（LaTeX）


def _num(q: Fraction) -> str:
    if q.denominator == 1:
        return str(q.numerator)
    sign = "-" if q < 0 else ""
    return f"{sign}\\frac{{{abs(q.numerator)}}}{{{q.denominator}}}"


def format_side(lin: Lin) -> str:
    parts: list[str] = []
    a, b = lin.a, lin.b
    if a != 0:
        if a == 1:
            parts.append("x")
        elif a == -1:
            parts.append("-x")
        elif a.denominator == 1:
            parts.append(f"{a.numerator}x")
        elif abs(a.numerator) == 1:
            parts.append(f"{'-' if a < 0 else ''}\\frac{{x}}{{{a.denominator}}}")
        else:
            parts.append(f"{_num(a)}x")
    if b != 0 or not parts:
        text = _num(b)
        if parts and not text.startswith("-"):
            text = "+" + text
        parts.append(text)
    return "".join(parts)


def format_equation(left: Lin, right: Lin) -> str:
    return f"{format_side(left)}={format_side(right)}"


def form_code(eq: Equation) -> str:
    """問題の形（数字を n にした形）。同じ形の問題は、習得の回数に1回しか数えない"""

    def side(lin: Lin) -> str:
        out = ""
        if lin.a != 0:
            a = lin.a
            out += "x" if a == 1 else "-x" if a == -1 else ("ax" if a.denominator == 1 else "x/a" if abs(a.numerator) == 1 else "(p/q)x")
        if lin.b != 0:
            out += ("+n" if lin.b > 0 else "-n") if out else ("n" if lin.b > 0 else "-n")
        return out or "0"

    return f"{side(eq.left)}={side(eq.right)}"


# ---------------------------------------------------------------- 解く


def _expr_of(text: str) -> str:
    return re.sub(r"\s+", "", text)


def make_plan(eq: Equation, allowed: frozenset[str], original_expr: str) -> Plan:
    """ぴあ友が使える技能（allowed）だけで解く。使えない技能に来たら、そこで止める。"""
    left, right = eq.left, eq.right
    steps = [Step(expr=original_expr, skill=None, skill_label=None)]
    used: set[str] = set()

    def apply(rule: str, new_left: Lin, new_right: Lin) -> bool:
        nonlocal left, right
        if rule not in allowed:
            return False
        left, right = new_left, new_right
        used.add(rule)
        steps.append(Step(expr=format_equation(left, right), skill=rule, skill_label=SKILL_LABELS[rule]))
        return True

    def blocked(rule: str) -> Plan:
        return Plan(tuple(steps), frozenset(used), rule)

    # 0. 入力が整理されていなければ（かっこ・同じ辺に同類の項）、まず整える
    canonical = format_equation(left, right)
    if _expr_of(original_expr) != canonical:
        rule = "distribute" if "(" in original_expr else "simplify_arithmetic"
        if not apply(rule, left, right):
            return blocked(rule)

    # 1. 右辺の x の項を左辺へ
    if right.a != 0:
        term = Lin(right.a, 0)
        if right.a > 0:
            ok = apply("subtract_both_sides", left - term, right - term)
            if not ok:
                return blocked("subtract_both_sides")
        else:
            ok = apply("add_both_sides", left - term, right - term)
            if not ok:
                return blocked("add_both_sides")

    # 2. 左辺の数の項を右辺へ
    if left.b != 0:
        term = Lin(0, left.b)
        rule = "subtract_both_sides" if left.b > 0 else "add_both_sides"
        if not apply(rule, left - term, right - term):
            return blocked(rule)

    # 3. x の係数を 1 にする
    a = left.a
    if a != 1:
        if a.denominator == 1:
            if not apply("divide_nonzero", left / Lin(0, a), right / Lin(0, a)):
                return blocked("divide_nonzero")
        elif abs(a.numerator) == 1:
            k = Lin(0, Fraction(a.denominator * (1 if a > 0 else -1)))
            if not apply("multiply_nonzero", left * k, right * k):
                return blocked("multiply_nonzero")
        else:
            k = Lin(0, Fraction(a.denominator))
            if not apply("multiply_nonzero", left * k, right * k):
                return blocked("multiply_nonzero")
            p = Lin(0, Fraction(left.a))
            if not apply("divide_nonzero", left / p, right / p):
                return blocked("divide_nonzero")
    return Plan(tuple(steps), frozenset(used), None)


def verify_plan(eq: Equation, plan: Plan) -> bool:
    """解き方とは別の方法で確かめる：各ステップの解がもとの解と同じ／最後が x=（解）／代入して等しい"""
    answer = eq.solution
    if answer is None or plan.blocked_skill is not None:
        return False
    if eq.left.a * answer + eq.left.b != eq.right.a * answer + eq.right.b:
        return False
    for step in plan.steps[1:]:
        try:
            s = parse_equation(latex_to_expr(step.expr))
        except UnsupportedEquation:
            return False
        if s.solution != answer:
            return False
    last = parse_equation(latex_to_expr(plan.steps[-1].expr))
    return last.left == Lin(1, 0) and last.right == Lin(0, answer)
