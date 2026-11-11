import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export default function config(phase: string): NextConfig {
  // 本番ビルドでモックを使わないときは、モック（src/lib/api/mock.ts）を空の部品に差し替えて、
  // 成果物に入らないようにする（scripts/check-no-mock.mjs がビルドのあとに確かめる）
  const stripMock = phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_API_MOCK !== "true";

  return {
    // 静的なHTML/JSとして out/ に書き出す（Firebase Hostingで配信するため）
    output: "export",
    // /study/ → out/study/index.html の形で出力し、仕様書のURLに合わせる
    trailingSlash: true,
    // 静的出力では Next.js の画像最適化サーバーが使えないため無効にする
    images: { unoptimized: true },
    turbopack: {
      // Tailwind CSS を Turbopack で処理する設定（雛形に入っていたもの）
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
      resolveAlias: stripMock ? { "@/lib/api/mock": "./src/lib/api/mock.disabled.ts" } : {},
    },
  };
}
