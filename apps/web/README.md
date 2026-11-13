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
- 画面は `src/lib/api/client.ts` の `api` を通して API を呼ぶ。窓口はこの1つだけにする。
- 型は `contracts/openapi.yaml` から自動で作る（`npm run gen:api` → `src/lib/api/schema.d.ts`）。手で型を書かない。
- エラーは `ApiError`（`status` が 0 なら通信できなかった）。判定には `isUnauthorized`・`isNotFound`・`isNetworkError` を使う。
- `npm run dev` で `NEXT_PUBLIC_API_BASE_URL` を設定していないときは、**モック**（`src/lib/api/mock.ts`）が動く。
- 本物の API につなぐときは、`apps/web/.env.local` に次を書く（このファイルはコミットしない）。
  ```
  NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
  ```
- `npm run test:mock` でモックの動きを確かめられる（`scripts/mock-smoke.ts`）。

### 本番にモックを入れない仕組み
- 本番ビルド（`npm run build`）では、`next.config.ts` がモックを空の部品（`mock.disabled.ts`）に差し替える。
- ビルドのあとに `scripts/check-no-mock.mjs` が自動で動き（`postbuild`）、成果物にモックの目印（`__PIATOMO_API_MOCK__`）があれば失敗する。
- `NEXT_PUBLIC_API_MOCK=true` のまま本番ビルドすると失敗する。公開先を分けたステージングなど、どうしてもモック入りで本番モードのビルドが要るときだけ `NEXT_PUBLIC_MOCK_BUILD_ACK=staging-only` を付ける（本番には配備しない）。
- この仕組みと動作確認のテストは、Shioriさんの #82 から取り込んだ。

### シナリオでエラーの表示を試す
URL に `?mock=…` を付けると、画面全体の状態を切り替えられる。ページを移っても続き、`?mock=normal` で戻る。
| シナリオ | 動き |
|---|---|
| `normal` | ふつうの動き |
| `emptyLessons` | 教材が1つもない |
| `unauthorized` | すべて 401（ログインが切れた） |
| `notFound` | 授業まわりがすべて 404 |
| `pending` | 送信・解答・評価がずっと「処理中」のまま |
| `networkError` | すべて通信エラー |
| `noSessions` | 授業がまだ1つもない（ホームの吹き出しが「はじめまして！何を教えてくれるの？」になる） |
| `slowSessions` | 授業の一覧だけ3秒かかる（ホームの吹き出しの読み込み中の表示を確かめる） |
| `newUser` | 初回設定がまだの人。初回設定以外のAPIはすべて 403 `ONBOARDING_REQUIRED`。登録できたら ふつうに戻る（再読み込みでまた未登録から） |

ぴあ友の解答の結果だけを決めるときは `?mock_attempt=auto|correct|duplicate_form|blocked|unverified`。`auto` では、`\frac` を含む問題は「止まる（blocked）」、同じ形の問題の2回目は「回数に入らない（duplicate_form）」になる。

### 学習ルーム（/study/?session=1）をモックで試す
送る文章に次の合図を入れると、エラーなどの動きを確かめられる。
| 合図 | 動き |
|---|---|
| `#202` | いったん「処理中」になり、少し待つと応答が届く |
| `#409` | 状態の競合。文章が入力欄に戻り、もう一度送るよう案内が出る |
| `#neterr` | 1回目だけ通信エラー。「もう一度送る」で同じ送信IDのまま再送する |
| `#mastered` | 「移項」が習得済みになる（帯とアバターの確認用） |

