"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { setIdTokenProvider, setOnboardingRequiredHandler, setUnauthorizedHandler, usingMock } from "@/lib/api/client";
import { firebaseConfig } from "./firebase";

export type AuthUser = { uid: string; displayName: string | null };

type BaseAuthState = {
  /** 読み込み中は undefined、ログインしていなければ null */
  user: AuthUser | null | undefined;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 401 を受けてログイン画面へ戻されたとき true */
  expired: boolean;
};

type AuthState = BaseAuthState & {
  /** ログインはしているが初回設定がまだ（API が 403 ONBOARDING_REQUIRED を返した）とき true */
  onboardingRequired: boolean;
  /** 初回設定が済んだことを伝える */
  onboardingDone: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider の外で useAuth は使えません");
  return ctx;
}

/** ログインのあとに戻る先。同じサイトの中のパスだけを受け付ける */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/* ───────── モックのとき：Firebase を使わず、ログインした「ふり」をする ───────── */

const MOCK_KEY = "piatomo.mock.signedOut";
const MOCK_USER: AuthUser = { uid: "mock-user", displayName: "モックユーザー" };

function useMockAuth(): BaseAuthState {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setExpired(true);
      setUser(null);
    });
    // Firebase のときと同じく、ログインの状態は少しあとに分かる形にする
    void Promise.resolve().then(() => {
      let signedOut = false;
      try {
        signedOut = sessionStorage.getItem(MOCK_KEY) === "1";
      } catch {
        // 保存できない環境ではログイン済みとみなす
      }
      setUser(signedOut ? null : MOCK_USER);
    });
  }, []);
  const signIn = useCallback(async () => {
    try {
      sessionStorage.removeItem(MOCK_KEY);
    } catch {}
    setExpired(false);
    setUser(MOCK_USER);
  }, []);
  const signOut = useCallback(async () => {
    try {
      sessionStorage.setItem(MOCK_KEY, "1");
    } catch {}
    setUser(null);
  }, []);
  return { user, signIn, signOut, expired };
}

/* ───────── 本物：Firebase Authentication（Google） ───────── */

type FirebaseAuthModule = typeof import("firebase/auth");
type Ready = { auth: import("firebase/auth").Auth; mod: FirebaseAuthModule };

function useFirebaseAuth(): BaseAuthState {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [expired, setExpired] = useState(false);
  // 読み込みが済んだ Firebase。ログインのボタンを押したらすぐポップアップを開けるよう、先に用意しておく
  const ready = useRef<Ready | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    (async () => {
      // Firebase はブラウザでだけ読み込む（静的書き出しのビルド時には動かさない）
      const [{ initializeApp, getApps }, mod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      if (cancelled) return;
      const auth = mod.getAuth(getApps()[0] ?? initializeApp(firebaseConfig));
      auth.languageCode = "ja";
      ready.current = { auth, mod };
      setIdTokenProvider(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));
      setUnauthorizedHandler(() => setExpired(true));
      unsubscribe = mod.onIdTokenChanged(auth, (u) => {
        setUser(u ? { uid: u.uid, displayName: u.displayName } : null);
        if (u) setExpired(false);
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    const r = ready.current;
    if (!r) throw Object.assign(new Error("not ready"), { code: "app/not-ready" });
    const provider = new r.mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    // ボタンを押した流れのまま（await を挟まずに）開かないと、ポップアップがブロックされる
    await r.mod.signInWithPopup(r.auth, provider);
    setExpired(false);
  }, []);

  const signOut = useCallback(async () => {
    const r = ready.current;
    if (r) await r.mod.signOut(r.auth);
  }, []);

  return { user, signIn, signOut, expired };
}

/**
 * モックのときはログインした「ふり」をする。モックのままで本物の Google ログインを試したいときは
 * NEXT_PUBLIC_AUTH=firebase を付ける（.env.local）。
 */
const useAuthImpl = usingMock && process.env.NEXT_PUBLIC_AUTH !== "firebase" ? useMockAuth : useFirebaseAuth;

export function AuthProvider({ children }: { children: ReactNode }) {
  const base = useAuthImpl();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  useEffect(() => {
    setOnboardingRequiredHandler(() => setNeedsOnboarding(true));
  }, []);
  const baseSignOut = base.signOut;
  const signOut = useCallback(async () => {
    setNeedsOnboarding(false);
    await baseSignOut();
  }, [baseSignOut]);
  const onboardingDone = useCallback(() => setNeedsOnboarding(false), []);
  const state: AuthState = {
    ...base,
    signOut,
    onboardingRequired: base.user != null && needsOnboarding,
    onboardingDone,
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
