"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { OnboardingScreen } from "@/components/auth/OnboardingScreen";
import { HomeScreen } from "@/components/home/HomeScreen";
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
 * ホームの中身（ロゴ・ぴあ友・吹き出し・3つのボタン）は components/home/HomeScreen.tsx。
 */
export function HomeEntry() {
  const { user, expired, onboardingRequired, onboardingDone } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const wasExpired = params.get("expired") === "1";

  const signedIn = user != null && !expired;
  const uid = signedIn ? user.uid : null;

  // 登録済みか確かめる（GET /users/me/）。未登録なら API が 403 ONBOARDING_REQUIRED を返し、
  // client.ts が onboardingRequired を立てる。確認が済んだ人（uid）を覚える。
  // 通信などで確認できなかったときも、ホームは出す（取得に失敗してもボタンは使える、というホームの決まり）。
  // 本当に未登録なら、ホームや次の画面の API が 403 を返すので、そこで初回設定に移る。
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    api.getMe().then(
      () => {
        if (alive) setCheckedUid(uid);
      },
      (e: unknown) => {
        if (!alive || isOnboardingRequired(e) || isUnauthorized(e)) return; // どちらも別の処理が引き受ける
        setCheckedUid(uid); // 確認できなかった（通信の失敗など）。ホームは出す
      },
    );
    return () => {
      alive = false;
    };
  }, [uid]);

  const ready = signedIn && checkedUid === uid && !onboardingRequired;
  useEffect(() => {
    if (ready && next) router.replace(next);
  }, [ready, next, router]);

  if (user === undefined) return <Loading />;
  if (!signedIn) return <LoginScreen expired={expired || wasExpired} />;
  if (onboardingRequired) {
    return (
      <OnboardingScreen
        onDone={() => {
          setCheckedUid(uid); // 登録できた＝確認済み。次へ進む
          onboardingDone();
        }}
      />
    );
  }
  if (!ready || next) return <Loading />;

  return <HomeScreen />;
}