### 「問題を出す」（/study/?session=1 で「問題を出す」を選ぶ）
- 数式は MathLive（`mathlive`）で入力する。ブラウザだけで動くため、**「問題を出す」を初めて開いたときに読み込む**（`src/components/study/MathInput.tsx`）。フォントは `public/mathlive/fonts` に置く。`npm run dev`・`npm run build` の前に、`scripts/copy-mathlive-assets.mjs` が自動でコピーする（コピーしたものは Git に入れない）。
- 画面のキーボードは出さない（会話が隠れるため）。記号のキー（x ＋ － × ÷ ＝ 分数 かっこ）は画面側で用意している。数式の入力欄が読み込めないとき、または「文字で入力する」を押したときは、ふつうの文字入力（例：`x+3=7`）に切り替わる。読み上げ用の言葉は、入力した式の下に出る。
- 送る前の形式チェックは `src/lib/mathInput.ts`。決まった記号以外（`\href` など）、空いている部分、かっこの数のずれ、長すぎる式は送らない。**一次方程式かどうかの判定はしない**（API が VERIFIED・PROVISIONAL・UNSUPPORTED を返す）。LaTeX は画面で評価せず、文字として出す。API が返す式（`steps[].expr`）も、文字に直して出すだけで、HTML にはしない。
- 流れ：式を入力 → 形式チェック → `POST /sessions/{id}/exercises/` → VERIFIED と PROVISIONAL は `POST /exercises/{id}/attempt/` で解答を取る（処理中の 202 は同じ `request_id` で取り直す）。UNSUPPORTED は理由と入力し直しの案内を出し、式は消さない。通信に失敗したら「もう一度」で、**同じ `request_id`** で再送する。送信中・解答待ちはボタンを押せなくし、ぴあ友を「考え中」にする。
- 結果の文言は `src/lib/exercise.ts`（docs/04 の 5.4）。`npm run test:math` で、形式チェックと文言を確かめられる。
- 対象の概念の初期値は「いま教えている概念」。選び直せる。
- モックで試す：`x+3=7`（対応）、`x^2=4`（UNSUPPORTED）、分数キーで `x/2=3`（止まる）。1回目の正解のあと、同じ形（`x+5=9`）は「前と同じ形」になる。`?mock=networkError` は授業ごと読み込めなくなるので、通信失敗は、授業を開いたあとに、開発者ツールのコンソールで `sessionStorage.setItem("piatomo.mock.scenario","networkError")` を実行して試す（`normal` で戻す）。

### ぴあ友のアバター
- 絵は SVG、動きは Motion for React（`motion/react`）。公開の部品は `src/components/PeerAvatar.tsx`、中身（顔・まわりの飾り・動きの設定）は `src/components/avatar/`。
- 6つの状態と動き：`idle` ゆっくり上下・ときどきまばたき／`listening` うなずく・波／`thinking` 頭がゆれる・点が順に光る／`question` 首をかしげる・「？」がはずむ／`practice_success` 1回だけ跳ねる・きらきら／`mastery_success` 1回だけ大きく跳ねる・星の目・紙吹雪。
- **表情は知識の状態とは別。** `mastery_success` は、サーバーが返した `knowledge_changes` が「習得済みへの遷移」（`old_status` が `MASTERED` でなく、`new_status` が `MASTERED`）のときだけ。ぴあ友の発言（`emotion`）や「分かった」では出さない（発言が `mastery_success` でも、遷移がなければ `practice_success` にする）。
- **同じ確定イベントは1回だけ。** API に `event_id` はないので、教えた応答は `turn_id` と `concept_id` の組、ぴあ友の解答は `attempt.id` と `concept_id` の組を識別子にする（`src/lib/avatarEvents.ts`。契約は変えていない）。同じ識別子を2度受け取っても、習得のお知らせも演出も1回だけ。覚えておくのは、授業の画面を開いている間（メモリの中）、最大200件で、超えたら古いものから忘れる。再読み込みのあとは、サーバーから同じイベントが届かないので、持ち越さない。
- アバターは、状態が変わったときか、`eventKey` が変わったときだけ、動きを最初から再生する。同じ状態・同じ `eventKey` のまま描き直しても、再生しない。API に `event_id` を足す場合は、契約を先に更新して、識別子をそれに置き換える。
- `prefers-reduced-motion` では動かさず、止めた絵で出す。頭の傾き・「？」・点・星・紙吹雪の絵で、状態は絵でも分かる。アバターの下の一言（文字）も、そのまま出る。会話の小さなアイコンなど、動かしたくないところは `animated={false}`。
- `npm run test:avatar` で、確定イベントの判定と重複の抑止を確かめられる。

