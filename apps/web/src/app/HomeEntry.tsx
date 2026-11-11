"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { Logo } from "@/components/Logo";
import { safeNext, useAuth } from "@/lib/auth/AuthProvider";

/**
 * ホーム（/）。ログインしていなければログイン画面を出す（docs/04 の 2・9）。
 * ログインのあとは、?next= があれば元の画面へ戻る。
 * ホームの中身（チームのデザイン、ADR-038）は #44 で作る。ここは仮の画面。
 */
export function HomeEntry() {
  const { user, signOut, expired } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const wasExpired = params.get("expired") === "1";

  const signedIn = user != null && !expired;
  useEffect(() => {
    if (signedIn && next) router.replace(next);
  }, [signedIn, next, router]);

  if (user === undefined || (signedIn && next)) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <p className="text-[15px] text-sub">読み込み中…</p>
      </div>
    );
  }
  if (!signedIn) return <LoginScreen expired={expired || wasExpired} />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo className="h-10" />
      <p className="text-[16px]">{user.displayName ? `${user.displayName}さん、ようこそ` : "ようこそ"}</p>
      <p className="text-[13px] text-sub">（ホームの画面は #44 で作ります）</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/lessons/" className="rounded-2xl bg-primary px-6 py-3 text-center font-bold text-white">
          学習内容を選ぶ
        </Link>
        <button type="button" onClick={() => void signOut()} className="rounded-2xl border-[1.5px] border-outline bg-card px-6 py-3 font-bold text-link">
          ログアウト
        </button>
      </div>
    </main>
  );
}
