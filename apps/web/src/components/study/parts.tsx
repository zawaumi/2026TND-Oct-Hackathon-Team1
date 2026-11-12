"use client";

import { useEffect, useRef, useState } from "react";
import { KnowledgeState, STATUS_LABEL, type KnowledgeStatus } from "@/components/KnowledgeState";
import { EMOTION_LABEL, PeerAvatar, type PeerEmotion } from "@/components/PeerAvatar";

export type ConceptView = {
  id: number;
  label: string;
  status: KnowledgeStatus;
  verified: number;
  required: number;
};

export type Mode = "teach" | "exercise";

/** 状態の一言。mastery_success のときは概念名を入れる（docs/04 の 5.5） */
export function emotionText(emotion: PeerEmotion, masteredLabel?: string | null) {
  if (emotion === "mastery_success" && masteredLabel) return `「${masteredLabel}」を習得しました！`;
  return EMOTION_LABEL[emotion];
}

/* ───────── アイコン ───────── */

export function ChatIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 4c4.6 0 8 3 8 7s-3.4 7-8 7c-1 0-2-.1-2.9-.4L5 19l1.2-3.3C4.8 14.4 4 12.8 4 11c0-4 3.4-7 8-7z" />
    </svg>
  );
}

export function ExerciseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 3v6M3 6h6M15 6h6M4 15l4 4M8 15l-4 4M15 16h6M15 20h6" />
    </svg>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ChevronIcon({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function BackIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

/* ───────── 理解度 ───────── */

export function UnderstandingBar({ percent, compact = false }: { percent: number | null; compact?: boolean }) {
  const value = percent ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={`font-bold ${compact ? "text-[14px]" : "text-[15px]"}`}>ぴあ友の理解度</span>
        <span className={`font-bold text-link ${compact ? "text-[17px]" : "text-[18px]"}`}>
          {percent == null ? "—" : `${percent}%`}
        </span>
      </div>
      <div
        className="mt-2.5 h-3 overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-label="ぴあ友の理解度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ───────── 習得状況 ───────── */

function remaining(c: ConceptView) {
  return Math.max(c.required - c.verified, 0);
}

export function ConceptRows({ concepts, currentId }: { concepts: ConceptView[]; currentId: number | null }) {
  return (
    <ul className="flex flex-col gap-1">
      {concepts.map((c) => {
        const current = c.id === currentId;
        return (
          <li
            key={c.id}
            className={`rounded-xl px-2.5 py-2.5 ${current ? "bg-[#EDF1FE]" : ""}`}
            aria-current={current ? "step" : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`truncate text-[14.5px] ${current ? "font-bold" : ""}`}>{c.label}</span>
                {current && (
                  <span className="shrink-0 rounded-full bg-[#DDE5FC] px-2.5 py-0.5 text-[11.5px] font-bold text-link">
                    いま教えている
                  </span>
                )}
              </span>
              <KnowledgeState status={c.status} />
            </div>
            {current && c.status !== "MASTERED" && c.required > 0 && (
              <p className="mt-1 text-[12.5px] text-sub">習得まであと{remaining(c)}問</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** PC：左列の3つ目のカード（折りたためる） */
export function ConceptCard({ concepts, currentId }: { concepts: ConceptView[]; currentId: number | null }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-card bg-card px-5 pt-4 pb-3">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg py-1 text-left"
        aria-expanded={open}
        aria-controls="concept-list-pc"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-[15px] font-bold">ぴあ友の習得状況</h2>
        <ChevronIcon open={open} className="size-5 text-sub" />
      </button>
      <div id="concept-list-pc" hidden={!open} className="mt-2">
        <ConceptRows concepts={concepts} currentId={currentId} />
      </div>
    </section>
  );
}

/** スマホ：上のカードの下の折りたたみ */
export function ConceptFold({ concepts, currentId }: { concepts: ConceptView[]; currentId: number | null }) {
  const [open, setOpen] = useState(false);
  const mastered = concepts.filter((c) => c.status === "MASTERED").length;
  const current = concepts.find((c) => c.id === currentId);
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        aria-controls="concept-list-sp"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[14px] font-bold whitespace-nowrap">
          ぴあ友の習得状況 {mastered} / {concepts.length}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {current && (
            <>
              <KnowledgeState status={current.status} />
              <span className="truncate text-[12.5px] text-sub">{current.label}</span>
            </>
          )}
          <ChevronIcon open={open} className="size-4.5 shrink-0 text-sub" />
        </span>
      </button>
      <div id="concept-list-sp" hidden={!open} className="mt-2">
        <ConceptRows concepts={concepts} currentId={currentId} />
      </div>
    </div>
  );
}

/* ───────── 教える／問題を出す ───────── */

export function ModeTabs({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  const item = (m: Mode, label: string, Icon: typeof ChatIcon) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      disabled={disabled}
      onClick={() => onChange(m)}
      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[14.5px] font-bold transition-colors disabled:opacity-60 ${
        mode === m ? "bg-card text-link shadow-[0_1px_3px_rgba(40,60,140,0.15)]" : "text-sub hover:text-ink"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="入力の切り替え" className="flex rounded-2xl border border-line bg-[#EEF1FB] p-1">
      {item("teach", "教える", ChatIcon)}
      {item("exercise", "問題を出す", ExerciseIcon)}
    </div>
  );
}

export function ModeButtons({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  const item = (m: Mode, label: string, Icon: typeof ChatIcon) => (
    <button
      type="button"
      aria-pressed={mode === m}
      disabled={disabled}
      onClick={() => onChange(m)}
      className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold transition-colors disabled:opacity-60 ${
        mode === m ? "bg-primary text-white" : "border-[1.5px] border-primary bg-card text-link"
      }`}
    >
      <Icon className="size-5" />
      {label}
    </button>
  );
  return (
    <div className="flex gap-2.5" role="group" aria-label="入力の切り替え">
      {item("teach", "教える", ChatIcon)}
      {item("exercise", "問題を出す", ExerciseIcon)}
    </div>
  );
}

/* ───────── 入力欄（教える） ───────── */

export const MAX_MESSAGE_LENGTH = 1000;

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && value.trim().length > 0;

  // 入力に合わせて高さを伸ばす（最大4行ほど）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <label htmlFor="teach-input" className="sr-only">
        ぴあ友への説明
      </label>
      <textarea
        id="teach-input"
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_MESSAGE_LENGTH}
        disabled={disabled}
        placeholder="ぴあ友に説明してみよう"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // 変換中の Enter は送らない。Shift+Enter は改行
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        className="min-h-12 flex-1 resize-none rounded-2xl border border-[#CDD3EA] bg-card px-4 py-3 text-[15px] leading-6 placeholder:text-[#8A8DA6] focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-[#F6F7FC] lg:min-h-13 lg:py-3.5"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="送信"
        className="flex size-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-white shadow-[0_4px_12px_rgba(70,119,230,0.35)] transition-opacity disabled:opacity-45 disabled:shadow-none lg:h-13 lg:w-auto lg:px-6 lg:text-[17px]"
      >
        <span className="hidden lg:inline">送信</span>
        <ArrowIcon className="size-5" />
      </button>
    </form>
  );
}

/* ───────── ぴあ友のカード ───────── */

/** PC：左列の上のカード */
export function PeerCard({
  emotion,
  masteredLabel,
  eventKey,
}: {
  emotion: PeerEmotion;
  masteredLabel: string | null;
  /** 習得の確定イベントの識別子。変わったときだけ、習得の演出をもう一度再生する */
  eventKey?: string | null;
}) {
  return (
    <section className="flex flex-col items-center rounded-card bg-card px-5 pt-4 pb-4" aria-label="ぴあ友">
      <PeerAvatar state={emotion} size={190} decorative eventKey={eventKey} />
      <p className="mt-1 text-center text-[15px] font-bold" aria-live="polite">
        {emotionText(emotion, masteredLabel)}
      </p>
    </section>
  );
}

/** スマホ：上のカード（アバター＋吹き出し、理解度、習得状況） */
export function PeerSummaryMobile({
  emotion,
  masteredLabel,
  eventKey,
  percent,
  concepts,
  currentId,
}: {
  emotion: PeerEmotion;
  masteredLabel: string | null;
  eventKey?: string | null;
  percent: number | null;
  concepts: ConceptView[];
  currentId: number | null;
}) {
  return (
    <section className="rounded-card bg-card px-4 pt-3 pb-3 shadow-[0_2px_10px_rgba(60,80,170,0.06)]" aria-label="ぴあ友">
      <div className="flex items-center gap-3">
        <PeerAvatar state={emotion} size={72} decorative className="shrink-0" eventKey={eventKey} />
        <p
          className="relative flex-1 rounded-2xl bg-soft px-4 py-2.5 text-center text-[15px] font-bold"
          aria-live="polite"
        >
          {emotionText(emotion, masteredLabel)}
        </p>
      </div>
      <div className="mt-1.5">
        <UnderstandingBar percent={percent} compact />
      </div>
      <ConceptFold concepts={concepts} currentId={currentId} />
    </section>
  );
}

export { STATUS_LABEL };
