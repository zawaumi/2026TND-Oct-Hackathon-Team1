"use client";

import { useId, useRef, useState } from "react";
import { api, ApiError, type ExerciseAttempt } from "@/lib/api/client";
import { exerciseNotice } from "@/lib/exercise";
import { checkLatex, displayExpr, EXAMPLES, latexToSpoken } from "@/lib/mathInput";
import { newRequestId } from "@/lib/requestId";
import type { ChatItem } from "./ChatLog";
import { MathInput, type MathInputHandle } from "./MathInput";
import type { ConceptView } from "./parts";

const MAX_POLLS = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 記号のキー。画面の数式キーボードの代わり（会話を隠さない）。読み上げ用の名前も付ける */
const KEYS: { label: string; latex: string; name: string }[] = [
  { label: "x", latex: "x", name: "x" },
  { label: "＋", latex: "+", name: "たす" },
  { label: "－", latex: "-", name: "ひく" },
  { label: "×", latex: "\\times", name: "かける" },
  { label: "÷", latex: "\\div", name: "わる" },
  { label: "＝", latex: "=", name: "イコール" },
  { label: "分数", latex: "\\frac{#@}{#?}", name: "分数" },
  { label: "（", latex: "(", name: "かっこ" },
  { label: "）", latex: ")", name: "かっこ閉じ" },
];

type Problem =
  | { kind: "check"; message: string }
  | { kind: "unsupported"; message: string; guide: string }
  | { kind: "network"; message: string; retry: "create" | "attempt" }
  | { kind: "other"; message: string };

type PendingAttempt = { exerciseId: number; requestId: string; targetId: number };

export type ExercisePhase = "creating" | "solving" | null;

/**
 * 「問題を出す」の入力欄（docs/04 の 5.1・5.4）。
 * 式を入力 → 形式チェック → POST /sessions/{id}/exercises/ → VERIFIED なら POST /exercises/{id}/attempt/ で解答を取る。
 * 送信中は、ボタンを押せなくする（二重送信の防止）。通信に失敗したときの再送は、同じ request_id を使う。
 */
