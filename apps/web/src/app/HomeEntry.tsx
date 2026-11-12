"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { OnboardingScreen } from "@/components/auth/OnboardingScreen";
import { Logo } from "@/components/Logo";
import { api, isOnboardingRequired, isUnauthorized } from "@/lib/api/client";
import { safeNext, useAuth } from "@/lib/auth/AuthProvider";

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <p className="text-[15px] text-sub">読み込み中…</p>
    </div>
  );
}

/**
 * ホーム（/）。docs/04 の 2・9。
 * - ログインしていなければログイン画面
 * - ログインしていて初回設定がまだ（API が 403 ONBOARDING_REQUIRED）なら初回設定の画面
 * - それ以外はホーム
 * ログインや初回設定のあとは、?next= があれば元の画面へ戻る。
 * ホームの中身（チームのデザイン、ADR-038）は #44 で作る。ここは仮の画面。
 */
export function HomeEntry() {
  const { user, signOut, expired, onboardingRequired, onboardingDone } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const wasExpired = params.get("expired") === "1";

  const signedIn = user != null && !expired;
  const uid = signedIn ? user.uid : null;

  // 登録済みか確かめる（GET /users/me/）。未登録なら API が 403 ONBOARDING_REQUIRED を返し、
  // client.ts が onboardingRequired を立てる。確認が済んだ人（uid）と、失敗した人を覚える
  const [okUid, setOkUid] = useState<string | null>(null);
  const [failedUid, setFailedUid] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    api.getMe().then(
      () => {
        if (alive) setOkUid(uid);
      },
      (e: unknown) => {
        if (!alive || isOnboardingRequired(e) || isUnauthorized(e)) return; // どちらも別の処理が引き受ける
        setFailedUid(uid);
      },
    );
    return () => {
      alive = false;
    };
  }, [uid, attempt]);

  const ready = signedIn && okUid === uid && !onboardingRequired;
  useEffect(() => {
    if (ready && next) router.replace(next);
  }, [ready, next, router]);

  if (user === undefined) return <Loading />;
  if (!signedIn) return <LoginScreen expired={expired || wasExpired} />;
  if (onboardingRequired) {
    return (
      <OnboardingScreen
        onDone={() => {
          setOkUid(uid); // 登録できた＝確認済み。次へ進む
          onboardingDone();
        }}
      />
    );
  }
  if (failedUid === uid && okUid !== uid) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-[16px] font-bold">通信できませんでした</p>
        <button
          type="button"
          onClick={() => {
            setFailedUid(null);
            setAttempt((n) => n + 1);
          }}
          className="rounded-2xl bg-primary px-6 py-3 font-bold text-white"
        >
          もう一度
        </button>
      </main>
    );
  }
  if (!ready || next) return <Loading />;

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
