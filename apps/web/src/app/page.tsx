import { Suspense } from "react";
import { HomeEntry } from "./HomeEntry";

/** ホーム（/）。ログインしていなければログイン画面（docs/04 の 2・9） */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center" role="status">
          <p className="text-[15px] text-sub">読み込み中…</p>
        </div>
      }
    >
      <HomeEntry />
    </Suspense>
  );
}
