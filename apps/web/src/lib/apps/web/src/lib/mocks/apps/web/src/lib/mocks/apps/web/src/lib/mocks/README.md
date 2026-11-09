フロント向けAPIモック（#6）
実APIなしで 教材選択 → セッション → 学習 → 知識 → レポート を開発するための固定レスポンス。
対象契約: `contracts/openapi.yaml` 1.1.0-draft。データはすべて架空。
```
src/lib/api.ts              画面から呼ぶ共通クライアント（型・エラー型・ApiClient）
src/lib/mocks/fixtures.ts   固定データ（ID: 教材1 / 概念101 / セッション1 / 問題201 / 挑戦301）
src/lib/mocks/mock-api.ts   method + pathname の照合、シナリオ、メモリ内状態
scripts/check-no-mock.mjs   本番成果物にモックが無いか検査
scripts/mock-smoke.ts       モックの単体確認（npx tsx scripts/mock-smoke.ts）
```
使い方（画面側）
```ts
import { api, isUnauthorized, isNotFound, isNetworkError } from "@/lib/api";

try {
  const r = await api.getEvaluation(sessionId);
  if (!r.ready) { /* 202: 「評価中…」を出し数秒後に取り直す */ }
  else r.data;                         // 200
} catch (e) {
  if (isUnauthorized(e)) {}            // 401 → ログイン画面へ
  else if (isNotFound(e)) {}           // 404
  else if (isNetworkError(e)) {}       // 通信例外（HTTPレスポンスなし）→「通信できませんでした」+「もう一度」
}
```
実API・モックは同じ `api.ts` を通る（差し替わるのは `fetch` だけ）ので、戻り型・エラー型は同じ。
`ApiError`（HTTPレスポンスあり: status/code/message）と `NetworkError`（レスポンスなし）は別クラス。
202 は例外にせず `{ ready:false, pending }`（`sendMessage` / `getEvaluation`）。`finishSession` は常に 202 の本文を返す。
認証: `setAuthTokenProvider(() => user.getIdToken())` を #10 で接続。モックは Bearer を見ない。
モックの有効化
開発用 `apps/web/.env.local`（コミットしない）:
```
NEXT_PUBLIC_API_MOCK=true
```
`npm run dev` を再起動すれば有効。`NEXT_PUBLIC_*` はビルド時に埋め込まれるため、変更後は再起動が必要。
秘密情報を `NEXT_PUBLIC_*` に入れない。
本番で有効にならない仕組み
`api.ts` は `process.env.NEXT_PUBLIC_API_MOCK === "true"` の直接比較でモックを動的 import する。
未設定／false の build では分岐ごと消え、`mocks/` は成果物に入らない。
`NODE_ENV=production` でモックが有効だと `api.ts` が起動時に throw し、build が失敗する。
公開先を分けたステージングでどうしても本番モードの build が要る場合のみ
`NEXT_PUBLIC_MOCK_BUILD_ACK=staging-only` を併せて指定する（本番ホスティングには配備しない）。
CI で build 後に検査する（`web-ci.yml` の `npm run build` の次に追加）:
```yaml
      - name: モックが成果物に混入していないこと
        working-directory: apps/web
        run: node scripts/check-no-mock.mjs out
```
`check-no-mock.mjs` は `NEXT_PUBLIC_API_MOCK=true` の設定と、`out/` 内のモック識別文字列の両方を検査する。
`package.json` には `"check:no-mock": "node scripts/check-no-mock.mjs out"` を足してよい。
シナリオの切替
次のどれでも指定できる（優先順: URL → sessionStorage → コード）。
URL で指定すると sessionStorage に保存され、ページ遷移後も続く。`?mock=normal` で戻す。
URL: `/study/?session=1&mock=pending`
コード（開発用パネルなど）: `setMockScenario("pending")` / `setMockAttemptMode("blocked")`
解答の結果だけ: `?mock_attempt=correct|duplicate_form|blocked|auto`
シナリオ	動作
`normal`	下表「通常時」のとおり
`emptyLessons`	`GET /lessons/` → 200 `{"results":[]}`（`/lessons/{id}/` は 404）
`unauthorized`	`/health/` 以外すべて 401 `{"code":"UNAUTHORIZED","message":"ログインしてください。"}`
`notFound`	`/sessions/{id}/…` すべて 404 `{"code":"NOT_FOUND","message":"セッションが見つかりません。"}`
`pending`	`POST …/messages/` → 202 `{"status":"processing","request_id":<受信値>}`、`GET …/evaluation/` → 202 `{"status":"evaluation_pending"}`（ずっと）
`networkError`	全リクエストで `TypeError` を投げる（HTTPレスポンスなし → `NetworkError`）
通常時（`normal`）の応答
操作	ステータス	備考
`GET /lessons/`	200	`?grade=` で絞り込み
`GET /lessons/{id}/`	200 / 404	
`GET /peers/me/`	200	
`GET /peers/me/knowledge/`	200	正解1問で `verified_correct` が 1 になる（必要数 2 には届かない。MASTERED にしない）
`GET /knowledge-graph/`	200	`?lesson_id=` は 1 のみ。他は 404
`GET /sessions/?limit=`	200	固定の最近の授業
`POST /sessions/`	201	下記
`GET /sessions/{id}/`	200 / 404	id 1 以外は 404（他人のセッション扱い）
`POST /sessions/{id}/messages/`	200	受信した `request_id` を返す。同一 ID 再送は同じ結果、本文違いは 409
`POST /sessions/{id}/exercises/`	201	下記
`POST /exercises/201/attempt/`	200	下記
`POST /sessions/{id}/finish/`	202	
`GET /sessions/{id}/evaluation/`	202 → 200	finish 後に 2 回 202、3 回目から 200（ポーリング確認用）。finish せず開けば 200
`POST /onboarding/complete/`	201 → 200	1回目 201、再送は 200（同じ Profile）
`GET /users/me/`	200 / 404	登録前は 404（GET で自動作成しない）
未知のパス・メソッド	501	`MOCK_NOT_IMPLEMENTED`。コンソールにも出る
セッション作成と複数小単元
`mode` は `preset` のみ。`lesson_ids` は空・重複・モックにない ID なら 400 `VALIDATION_ERROR`（黙って成功させない）。
教材は 1 件だけなので、実質 `[1]`。受信した配列はメモリ内セッションに保持し、後続の `GET /sessions/{id}/` も同じ配列を返す。
複数選択の画面を試すには `fixtures.ts` の `lessons` と `KNOWN_LESSON_IDS` に教材を足す。
リロード後の保持は保証しない（メモリ内のみ）。
出題と挑戦
出題 `latex`: 一次方程式（文字1つ）なら 201 `id:201 VERIFIED`。`=` がない／`^`・`\sqrt`／文字が2種類以上なら 201 `id:202 UNSUPPORTED`。ID は固定。
挑戦（`auto`）: 直近の出題に `\cdot` `\times` `\frac` `/` があれば `blocked`（`blocked_skill:"両辺に同じ数をかける"`）。
それ以外は 1 回目 `correct`（301）、2 回目以降 `correct` + `reason:"duplicate_form"`（302）。いずれも `knowledge_changes:[]`。
`id:202` への挑戦は 409 `EXERCISE_UNSUPPORTED`。
確認の手順
`NEXT_PUBLIC_API_MOCK=true npm run dev`
教材選択 → セッション作成 → 学習（教える／問題を出す）→ 知識マップ → レポート を順に操作
`?mock=emptyLessons` / `unauthorized` / `notFound` / `pending` / `networkError` で各画面の表示とリトライを確認
`npx tsx scripts/mock-smoke.ts`（`SMOKE_OK`）、`npm run typecheck`
`npm run build`（`NEXT_PUBLIC_API_MOCK` なし）→ `node scripts/check-no-mock.mjs out`
注意
固定値を変えても実APIには何も保存されない。
フィールド名・enum は `contracts/openapi.yaml` 1.1.0-draft との照合が必要（PR に結果を記録）。
仕様書に無く仮置きした箇所: 評価 `status` の `COMPLETE`、`SendMessageRequest.message`、
エラーコード `VALIDATION_ERROR` / `REQUEST_ID_CONFLICT` / `EXERCISE_UNSUPPORTED`、`GET /users/me/` 登録前の 404。
