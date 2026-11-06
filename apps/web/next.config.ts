import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静的なHTML/JSとして out/ に書き出す（Firebase Hostingで配信するため）
  output: "export",
  // /study/ → out/study/index.html の形で出力し、仕様書のURLに合わせる
  trailingSlash: true,
  // 静的出力では Next.js の画像最適化サーバーが使えないため無効にする
  images: { unoptimized: true },
  // Tailwind CSS を Turbopack で処理する設定（雛形に入っていたもの）
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;