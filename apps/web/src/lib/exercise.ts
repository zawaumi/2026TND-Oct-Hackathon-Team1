import type { Exercise, ExerciseAttempt } from "@/lib/api/types";

/** 表示の調子。色だけに頼らず、必ず文字とアイコンも付ける（docs/04 の 11） */
export type Tone = "ok" | "info" | "warn";

/** 問題を出したときの、検証状態の案内（docs/04 の 5.4）。APIの分類をそのまま使う */
export type ExerciseNotice =
  | { kind: "verified" }
  | { kind: "provisional"; text: string }
  | { kind: "unsupported"; text: string; guide: string };

export const UNSUPPORTED_GUIDE = "一次方程式（文字1つ）の式を、入力し直してください。例：x+3=7";

export function exerciseNotice(ex: Pick<Exercise, "verification_status" | "reason">): ExerciseNotice {
  if (ex.verification_status === "VERIFIED") return { kind: "verified" };
  if (ex.verification_status === "PROVISIONAL") {
    return { kind: "provisional", text: "練習としては使えますが、習得の回数には入りません。" };
  }
  return { kind: "unsupported", text: ex.reason?.trim() || "この問題には対応していません。", guide: UNSUPPORTED_GUIDE };
}

export type AttemptSummary = {
  tone: Tone;
  headline: string;
  details: string[];
  /** 次にできることの案内 */
  hint?: string;
  /** 最後の行に付ける印。間違えた行／止まった行 */
  markLast?: "wrong" | "stopped";
  /** 「教えるモードで説明する」ボタンを出すか */
  offerTeach: boolean;
};

/**
 * ぴあ友の解答の結果ごとの表示（docs/04 の 5.4）。
 * remaining は「習得まであと〇問」。分からないときは null。ぴあ友の誤りを責める言い方にしない。
 */
export function summarizeAttempt(a: Pick<ExerciseAttempt, "result" | "reason" | "blocked_skill" | "verification_status">, remaining: number | null): AttemptSummary {
  if (a.result === "blocked") {
    return {
      tone: "warn",
      headline: "ぴあ友は、ここで止まりました",
      details: [`まだ教わっていない技能：${a.blocked_skill?.trim() || "（名前が分かりません）"}`],
      hint: "「教える」で説明すると、次は解けるようになります。",
      markLast: "stopped",
      offerTeach: true,
    };
  }
  if (a.result === "incorrect") {
    return {
      tone: "warn",
      headline: "検証すると、答えが合っていませんでした",
      details: ["ぴあ友が間違えた行に印を付けました。もう一度、教えてあげよう。"],
      markLast: "wrong",
      offerTeach: false,
    };
  }
  if (a.result === "unverified") {
    return {
      tone: "info",
      headline: "検証できませんでした",
      details: ["この結果は、習得には使いません。"],
      offerTeach: false,
    };
  }
  // correct
  if (a.reason === "duplicate_form") {
    return {
      tone: "info",
      headline: "検証済み・正解",
      details: ["前と同じ形の問題なので、習得の回数には入りません。"],
      hint: "違う形の問題を出してみよう。例：2x+3=11（x の前に数がある）、3x-4=x+8（両辺に x がある）",
      offerTeach: false,
    };
  }
  if (a.reason === "provisional" || a.verification_status === "PROVISIONAL") {
    return {
      tone: "info",
      headline: "正解（暫定）",
      details: ["練習としては使えますが、習得の回数には入りません。"],
      offerTeach: false,
    };
  }
  if (a.reason === "reset_during_attempt") {
    return {
      tone: "info",
      headline: "正解",
      details: ["授業の途中で知識がリセットされたので、この結果は習得の回数に入りません。"],
      offerTeach: false,
    };
  }
  const details = remaining === null ? [] : remaining > 0 ? [`習得まであと${remaining}問`] : [];
  return { tone: "ok", headline: "検証済み・正解", details, offerTeach: false };
}
