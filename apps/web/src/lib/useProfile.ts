"use client";

import { useEffect, useState } from "react";
import { api, type Profile } from "@/lib/api/client";

// 同じページで何度も GET /users/me/ を呼ばないように、取得中・取得済みの結果を共有する
let cached: Promise<Profile> | null = null;

export function loadProfile(): Promise<Profile> {
  if (!cached) {
    cached = api.getMe().catch((e) => {
      cached = null; // 失敗したら次に呼んだときに取り直す
      throw e;
    });
  }
  return cached;
}

/** プロフィールを読む。読み込み中は profile が null */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    loadProfile().then(
      (p) => alive && setProfile(p),
      (e) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { profile, error };
}
