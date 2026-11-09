import type { Metadata } from "next";
import { Suspense } from "react";
import { LessonPicker } from "@/components/lessons/LessonPicker";

export const metadata: Metadata = {
  title: "学習内容を選ぶ | ぴあとも",
};

/**
 * 学習内容選択（/lessons/、/lessons/?select=<lesson_id>）。docs/04 の 4。
 * 静的書き出しでは useSearchParams を使う部分を Suspense で包む必要がある。
 */
export default function LessonsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center" role="status">
          <p className="text-[15px] text-sub">読み込み中…</p>
        </div>
      }
    >
      <LessonPicker />
    </Suspense>
  );
}
