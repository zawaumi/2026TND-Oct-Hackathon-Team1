"use client";

import { forwardRef } from "react";
import { PeerAvatar } from "@/components/PeerAvatar";
import type { ExerciseAttempt, PeerResponse } from "@/lib/api/client";
import { ProblemBubble, SolutionCard } from "./ExerciseItems";

export type ChatItem =
  | { kind: "peer"; key: string; text: string; action?: PeerResponse["action"] }
  | { kind: "user"; key: string; text: string; requestId: string; state: "sending" | "sent" | "failed" }
  | { kind: "notice"; key: string; text: string }
  | { kind: "mastery"; key: string; text: string }
  /** 「問題を出す」で出した問題（latex は形式チェックを通った式。文字として出す） */
  | { kind: "problem"; key: string; latex: string; note?: string }
  /** ぴあ友の解答。remaining は「習得まであと〇問」（分からないときは null） */
  | { kind: "solution"; key: string; attempt: ExerciseAttempt; remaining: number | null };

/** 質問の種類の札（docs/04 の 5.3）。札を付けない action は載せない */
const ACTION_LABEL: Partial<Record<PeerResponse["action"], string>> = {
  ask_why: "理由をたずねる質問",
  request_example: "例をたずねる質問",
  check_prerequisite: "前提をたずねる質問",
  contrast_cases: "比べる質問",
};

function SmallAvatar() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-soft">
      <PeerAvatar state="idle" size={44} decorative />
    </span>
  );
}

export const ChatLog = forwardRef<
  HTMLDivElement,
  {
    items: ChatItem[];
    thinking: boolean;
    onRetry: (requestId: string) => void;
    retryDisabled: boolean;
    onScroll: () => void;
    /** 解答で「教えるモードで説明する」が押された */
    onTeach?: () => void;
  }
>(function ChatLog({ items, thinking, onRetry, retryDisabled, onScroll, onTeach }, ref) {
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 lg:px-5 lg:py-2"
    >
      <ol className="flex flex-col gap-3.5" role="log" aria-live="polite" aria-label="会話">
        {items.map((item) => {
          switch (item.kind) {
            case "peer": {
              const chip = item.action ? ACTION_LABEL[item.action] : undefined;
              return (
                <li key={item.key} className="flex items-start gap-2.5 pr-8 lg:pr-24">
                  <SmallAvatar />
                  <div className="min-w-0">
                    <span className="sr-only">ぴあ友：</span>
                    <p className="rounded-[18px] bg-soft px-4 py-3 text-[15px] leading-[1.7] whitespace-pre-wrap lg:px-4.5">
                      {item.text}
                    </p>
                    {chip && (
                      <span className="mt-1.5 inline-block rounded-full bg-warn-bg px-2.5 py-0.5 text-[11.5px] font-bold text-warn-ink">
                        {chip}
                      </span>
                    )}
                  </div>
                </li>
              );
            }
            case "user":
              return (
                <li key={item.key} className="flex flex-col items-end pl-12 lg:pl-32">
                  <span className="sr-only">あなた：</span>
                  <p
                    className={`max-w-full rounded-[18px] bg-[#3359D9] px-4 py-3 text-[15px] leading-[1.7] whitespace-pre-wrap text-white lg:px-4.5 ${
                      item.state === "sending" ? "opacity-80" : ""
                    }`}
                  >
                    {item.text}
                  </p>
                  {item.state === "failed" && (
                    <div className="mt-1.5 flex items-center gap-2 text-[12.5px] text-danger" role="alert">
                      送れませんでした
                      <button
                        type="button"
                        disabled={retryDisabled}
                        onClick={() => onRetry(item.requestId)}
                        className="rounded-full border border-danger/40 bg-card px-3 py-1 font-bold text-danger disabled:opacity-50"
                      >
                        もう一度送る
                      </button>
                    </div>
                  )}
                </li>
              );
            case "problem":
              return (
                <li key={item.key} className="flex flex-col items-end pl-12 lg:pl-32">
                  <ProblemBubble latex={item.latex} note={item.note} />
                </li>
              );
            case "solution":
              return (
                <li key={item.key} className="flex items-start gap-2.5 pr-3 lg:pr-16">
                  <SmallAvatar />
                  <SolutionCard attempt={item.attempt} remaining={item.remaining} onTeach={onTeach} />
                </li>
              );
            case "notice":
              return (
                <li key={item.key} className="flex justify-center">
                  <span className="rounded-full bg-[#E4EAFD] px-3.5 py-1 text-[12.5px] font-bold text-link">{item.text}</span>
                </li>
              );
            case "mastery":
              return (
                <li key={item.key}>
                  <p className="rounded-2xl border border-[#F6C343]/60 bg-[#FFF6D9] px-4 py-3 text-center text-[15px] font-bold text-[#6B4A00]">
                    🎉 {item.text}
                  </p>
                </li>
              );
          }
        })}
        {thinking && (
          <li className="flex items-start gap-2.5" aria-label="ぴあ友が考えています">
            <SmallAvatar />
            <p className="flex items-center gap-1 rounded-[18px] bg-soft px-4 py-4" aria-hidden="true">
              <span className="size-2 animate-bounce rounded-full bg-[#9DB4F2] [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-[#9DB4F2] [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-[#9DB4F2]" />
            </p>
          </li>
        )}
      </ol>
    </div>
  );
});