export function ExercisePanel({
  sessionId,
  concepts,
  currentId,
  disabled,
  onPhase,
  onProblem,
  onSolved,
}: {
  sessionId: number;
  concepts: ConceptView[];
  /** いま教えている概念（対象の概念の初期値。docs/04 の 5.2） */
  currentId: number | null;
  /** 「教える」側の送信中など、ここを使えないとき */
  disabled: boolean;
  onPhase: (phase: ExercisePhase) => void;
  onProblem: (item: Extract<ChatItem, { kind: "problem" }>) => void;
  /** ぴあ友の解答が届いた。会話への反映と、知識の取り直しは、呼び出し側が行う */
  onSolved: (attempt: ExerciseAttempt, targetId: number) => Promise<void>;
}) {
  const uid = useId();
  const ids = { label: `${uid}-label`, preview: `${uid}-preview`, error: `${uid}-error`, target: `${uid}-target`, text: `${uid}-text` };

  const mathRef = useRef<MathInputHandle>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false); // 二重送信を、状態の更新を待たずに止める
  const lastCreate = useRef<{ requestId: string; latex: string; targetId: number } | null>(null);
  const pendingAttempt = useRef<PendingAttempt | null>(null);

  const [latex, setLatex] = useState("");
  const [inputMode, setInputMode] = useState<"math" | "text">("math");
  const [override, setOverride] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "creating" | "solving">("idle");
  const [problem, setProblem] = useState<Problem | null>(null);

  const targetId =
    override != null && concepts.some((c) => c.id === override) ? override : (currentId ?? concepts[0]?.id ?? null);
  const working = phase !== "idle";
  const locked = disabled || working;

  const setBusy = (p: "idle" | "creating" | "solving") => {
    setPhase(p);
    onPhase(p === "idle" ? null : p);
  };
  const focusInput = () => (inputMode === "math" ? mathRef.current?.focus() : textRef.current?.focus());

  /** ぴあ友に解いてもらう。VERIFIED でも PROVISIONAL でも、解答を取る（docs/04 の 5.4） */
  const solve = async (exerciseId: number, requestId: string, target: number) => {
    setBusy("solving");
    pendingAttempt.current = { exerciseId, requestId, targetId: target };
    try {
      let result = await api.attemptExercise(exerciseId, requestId);
      let polls = 0;
      while (result.kind === "pending") {
        if (++polls > MAX_POLLS) throw new ApiError(0, "TIMEOUT", "時間がかかっています");
        await sleep(result.retryAfterMs);
        result = await api.attemptExercise(exerciseId, requestId);
      }
      pendingAttempt.current = null;
      await onSolved(result.data, target);
      setProblem(null);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "エラーが起きました");
      if (err.status === 0 || err.status >= 500) {
        setProblem({ kind: "network", message: "ぴあ友が解いている途中で、通信できなくなりました。", retry: "attempt" });
      } else {
        pendingAttempt.current = null;
        setProblem({ kind: "other", message: err.message });
      }
    } finally {
      busy.current = false;
      setBusy("idle");
    }
  };

  const submit = async () => {
    if (busy.current || locked) return;
    const check = checkLatex(latex);
    if (!check.ok) {
      setProblem({ kind: "check", message: check.message });
      focusInput();
      return;
    }
    if (targetId == null) {
      setProblem({ kind: "other", message: "対象の概念が見つかりません。授業を開き直してください。" });
      return;
    }
    busy.current = true;
    setProblem(null);
    pendingAttempt.current = null;
    setBusy("creating");

    // 同じ式・同じ概念の再送なら、同じ request_id（サーバーは1回分しか処理しない）
    const again = lastCreate.current;
    const requestId = again && again.latex === check.latex && again.targetId === targetId ? again.requestId : newRequestId();
    lastCreate.current = { requestId, latex: check.latex, targetId };

    try {
      const exercise = await api.createExercise(sessionId, {
        request_id: requestId,
        kind: "math_equation",
        question: check.question,
        latex: check.latex,
        target_concept_id: targetId,
      });
      lastCreate.current = null;
      const notice = exerciseNotice(exercise);
      if (notice.kind === "unsupported") {
        // 対応していない問題：理由と、入力し直す案内を出す。式は消さない
        setProblem({ kind: "unsupported", message: notice.text, guide: notice.guide });
        busy.current = false;
        setBusy("idle");
        focusInput();
        return;
      }
      onProblem({
        kind: "problem",
        key: `x${requestId}`,
        latex: check.latex,
        note: notice.kind === "provisional" ? notice.text : undefined,
      });
      mathRef.current?.clear();
      setLatex("");
      await solve(exercise.id, newRequestId(), targetId);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "エラーが起きました");
      busy.current = false;
      setBusy("idle");
      if (err.status === 0 || err.status >= 500) {
        setProblem({ kind: "network", message: "通信できませんでした。入力した式は消えていません。", retry: "create" });
      } else {
        setProblem({ kind: "other", message: err.message });
      }
    }
  };

  const retryAttempt = () => {
    const p = pendingAttempt.current;
    if (!p || busy.current || locked) return;
    busy.current = true;
    setProblem(null);
    void solve(p.exerciseId, p.requestId, p.targetId);
  };

  const onChangeLatex = (v: string) => {
    setLatex(v);
    if (problem && problem.kind !== "network") setProblem(null);
  };

  const fillExample = (example: string) => {
    if (locked) return;
    if (inputMode === "math") mathRef.current?.setValue(example);
    else setLatex(example);
    setProblem(null);
    focusInput();
  };

  const press = (key: (typeof KEYS)[number] | "backspace") => {
    if (locked) return;
    if (key === "backspace") mathRef.current?.backspace();
    else mathRef.current?.insert(key.latex);
  };

  const switchMode = (next: "math" | "text") => {
    if (locked || next === inputMode) return;
    setInputMode(next);
    setProblem(null);
  };

  const hasInput = latex.trim().length > 0;
  const describedBy = [ids.preview, problem ? ids.error : null].filter(Boolean).join(" ");

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="問題を出す"
    >
      {/* 対象の概念：いま教えている概念が初期値。選び直せる（ADR-023 A1） */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={ids.target} className="shrink-0 text-[13px] font-bold text-sub">
          対象の概念
        </label>
        <select
          id={ids.target}
          value={targetId ?? ""}
          disabled={locked || concepts.length === 0}
          onChange={(e) => setOverride(Number(e.target.value))}
          className="h-10 min-w-0 flex-1 rounded-xl border border-[#CDD3EA] bg-card px-3 text-[14px] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none disabled:bg-[#F6F7FC] lg:max-w-[420px]"
        >
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.id === currentId ? "（いま教えている概念）" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 式の入力欄 */}
      <div>
        <span id={ids.label} className="sr-only">
          ぴあ友に解いてもらう問題の式
        </span>
        <div
          className={`rounded-2xl border bg-card px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${
            problem && problem.kind !== "network" ? "border-danger" : "border-[#CDD3EA]"
          } ${locked ? "bg-[#F6F7FC]" : ""}`}
        >
          {inputMode === "math" ? (
            <MathInput
              ref={mathRef}
              ariaLabel="問題の式を入力（数式の入力欄）"
              describedBy={describedBy}
              disabled={locked}
              onChange={onChangeLatex}
              onSubmit={() => void submit()}
              onStatus={(s) => {
                if (s === "failed") setInputMode("text"); // 読み込めなければ、文字で入力する方法に切り替える
              }}
            />
          ) : (
            <div className="min-h-[3.25rem] py-1.5 lg:min-h-16 lg:py-2.5">
              <label htmlFor={ids.text} className="sr-only">
                問題の式を入力（文字で入力。例：x+3=7）
              </label>
              <input
                id={ids.text}
                ref={textRef}
                type="text"
                value={latex}
                disabled={locked}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                placeholder="例：x+3=7"
                aria-describedby={describedBy}
                aria-invalid={problem && problem.kind === "check" ? true : undefined}
                onChange={(e) => onChangeLatex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                className="h-11 w-full bg-transparent text-[22px] outline-none placeholder:text-[#8A8DA6] lg:text-[26px]"
              />
            </div>
          )}
        </div>
      </div>

      {/* 記号のキー（数式の入力欄のとき） */}
      {inputMode === "math" && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:flex-wrap lg:overflow-visible" role="group" aria-label="記号のキー">
          {KEYS.map((k) => (
            <button
              key={k.name}
              type="button"
              disabled={locked}
              aria-label={k.name}
              onMouseDown={(e) => e.preventDefault()} // 入力欄からカーソルを外さない
              onClick={() => press(k)}
              className="h-11 min-w-11 shrink-0 rounded-xl border-[1.5px] border-outline bg-card px-3 text-[17px] font-bold text-link hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:opacity-50"
            >
              {k.label}
            </button>
          ))}
          <button
            type="button"
            disabled={locked}
            aria-label="1文字消す"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press("backspace")}
            className="h-11 min-w-11 shrink-0 rounded-xl border-[1.5px] border-outline bg-card px-3 text-[17px] font-bold text-link hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:opacity-50"
          >
            ⌫
          </button>
        </div>
      )}

      {/* 入力した式（見える形と、読み上げ用の言葉） */}
      <div id={ids.preview} className="min-h-6 text-[13.5px] text-sub">
        <span className="sr-only">入力中の式：{hasInput ? latexToSpoken(latex) : "まだ入力していません"}</span>
        <span aria-hidden="true">{hasInput ? `式：${displayExpr(latex)}` : "式を入力して、「出題する」を押してね"}</span>
      </div>

      {/* エラーと案内 */}
      {problem && (
        <div
          id={ids.error}
          role="alert"
          className={`rounded-xl px-3 py-2 text-[13.5px] leading-relaxed ${
            problem.kind === "unsupported" ? "bg-warn-bg text-warn-ink" : "bg-[#FDECEC] text-danger"
          }`}
        >
          <p className="font-bold">
            {problem.kind === "unsupported" ? "この問題には対応していません。" : null}
            {problem.kind !== "unsupported" ? problem.message : null}
          </p>
          {problem.kind === "unsupported" && (
            <>
              <p>{problem.message}</p>
              <p className="mt-0.5 font-bold">{problem.guide}</p>
            </>
          )}
          {problem.kind === "network" && (
            <button
              type="button"
              disabled={locked}
              onClick={problem.retry === "attempt" ? retryAttempt : () => void submit()}
              className="mt-1.5 h-10 rounded-xl border-[1.5px] border-danger bg-card px-4 font-bold text-danger disabled:opacity-60"
            >
              もう一度
            </button>
          )}
        </div>
      )}

      {/* 送信：スマホはボタンを横幅いっぱいに、PCは右に置く */}
      <div className="flex flex-col gap-2 lg:flex-row-reverse lg:items-center lg:justify-between lg:gap-4">
        <button
          type="submit"
          disabled={locked || !hasInput}
          className="h-12 w-full shrink-0 rounded-2xl bg-primary px-7 text-[16px] font-bold text-white hover:bg-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
        >
          {phase === "creating" ? "送信中…" : "出題する"}
        </button>
        <div className="min-w-0 text-[12.5px] leading-relaxed text-sub">
          <div className="flex items-center justify-between gap-3 lg:block">
            <p>
              対応している問題：<span className="font-bold text-ink">一次方程式（文字1つ）</span>
            </p>
            <button
              type="button"
              disabled={locked}
              onClick={() => switchMode(inputMode === "math" ? "text" : "math")}
              className="inline-flex min-h-10 shrink-0 items-center text-[12.5px] font-bold text-link underline underline-offset-2 disabled:opacity-50 lg:min-h-0"
            >
              {inputMode === "math" ? "文字で入力する" : "数式の入力欄に戻す"}
            </button>
          </div>
          <p className="hidden lg:block">
            入力例：
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={locked}
                onClick={() => fillExample(ex)}
                className="mr-1.5 rounded-lg border border-outline bg-card px-2 py-0.5 font-bold text-link hover:bg-soft focus-visible:outline-2 focus-visible:outline-link disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </p>
        </div>
      </div>

      {phase === "solving" && (
        <p className="text-[13.5px] font-bold text-link" role="status">
          ぴあ友が解いています…
        </p>
      )}
    </form>
  );
}
