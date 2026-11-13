/**
 * 「問題を出す」で入力した数式の、形式のチェックと、表示用の変換（docs/04 の 5.4）。
 *
 * - LaTeX は「画面で評価しない」。ここでは、決まった記号だけを許す検査と、文字列の置き換えだけを行う。
 *   HTML を組み立てたり、LaTeX の描画処理に渡したりしない（表示は React が文字として出す）。
 * - 検査するのは「書き方」だけ。対応している問題かどうか（一次方程式か、文字は1つか）は、API が
 *   VERIFIED／PROVISIONAL／UNSUPPORTED で決める。ここで勝手に分類しない。
 */

/** 送れる式の長さの上限（LaTeX の文字数） */
export const MAX_LATEX_LENGTH = 200;

/** 使ってよい LaTeX のコマンド。これ以外（\href、\input、\def など）は送らない */
const ALLOWED_COMMANDS = ["frac", "dfrac", "cdot", "times", "div", "sqrt", "left", "right"] as const;
const COMMAND_RE = new RegExp(`\\\\(?:${ALLOWED_COMMANDS.join("|")})(?![A-Za-z])`, "g");

/** 入力例（docs/04 の 5.1）。モックと、教材データの例題に合わせた一次方程式 */
export const EXAMPLES = ["x+3=7", "2x+3=11", "3x-4=x+8"] as const;

export type LatexCheck = { ok: true; latex: string; question: string } | { ok: false; message: string };

const NOT_SUPPORTED_SYMBOL = "対応していない記号が入っています。数字・x・＋－×÷＝・分数・かっこで入力してください。";
const HAS_GAP = "まだ入力していない部分があります。式を最後まで入力してください。";

/** 送る前の形式チェック。通れば、API に送る latex と、読みやすい question（文字の式）を返す */
export function checkLatex(raw: string): LatexCheck {
  const latex = raw.replace(/\u2212/g, "-").trim(); // 長いマイナス（−）は、ふつうのマイナスにそろえる
  if (latex.length === 0) return { ok: false, message: "式を入力してください。" };
  if (latex.length > MAX_LATEX_LENGTH) return { ok: false, message: `式が長すぎます。${MAX_LATEX_LENGTH}文字までにしてください。` };
  if (/[\u0000-\u001f\u007f]/.test(latex)) return { ok: false, message: "使えない文字が入っています。" };
  if (latex.includes("\\placeholder") || /\{\s*\}/.test(latex)) return { ok: false, message: HAS_GAP };

  // 許すコマンドだけを取り除く。バックスラッシュが残ったら、許していないコマンド
  const rest = latex.replace(COMMAND_RE, "");
  if (rest.includes("\\")) return { ok: false, message: NOT_SUPPORTED_SYMBOL };
  if (!/^[0-9A-Za-z+\-=*/^_(){}.,\s]*$/.test(rest)) return { ok: false, message: NOT_SUPPORTED_SYMBOL };

  if (!balanced(rest, "(", ")") || !balanced(rest, "{", "}")) return { ok: false, message: "かっこの数が合っていません。" };
  return { ok: true, latex, question: latexToPlain(latex) };
}

function balanced(s: string, open: string, close: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === open) depth++;
    else if (c === close && --depth < 0) return false;
  }
  return depth === 0;
}

const SIMPLE = /^[0-9a-zA-Z.]+$/;

/** LaTeX を、文字だけの式にする（例：\frac{x}{2}=3 → x/2=3）。API の question にも使う */
export function latexToPlain(latex: string): string {
  let s = latex
    .replace(/\u2212/g, "-")
    .replace(/\\left|\\right/g, "")
    .replace(/\\(?:cdot|times)(?![A-Za-z])/g, "×")
    .replace(/\\div(?![A-Za-z])/g, "÷")
    .replace(/\\dfrac/g, "\\frac");
  // 中かっこのない、いちばん内側から順に外へ
  for (let i = 0; i < 20; i++) {
    const before = s;
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) =>
      SIMPLE.test(a) && SIMPLE.test(b) ? `${a}/${b}` : `(${a})/(${b})`,
    );
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, (_m, a: string) => `√(${a})`);
    s = s.replace(/\^\{([^{}]*)\}/g, (_m, a: string) => (a.length === 1 ? `^${a}` : `^(${a})`));
    s = s.replace(/_\{([^{}]*)\}/g, (_m, a: string) => `_${a}`);
    if (s === before) break;
  }
  return s.replace(/[{}]/g, "").replace(/\s+/g, "").trim();
}

/** 文字の式を、見やすい間隔にする（例：x+3=7 → x + 3 = 7）。画面に出す用 */
export function toDisplay(plain: string): string {
  return plain
    .replace(/(?<=[0-9a-zA-Z)])\s*-\s*(?=[0-9a-zA-Z(])/g, " − ") // 引き算
    .replace(/(^|[=(+×÷])\s*-/g, "$1−") // 符号のマイナス
    .replace(/\s*([=+×÷])\s*/g, " $1 ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

/** API が返す式（LaTeX）を、画面に出す文字の式にする。文字として出すだけで、HTML にはしない */
export function displayExpr(latex: string): string {
  return toDisplay(latexToPlain(latex));
}

/** 読み上げ用の日本語（例：x+3=7 → エックス たす 3 イコール 7）。スクリーンリーダーの代替ラベルに使う */
export function latexToSpoken(latex: string): string {
  let s = latexToPlain(latex);
  const frac = /(\([^()]*\)|[0-9a-zA-Z.]+)\/(\([^()]*\)|[0-9a-zA-Z.]+)/g;
  for (let i = 0; i < 5 && frac.test(s); i++) {
    s = s.replace(frac, (_m, a: string, b: string) => ` ${b.replace(/[()]/g, "")}分の${a.replace(/[()]/g, "")} `);
    frac.lastIndex = 0;
  }
  s = s
    .replace(/(?<=[0-9a-zA-Z)])\s*-\s*(?=[0-9a-zA-Z(])/g, " ひく ")
    .replace(/(^|[=(+×÷])\s*-/g, "$1 マイナス ")
    .replace(/\+/g, " たす ")
    .replace(/×/g, " かける ")
    .replace(/÷/g, " わる ")
    .replace(/=/g, " イコール ")
    .replace(/\^2/g, " の2乗 ")
    .replace(/\^(\d+)/g, " の$1乗 ")
    .replace(/√\(/g, " ルート ")
    .replace(/\(/g, " かっこ ")
    .replace(/\)/g, " かっこ閉じ ")
    .replace(/x/g, " エックス ");
  return s.replace(/\s+/g, " ").replace(/分の /g, "分の").trim();
}
