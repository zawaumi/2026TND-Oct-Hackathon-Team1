"use client";

import type { ExerciseAttempt } from "@/lib/api/types";
import { summarizeAttempt, type Tone } from "@/lib/exercise";
import { displayExpr, latexToSpoken } from "@/lib/mathInput";

/** 会話に出す「あなたが出した問題」（青い吹き出し）。式は文字として出す（HTMLにしない） */
export function ProblemBubble({ latex, note }: { latex: string; note?: string }) {
  return (
    <div className="flex max-w-full flex-col items-end">
      <span className="sr-only">あなたが出した問題：</span>
      <div className="max-w-full rounded-[18px] bg-[#3359D9] px-4 py-3 text-white lg:px-4.5">
        <span className="block text-[12px] font-bold opacity-90">問題</span>
        <p className="text-[20px] leading-snug font-bold tabular-nums break-words">
          <span className="sr-only">{latexToSpoken(latex)}</span>
          <span aria-hidden="true">{displayExpr(latex)}</span>
        </p>
      </div>
      {note && <p className="mt-1.5 text-[12.5px] text-sub">{note}</p>}
    </div>
  );
}

const TONE: Record<Tone, { box: string; icon: string }> = {
  ok: { box: "bg-[#E6F5EA] text-[#17562E]", icon: "✓" },
  info: { box: "bg-[#EAEEFB] text-ink", icon: "ℹ" },
  warn: { box: "bg-warn-bg text-warn-ink", icon: "！" },
};

/** 会話に出す「ぴあ友の解答」。1行ずつ、式と、使った技能の名前を出す（docs/04 の 5.4） */
export function SolutionCard({
  attempt,
  remaining,
  onTeach,
}: {
  attempt: ExerciseAttempt;
  remaining: number | null;
  onTeach?: () => void;
}) {
  const steps = attempt.steps ?? [];
  const summary = summarizeAttempt(attempt, remaining);
  const tone = TONE[summary.tone];
  const markLabel = summary.markLast === "wrong" ? "ここを見直そう" : summary.markLast === "stopped" ? "ここで止まった" : null;

  return (
    <div className="min-w-0 flex-1">
      <span className="sr-only">ぴあ友の解答：</span>
      <div className="rounded-[18px] bg-soft px-4 py-3 lg:px-4.5">
        <p className="text-[12.5px] font-bold text-sub">ぴあ友の解答</p>
        {steps.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-2">
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span aria-hidden="true" className="w-4 shrink-0 text-[12px] text-sub">
                    {i + 1}
                  </span>
                  <span className="sr-only">{i + 1}行目：{latexToSpoken(step.expr)}</span>
                  <span aria-hidden="true" className="text-[19px] leading-snug font-bold tabular-nums break-words">
                    {displayExpr(step.expr)}
                  </span>
                  {step.skill_label && (
                    <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-[11.5px] font-bold text-warn-ink">
                      {step.skill_label}
                    </span>
                  )}
                  {isLast && markLabel && (
                    <span className="rounded-full border border-warn-ink px-2.5 py-0.5 text-[11.5px] font-bold text-warn-ink">
                      {markLabel}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-[13.5px] text-sub">解き方の行は、ありません。</p>
        )}

        <div className={`mt-3 rounded-xl px-3 py-2.5 text-[14px] leading-relaxed ${tone.box}`} role="status">
          <p className="font-bold">
            <span aria-hidden="true" className="mr-1.5">
              {tone.icon}
            </span>
            {summary.headline}
          </p>
          {summary.details.map((d) => (
            <p key={d}>{d}</p>
          ))}
          {summary.hint && <p className="mt-1 text-[13px]">{summary.hint}</p>}
        </div>

        {summary.offerTeach && onTeach && (
          <button
            type="button"
            onClick={onTeach}
            className="mt-3 h-11 rounded-2xl bg-primary px-5 text-[14.5px] font-bold text-white hover:bg-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            教えるモードで説明する
          </button>
        )}
      </div>
    </div>
  );
}
