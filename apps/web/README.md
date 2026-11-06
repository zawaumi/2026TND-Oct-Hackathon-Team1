# ぴあとも Web（apps/web）

Next.js + TypeScript + Tailwind CSS。静的出力（`output: "export"`）で `out/` に書き出し、Firebase Hosting で配信する。

## 必要なもの
- Node.js 20 以上（開発時は v26 で確認）

## セットアップと確認
```bash
cd apps/web
npm ci              # 依存の導入（package-lock.json どおり）
npm run dev         # 開発サーバー http://localhost:3000
npm run lint        # ESLint
npm run typecheck   # 型チェック（tsc --noEmit）
npm run build       # 静的ビルド → out/ が生成される
```

## 注意
- 静的出力のため、SSR・Server Actions・動的ルート（`/study/[id]` など）は使わない。
  画面は `/study/?session=...` のようにクエリで値を受け取る。
- `next start` は使わない（静的出力では動かない）。
- 秘密情報（APIキーなど）をこのアプリに置かない。