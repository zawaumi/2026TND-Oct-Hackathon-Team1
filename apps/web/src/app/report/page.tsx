import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportView } from "@/components/report/ReportView";

export const metadata: Metadata = {
  title: "学習レポート | ぴあとも",
};

/**
 * 学習レポート（/report/?session=...）。docs/04 の 7。
 * 静的書き出しでは useSearchParams を使う部分を Suspense で包む必要がある。
 */
export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center" role="status">
          <p className="text-[15px] text-sub">読み込み中…</p>
        </div>
      }
    >
      <ReportView />
    </Suspense>
  );
}
