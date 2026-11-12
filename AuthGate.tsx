"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";

/**
 * ログインしていないと使えない画面を守る。
 * ホーム（/）はログイン画面を兼ねる（docs/04 の 2）ので、そこだけは通す。
 * それ以外の画面でログインしていない・ログインが切れた（401）・初回設定がまだ（403 ONBOARDING_REQUIRED）
 * のときは、ホームへ移り、ログインや初回設定のあとに元の画面へ戻れるよう ?next= を付ける（docs/04 の 9・10）。
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, expired, onboardingRequired } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const blocked = !isHome && (user === null || expired || onboardingRequired);

  useEffect(() => {
    if (!blocked) return;
    const here = window.location.pathname + window.location.search;
    router.replace(`/?next=${encodeURIComponent(here)}${expired ? "&expired=1" : ""}`);
  }, [blocked, expired, router]);

  if (isHome) return <>{children}</>;
  if (user === undefined || blocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <p className="text-[15px] text-sub">読み込み中…</p>
      </div>
    );
  }
  return <>{children}</>;
}
