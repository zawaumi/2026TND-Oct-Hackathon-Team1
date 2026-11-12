"use client";

import type { RecentState } from "@/lib/home";

/** 吹き出しの外枠。白・大きな角丸・しっぽ付き（docs/04 の 1.3）。しっぽは右（ぴあ友の方）へ向ける */
function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[180px] items-center justify-center rounded-[40px] bg-card px-8 py-7 text-center shadow-[0_2px_10px_rgba(40,60,140,0.10)]">
      {children}
      <span aria-hidden="true" className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rotate-45 rounded-[4px] bg-card" />
    </div>
  );
}

const BIG = "block text-[32px] leading-snug font-black break-words text-accent";
const SMALL = "block text-[18px] font-bold text-ink";

/**
 * ホームの吹き出し（PCのみ。スマホでは呼び出し側が隠す）。
 * 授業がある：「前回は最後に〈小単元名〉を学習したよ！」。ない：「はじめまして！何を教えてくれるの？」。
 * 取得中・失敗でも、ほかの表示（ボタン）は止めない。習得の状態は出さない。
 */
export function RecentBubble({ state, onRetry }: { state: RecentState; onRetry: () => void }) {
  if (state.kind === "loading") {
    return (
      <Bubble>
        <div role="status" className="w-full space-y-3">
          <span className="sr-only">前回の学習を読み込み中…</span>
          <div aria-hidden="true" className="mx-auto h-4 w-1/2 animate-pulse rounded-full bg-track" />
          <div aria-hidden="true" className="mx-auto h-8 w-4/5 animate-pulse rounded-full bg-track" />
          <div aria-hidden="true" className="mx-auto h-4 w-2/3 animate-pulse rounded-full bg-track" />
        </div>
      </Bubble>
    );
  }
  if (state.kind === "error") {
    return (
      <Bubble>
        <div role="alert" className="space-y-3">
          <p className="text-[16px] font-bold">前回の学習を読み込めませんでした。</p>
          <p className="text-[13.5px] text-sub">ボタンは、このまま使えます。</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-2xl border-[1.5px] border-outline bg-card px-5 py-2 text-[15px] font-bold text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            もう一度
          </button>
        </div>
      </Bubble>
    );
  }
  if (state.kind === "last") {
    return (
      <Bubble>
        <p>
          <span className={SMALL}>前回は最後に</span>
          <span className={`my-1.5 ${BIG}`}>{state.title}</span>
          <span className={SMALL}>を学習したよ！</span>
        </p>
      </Bubble>
    );
  }
  if (state.kind === "unknown") {
    // 小単元の名前が取れないとき（非公開になったなど）。前回の内容は言わない
    return (
      <Bubble>
        <p>
          <span className={SMALL}>おかえりなさい！</span>
          <span className={`mt-1.5 ${BIG}`}>何を教えてくれるの？</span>
        </p>
      </Bubble>
    );
  }
  return (
    <Bubble>
      <p>
        <span className={BIG}>はじめまして！</span>
        <span className={`mt-1.5 ${SMALL}`}>何を教えてくれるの？</span>
      </p>
    </Bubble>
  );
}
