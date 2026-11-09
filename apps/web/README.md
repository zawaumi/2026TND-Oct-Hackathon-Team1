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
npm run gen:api     # contracts/openapi.yaml から API の型（src/lib/api/schema.d.ts）を作り直す
```

## APIとモック
- 画面は `src/lib/api/client.ts` の `api` を通して API を呼ぶ。
- `npm run dev` で `NEXT_PUBLIC_API_BASE_URL` を設定していないときは、**モック**（`src/lib/api/mock.ts`）が動く。
  本物の API ができるまで、画面はモックで作って確かめる。
- 本物の API につなぐときは、`apps/web/.env.local` に次を書く（このファイルはコミットしない）。
  ```
  NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
  ```
- 本番のビルドでは、`NEXT_PUBLIC_API_MOCK=true` を付けたときだけモックを使う。

### 学習ルーム（/study/?session=1）をモックで試す
送る文章に次の合図を入れると、エラーなどの動きを確かめられる。
| 合図 | 動き |
|---|---|
| `#202` | いったん「処理中」になり、少し待つと応答が届く |
| `#409` | 状態の競合。文章が入力欄に戻り、もう一度送るよう案内が出る |
| `#neterr` | 1回目だけ通信エラー。「もう一度送る」で同じ送信IDのまま再送する |
| `#mastered` | 「移項」が習得済みになる（帯とアバターの確認用） |

### 学習レポート（/report/?session=...）をモックで試す
- 開くと、はじめに「評価中…」が出て、少したつとレポートが出る。
- 学習ルームから「授業を終える」で来ると、その授業の会話（このタブのメモリだけにある）から「ぴあ友がつまずいたところ」が出る。直接開いたときや再読み込みしたあとは出ない。
- `?session=99`：3観点すべて評価保留。`?session=98`：評価できなかった。それ以外：分かりやすさだけ評価保留（74点）。

## 注意
- 静的出力のため、SSR・Server Actions・動的ルート（`/study/[id]` など）は使わない。
  画面は `/study/?session=...` のようにクエリで値を受け取る。
- `next start` は使わない（静的出力では動かない）。
- 秘密情報（APIキーなど）をこのアプリに置かない。