### 学習レポート（/report/?session=...）をモックで試す
- 開くと、はじめに「評価中…」が出て、少したつとレポートが出る。
- 学習ルームから「授業を終える」で来ると、その授業の会話（このタブのメモリだけにある）から「ぴあ友がつまずいたところ」が出る。直接開いたときや再読み込みしたあとは出ない。
- `?session=99`：3観点すべて評価保留。`?session=98`：評価できなかった。それ以外：分かりやすさだけ評価保留（74点）。

## ログイン（#10）
- ログインは Google アカウントだけ（Firebase Authentication、ADR-016）。設定値は `src/lib/auth/firebase.ts`（公開してよい値）。
- ホーム（`/`）は、ログインしていなければログイン画面になる。ほかの画面をログインせずに開くと、`/?next=元の画面` に移り、ログインのあとに元の画面へ戻る。
- API が 401 を返したら（ログインが切れた）、ログイン画面に「期限が切れました」と出して戻す。
- API を呼ぶときは、Firebase の ID トークンを `Authorization: Bearer …` で付ける（DRF 側の確認は #11）。
- モックのときはログインした「ふり」をする（ログイン画面は `?mock=unauthorized` で見られる）。モックのまま本物の Google ログインを試すときは、`apps/web/.env.local` に `NEXT_PUBLIC_AUTH=firebase` を書く。
- Firebase コンソールで、Authentication の「ログイン方法」で Google を有効にし、「承認済みドメイン」に公開先のドメイン（Hosting のドメインなど）を入れておく。`localhost` は最初から入っている。

## 初回登録（#43）
- 初回設定の画面は `/` に出る（docs/04 の 2・9）。ログイン済みで未登録のとき、画面（`src/components/auth/OnboardingScreen.tsx`）がニックネーム・校種・学年とデータの扱いの説明、同意のチェックを出す。同意のチェックがなければ「はじめる」は押せない。
- 未登録かどうかは、API が返す 403 `ONBOARDING_REQUIRED` で分かる。どの API でも 403 `ONBOARDING_REQUIRED` を受けたら、`client.ts` が `setOnboardingRequiredHandler` で登録された処理を呼び、`useAuth()` の `onboardingRequired` が true になる。ホーム以外の画面では、`AuthGate` が `/?next=元の画面` へ移し、登録のあとに元の画面へ戻る。
- 登録は `POST /onboarding/complete/`。送る値は `nickname`・`school_level`・`grade`・`terms_version`・`privacy_notice_version`・`consent_confirmed: true`（これ以外は送らない）。版の値は `src/lib/onboarding.ts`。**利用規約・データの扱いの正式な文面は法務の確認（#65）のあとに決める。それまで版は仮の `draft-1`。**
- モックで試す: `?mock=newUser` を付けて `/` を開く（ログインはモックなので、すぐ初回設定が出る）。ニックネームに `#neterr` と入れると、1回目だけ通信エラーになる。

## ホーム（`/`）
- ログイン済みで登録済みのとき、`src/components/home/HomeScreen.tsx` が出る。ロゴ・ぴあ友・吹き出し（PCのみ）・3つのボタン（学習内容を選ぶ `/lessons/`・知識マップ `/knowledge/`・設定 `/settings/`）だけ。ナビバー・タブバーは出さない（docs/04 の 3、ADR-030・ADR-038）。
- 吹き出しは `GET /sessions/?limit=1` のいちばん新しい授業の、**最後の小単元**を `GET /lessons/{id}/` で引いて作る（`src/lib/home.ts`）。授業がなければ「はじめまして！」。取得中は読み込みの表示、失敗したら「もう一度」。**失敗してもボタンは使える。**
- ぴあ友は、画像の利用条件の確認が済むまで SVG のアバター（idle）で代用している。確認が済んだら、画像を `apps/web/public/` に置き、`src/components/home/HomePeer.tsx` の `HOME_PEER_IMAGE` にパスを書く。
- モックで試す：`?mock=noSessions`（授業なし）、`?mock=slowSessions`（読み込み中）、`?mock=networkError`（失敗）、`?mock=unauthorized`（ログインが切れた）。

## 注意
- 静的出力のため、SSR・Server Actions・動的ルート（`/study/[id]` など）は使わない。
  画面は `/study/?session=...` のようにクエリで値を受け取る。
- `next start` は使わない（静的出力では動かない）。
- 秘密情報（APIキーなど）をこのアプリに置かない。
