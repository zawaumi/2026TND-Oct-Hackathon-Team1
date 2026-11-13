"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HomePeer } from "@/components/home/HomePeer";
import { RecentBubble } from "@/components/home/RecentBubble";
import { Logo } from "@/components/Logo";
import { api, isUnauthorized } from "@/lib/api/client";
import { loadRecent, type RecentState } from "@/lib/home";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";

/**
 * ホームの中身（docs/04 の 3、ADR-030・ADR-038）。ロゴ・ぴあ友・吹き出し（PCのみ）・3つのボタンだけ。
 * ナビバー・タブバーは出さない。ぴあ友の成長・最近の授業・次のおすすめ・前回の続きからは置かない。
 * 前回の授業の取得に失敗しても、ボタンは使える。ログインが切れた（401）ときは、client.ts がログイン画面へ戻す。
 */
export function HomeScreen() {
  const [recent, setRecent] = useState<RecentState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadRecent(api).then(
      (r) => {
        if (alive) setRecent(r);
      },
      (e: unknown) => {
        if (!alive || isUnauthorized(e)) return; // 401 は、ログイン画面への切り替えに任せる
        setRecent({ kind: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  return (
    <main className="flex min-h-dvh flex-col items-center px-5 pt-10 pb-12 lg:justify-center lg:py-10">
      <div className="flex w-full max-w-[1000px] flex-col items-center">
        <h1 className="sr-only">ぴあとも ホーム</h1>
        <Logo className="h-12 lg:h-[72px]" />
        <p className="mt-2 text-[15px] font-bold text-sub lg:text-[20px]">AIに教える学習アプリ</p>

        <div className="mt-8 grid w-full items-center gap-8 lg:mt-12 lg:grid-cols-[1fr_auto_1fr] lg:gap-14">
          {/* 吹き出し：PCのみ。スマホには出さない（docs/04 の 3.2） */}
          <div className="hidden lg:block">
            <RecentBubble
              state={recent}
              onRetry={() => {
                setRecent({ kind: "loading" });
                setAttempt((n) => n + 1);
              }}
            />
          </div>

          <div className="flex justify-center">
            <HomePeer />
          </div>

          <nav aria-label="メニュー" className="mx-auto flex w-full max-w-[420px] flex-col gap-3 lg:max-w-[320px]">
            <Link
              href="/lessons/"
              className={`flex h-16 items-center justify-center rounded-[20px] bg-primary text-[20px] font-bold text-white shadow-[0_3px_10px_rgba(70,119,230,0.35)] transition-colors hover:bg-link lg:h-20 lg:text-[22px] ${FOCUS}`}
            >
              学習内容を選ぶ
            </Link>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Link
                href="/knowledge/"
                className={`flex h-14 items-center justify-center rounded-[20px] border-[1.5px] border-outline bg-card text-[17px] font-bold text-link transition-colors hover:bg-soft ${FOCUS}`}
              >
                知識マップ
              </Link>
              <Link
                href="/settings/"
                className={`flex h-14 items-center justify-center rounded-[20px] border-[1.5px] border-outline bg-card text-[17px] font-bold text-link transition-colors hover:bg-soft ${FOCUS}`}
              >
                設定
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}
