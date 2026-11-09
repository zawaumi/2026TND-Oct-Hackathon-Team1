import type { Metadata } from "next";
import { Suspense } from "react";
import { StudyRoom } from "@/components/study/StudyRoom";

export const metadata: Metadata = {
  title: "学習ルーム | ぴあとも",
};

/**
 * 学習ルーム（/study/?session=...）。docs/04 の 5。
 * 静的書き出しでは useSearchParams を使う部分を Suspense で包む必要がある。
 */
export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center" role="status">
          <p className="text-[15px] text-sub">授業を準備しています…</p>
        </div>
      }
    >
      <StudyRoom />
    </Suspense>
  );
}
