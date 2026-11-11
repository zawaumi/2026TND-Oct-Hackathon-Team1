"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { PeerAvatar } from "@/components/PeerAvatar";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Firebase のエラーを、利用者に分かる言葉にする */
function messageFor(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null; // 自分で閉じた
  if (code === "auth/popup-blocked") return "ログインの画面が開けませんでした。ブラウザのポップアップの許可を確かめて、もう一度押してください。";
  if (code === "auth/network-request-failed") return "通信できませんでした。インターネットの接続を確かめて、もう一度押してください。";
  if (code === "auth/unauthorized-domain") return "このURLからはログインできません。管理者に連絡してください（Firebase の承認済みドメイン）。";
  return "ログインできませんでした。もう一度押してください。";
}

/** ログイン画面（docs/04 の 9、デザイン 00a_login・m00a_login）。Google アカウントだけ（ADR-016） */
export function LoginScreen({ expired = false }: { expired?: boolean }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-14 pb-10 lg:pt-16">
      <div className="flex w-full max-w-[480px] flex-col items-center text-center">
        <h1 className="sr-only">ぴあとも ログイン</h1>
        <Logo className="h-9 lg:h-8" />
        <div className="mt-6 flex size-[150px] items-center justify-center rounded-[28px] bg-gradient-to-b from-[#F3F6FE] to-[#DCE6FB]">
          <PeerAvatar state="idle" size={140} decorative />
        </div>
        <p className="mt-7 text-[26px] leading-snug font-black">
          教えて、わかる。
          <br />
          ぴあ友の先生になろう
        </p>
        <p className="mt-3 text-[14.5px] leading-relaxed text-sub">
          同い年のAI「ぴあ友」に勉強を教えて、
          <br />
          自分の理解を深める学習アプリです。
        </p>

        <section className="mt-7 w-full rounded-card border border-line bg-card p-5 text-left">
          {expired && (
            <p className="mb-3 rounded-xl bg-soft px-3 py-2 text-[13.5px] text-ink" role="status">
              ログインの期限が切れました。もう一度ログインしてください。
            </p>
          )}
          <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-outline bg-card text-[17px] font-bold text-ink shadow-[0_2px_6px_rgba(40,60,140,0.08)] transition-colors hover:bg-soft disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="size-5 text-link" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            </svg>
            {busy ? "ログインしています…" : "Googleでログイン"}
          </button>
          {error && (
            <p className="mt-3 rounded-xl bg-[#FDECEC] px-3 py-2 text-[13.5px] text-danger" role="alert">
              {error}
            </p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-sub">
            ログインはGoogleアカウントだけです。氏名・学校名・生年月日は登録しません。
          </p>
        </section>
      </div>
    </main>
  );
}
