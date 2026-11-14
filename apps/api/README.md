# API

Python 3.12 で実行します。

```sh
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py check
python manage.py runserver
```

`GET http://127.0.0.1:8000/api/v1/health/` は認証不要で `{"status":"ok","service":"piatomo-api"}` を返します。プロセスの稼働確認であり、DBの接続確認は行いません。

設定は既定で `config.settings.development` です。本番では `DJANGO_SETTINGS_MODULE=config.settings.production` を指定し、次の環境変数を必ず設定してください。

- `DJANGO_SECRET_KEY`: Djangoの秘密鍵
- `DJANGO_ALLOWED_HOSTS`: 許可するホスト名のカンマ区切り（例: `api.example.com,localhost`）

開発用の秘密鍵は環境変数未指定時に起動ごとに生成されます。

## ユーザーとマイグレーション

`accounts.User` は Firebase UID を一意の識別子として使います。通常ユーザーは初回設定と必要な同意の完了後に作成します。管理者は `python manage.py createsuperuser` で UID とパスワードを指定して作成できます。ユーザーモデルは初回マイグレーション前に設定する必要があるため、既存の開発用 DB に既定のユーザーモデルを移行済みの場合はデータ移行が必要です。

`python manage.py test accounts` でユーザー作成と UID の一意制約、ログインと初回設定を確認できます。

## ログインと初回設定

画面は Firebase Authentication でログインし、API を呼ぶたびに `Authorization: Bearer <ID トークン>` を付けます（`apps/web/src/lib/api/client.ts`）。API はそのトークンを確かめて、本人を決めます（`accounts/firebase.py`・`accounts/authentication.py`）。

- 確かめること：Google の公開鍵での署名（RS256）、対象（`aud`）が `FIREBASE_PROJECT_ID`、発行者（`iss`）が `https://securetoken.google.com/<プロジェクト ID>`、有効期限、UID（`sub`）。公開鍵は Google の指定する時間だけ使い回します。
- 失効の確認（ログアウトしたトークンを止める）はしません。トークンの有効期限が1時間と短いためです（MVP の範囲）。
- トークンがない・正しくない・期限切れ → 401（`UNAUTHORIZED` / `INVALID_TOKEN`）。画面はログイン画面へ戻します。
- ログインはしているが未登録 → 403 `ONBOARDING_REQUIRED`。認証の処理ではユーザーを作りません。
- `GET /api/v1/users/me/`：本人の最小プロフィール（`id`・`nickname`・`school_level`・`grade`・`onboarding_completed`）。
- `POST /api/v1/onboarding/complete/`：説明と同意のあとに初回登録します（未登録でも呼べる唯一の API）。`consent_confirmed: true` と、同意した規約・データの扱いの説明の版（`terms_version`・`privacy_notice_version`）が必要です。ユーザーとぴあ友を作って 201。登録済みなら中身を変えずに 200。GET では登録しません。
- エラーは、どの API も `{"code": "...", "message": "..."}` の形で返します（`config/exceptions.py`）。

| 環境変数 | 意味 | 既定 |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | トークンの対象のプロジェクト（公開してよい値） | `tnd2026-oct-hackathon` |
| `CORS_ALLOWED_ORIGINS` | 画面から API を直接呼んでよい場所（カンマ区切り） | 開発：`http://localhost:3000,http://127.0.0.1:3000`、本番：なし |

本番は Firebase Hosting から `/api/**` を Cloud Run へ転送して同じ場所に見せるので、CORS の許可は要りません。手元で画面（`npm run dev`）から本物の API を使うときは、`apps/web/.env.local` に `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` を書きます。

## ローカル PostgreSQL

リポジトリ直下で `.env.example` を `.env` にコピーし、開発専用のパスワードを設定します。

```sh
cp .env.example .env
docker compose up -d db
docker compose ps  # db が healthy になるまで待つ
set -a
source .env
set +a
cd apps/api
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test
```

`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_HOST`、`POSTGRES_PORT` を API プロセスに渡します。ホストからは `POSTGRES_HOST=127.0.0.1`、Compose 内の別サービスからは `db` を使います。ホスト側ポートが使用中なら `.env` の `POSTGRES_PORT` を変更してください。既存ボリュームの DB 名・ユーザー・パスワードは `.env` の変更だけでは更新されません。

開発時にこれらの環境変数がすべて未設定なら SQLite を使用し、一部だけ設定された場合はエラーになります。本番では PostgreSQL の全設定が必須です。`docker compose down` はデータを保持します。`docker compose down -v` はボリューム内の DB データをすべて削除します。

## 教材（lessons）

学習指導要領の階層（`CurriculumRevision`・`CurriculumItem`）、アプリで選ぶ教材（`Lesson`）、概念（`Concept`）、教材と概念の対応（`LessonConcept`）を持ちます（docs/02 の 1〜3）。

- `Lesson.parent` で領域 → 単元 → 小単元のように何段でも深くできます。親子が循環する保存は `lessons/services.py` の確認で拒否します。
- 同じ概念は1件だけ作り、複数の教材から `LessonConcept` で参照します。同じ教材と概念の組は1件だけです。
- 公開教材（`CURATED`）は所有者なし、私有（`PRIVATE`）は所有者が必須です（DB の制約）。
- `Lesson.grade` は中学の学年（1〜3）で、高校の科目は空にします。`subject` は教科・科目のコード（例：`math`）です。
- 教材データは管理画面（`/admin/`）からも入力できます。

## ぴあ友（peers）

ぴあ友（`Peer`）はユーザー1人に1人で、初回設定（`POST /api/v1/onboarding/complete/`）のときに作られます（それより前のユーザーは、初めて `GET /api/v1/peers/me/` などを呼んだときに作られます）。知識の状態（`PeerKnowledge`）は（ぴあ友, 概念）ごとに1行で、行がない概念は「未習」として返します。

- `GET /api/v1/peers/me/`：本人のぴあ友
- `GET /api/v1/peers/me/knowledge/?concept_ids=1,2`：本人のぴあ友の知識の状態。省略すると、見てよい概念（公開教材と本人の私有）すべて
- 状態を変えるのは状態の遷移サービス（`peers/knowledge.py`）だけです。`required_correct` は習得判定ができるまで既定値の2を返します。
- テストでは、ログインの確認を通さずに `force_authenticate` で本人として呼んでかまいません（ログインそのものは `accounts/test_auth.py` で確かめます）。

## PR のチェック（CI）

`apps/api/**`・`contracts/**` を変えた PR と、`main` への push で `.github/workflows/api-ci.yml` が動きます。

- `api`：PostgreSQL 15（CI 専用の DB と認証情報）を起動し、`manage.py check`、本番設定での `check --deploy`、マイグレーションの作り忘れの確認（`makemigrations --check`）、テストを実行します。
- `contract`：`contracts/openapi.yaml` の構造と参照を検証します。
- `container`：`apps/api/Dockerfile` からコンテナを作れるか確かめます。

## コンテナ

`apps/api/Dockerfile` は Cloud Run 用です。本番設定（`config.settings.production`）で gunicorn を起動し、`PORT`（既定 8080）で待ち受けます。`DJANGO_SECRET_KEY`、`DJANGO_ALLOWED_HOSTS`、`POSTGRES_*` は実行時の環境変数で渡し、イメージには入れません。

## 教材の取得

- `GET /api/v1/lessons/?school_level=middle&grade=1&subject=math`：公開中の教材。絞り込みは小単元に効き、その上の単元・領域も一緒に返します（画面が木を組み立てるため）。下書き（`status=draft`）と他人の私有教材は返しません。
- `GET /api/v1/lessons/{id}/`：1件。見てよくない教材は 404。
- `GET /api/v1/knowledge-graph/?lesson_id=`：概念（ノード）と前提関係（辺）。状態は本人のぴあ友のもの。単元を渡すと、その下の小単元の概念をまとめて返します。前提関係のモデル（`ConceptPrerequisite`）ができるまで、辺は空です。

## 授業（`learning` アプリ）

Django 標準の `sessions` と名前が重ならないよう、授業のアプリは `learning` にしました。

- `POST /api/v1/sessions/`：`{"mode":"preset","lesson_ids":[...]}` で授業を始めます（201）。単元を選ぶと小単元まで展開し、重複は除きます。選べるのは小単元10個まで。
- `GET /api/v1/sessions/?limit=`：本人の授業（新しい順）。点数は評価が済むまで `null`。
- `GET /api/v1/sessions/{id}/`：本人の授業。他人の授業は 404。
- `POST /api/v1/sessions/{id}/finish/`：授業を終えて評価待ちにします（202）。2回呼んでも変わりません。

## 外部AI：DeepSeek

`integrations/` に DeepSeek とのつなぎがあります。方針（`action`）と対象の概念は DRF が決め、DeepSeek はぴあ友らしい1つの質問を作るだけです（docs/03 の B）。返ってきた JSON は検証前のものなので、そのまま画面に出さず、出力の検証（`learning/validation.py`）を通します。

- **キーはサーバーの環境変数だけ**：`DEEPSEEK_API_KEY`。リポジトリ・`.env.example`・`NEXT_PUBLIC_*` には書きません。本番は Cloud Run の環境変数か Secret Manager。
- **キーがないときはモック**：テストや開発はキーなしで動きます。`DEEPSEEK_MOCK=true` でキーがあってもモックにできます。`DEEPSEEK_MOCK_MODE` で `normal`・`invalid_json`・`http_error`・`timeout`・`master_all` を再現できます。
- **送るデータは最小限**（`integrations/payload.py`）：教材の名前と説明、方針、直近6件までの会話、今回の説明文だけ。ユーザーの ID・メール・トークンは送りません。文章中のメール・電話番号・URL は伏せ字にします（完全ではありません）。
- **ログ**：結果の種類と時間だけ。キーや会話の中身は出しません。
- その他の設定：`DEEPSEEK_BASE_URL`（既定 `https://api.deepseek.com`）、`DEEPSEEK_MODEL`（既定 `deepseek-chat`）、`DEEPSEEK_TIMEOUT_SECONDS`（既定 15）。

キーを入れたら、1回だけ本物につないで確かめられます。

```powershell
# PowerShell（このウィンドウの間だけ有効）
$env:DEEPSEEK_API_KEY = "（中澤さんから受け取ったキー）"
python manage.py deepseek_check
```
`error=None` と、`action`・`message` などが入った JSON が出れば成功です。

## 教える1ターン

`POST /api/v1/sessions/{id}/messages/`（`{"request_id": "<UUID>", "content": "説明", "recent_context": [...]}`）で説明を送ると、検証済みのぴあ友の応答が返ります（`learning/turns.py`）。

1. **受付**（最小限の実装）：(授業, `request_id`) で一意。同じ送信の再送は前の結果を返し（二重に処理しない）、同じ ID で違う内容は 409 `REQUEST_ID_CONFLICT`。同じ授業で別の送信を処理中なら 409 `TURN_IN_PROGRESS`。処理中の再送は 202。60秒を過ぎた処理中・失敗した送信は、同じ ID で送り直せます。
2. **入力の検査**（最小限の実装、`learning/input_check.py`）：空・4000字超は 400。命令らしい文が混ざっていれば「データとしてだけ扱う」（`DATA_ONLY`）にし、知識の状態は変えません。
3. **方針**（`learning/policy.py`）：DRF が action と対象の概念を決めます。対象は授業の概念のうち、まだ習得済みでない最初のもの。理由がなければ `ask_why`、例がなければ `request_example`、初めての説明なら `explain_back`、そのあとは `contrast_cases` と `attempt_exercise` を交互に。前提の概念が足りなければ `check_prerequisite`。同じ入力なら同じ結果です。Jev が使えるようになったら、理由・例の判定をそれに置き換えます。
4. **DeepSeek**（`integrations/deepseek.py`）：DB のロックを持たずに呼びます。
5. **出力の検証**（`learning/validation.py`）：形・action・概念が DRF の決めたものと同じか、自分で「習得した」と言っていないか、答え（`x = 4` など）を言っていないかを確かめます。だめなら `action=fallback` の定型文にし、知識は変えません（`fallback_used: true`）。表情の `mastery_success` は DRF だけが決めます。
6. **確定**：ぴあ友の知識の版が受付のときと同じなら、未習の概念を「説明済み」に進めて応答を保存します。変わっていれば 409 `STALE_KNOWLEDGE_VERSION`。状態を変えるのは `peers/knowledge.py` の `advance` だけです（1段ずつ、戻さない、習得済みにできるのは習得判定だけ）。

ターンごとの所見（観点のコード＋100字以内）は `TurnNote` に保存し、授業の評価で観点の説明と「良かったところ」を作るのに使います。会話の本文はサーバーに保存しません（`LearningTurn.result_cache` は再送に答えるための、画面に返した応答だけ）。

`GET /api/v1/sessions/{id}/turns/{request_id}/`：処理中なら 202、終わっていれば 200（同じ応答）、失敗・期限切れなら 410。

## 授業の評価と学習レポート（`evaluations` アプリ）

授業を終える（`POST /api/v1/sessions/{id}/finish/`）と、その場で評価して `evaluation_complete` を返します。評価に失敗したときは `evaluation_pending` のままにし、`GET /api/v1/sessions/{id}/evaluation/` のときにもう一度評価します。授業中に GET すると 404 `SESSION_NOT_FINISHED`。

- **ルーブリック（`evaluations/models.py`）**：`Rubric`（版で管理）と `Criterion`（観点・配点・段階1〜5の文）。既定は共通の `draft-2026-11`（正確さ40・論理性30・分かりやすさ30、配点は仮。ADR-015）で、マイグレーションで入ります。変えるときは版を上げて新しく足し、古い版は過去の評価のために残します。評価（`Evaluation`・`CriterionResult`）には、使ったルーブリックの版を記録します。
- **評価候補**：1ターンごとに、DeepSeek が観点ごとの段階（1〜5）と短い所見を返します（`findings`、`TurnNote` に保存）。段階の文はルーブリック（`evaluations/defaults.py`）から指示に入れます。Jev が使えるようになったら、評価候補をそれに置き換えます。命令らしい文が混ざった説明（`DATA_ONLY`）と、定型文になったターンの所見は使いません。
- **集計と評価保留（`evaluations/scoring.py`）**：段階1〜5を20〜100点にし、観点ごとに平均します。根拠になる段階が2件より少ない観点は評価保留（`UNRATED`）。合計は評価した観点の配点で割り戻し、すべて保留なら合計を出しません。毎回同じ計算で、会話の回数や発言量では採点しません。
- **観点の説明**：70点未満ならいちばん低い段階の所見（画面の「改善のヒント」）、70点以上ならいちばん高い段階の所見。
- **良かったところ（ADR-033）**：段階4以上の所見から、観点がなるべく重ならないように最大3件。
- **学習レポート（`evaluations/services.py`）**：契約の `EvaluationReport` の形。ぴあ友の習得の変化（授業の中のターンでの「前→後」）、習得済みの概念、次の学習の候補（①今回の小単元、②前提がそろった同じ校種・教科の小単元、の順に最大3件。いまも公開中のものだけ返す）。レポートは評価したときの写しなので、あとで知識をリセットしても変わりません。`GET /sessions/` の `total_score` にも点数が出ます。
- **プライバシー**：評価が終わったらターンの所見は消します（docs/03 の G）。保存するのは点数・観点の短い説明・良かったところだけで、会話の本文は保存しません。
- **まだやっていないこと**：数学的に明確な誤りを決まった方法で確かめて、正確さの高評価を抑えること（演習の採点・習得判定と合わせて）。

## 問題を出す・ぴあ友が解く（`exercises` アプリ）

授業の中で、ユーザーが一次方程式の問題を出すと、ぴあ友が「教わった技能だけ」で1ステップずつ解き、サーバーがその解き方を検証します（docs/03 の D・E）。

- `POST /api/v1/sessions/{id}/exercises/`（`{"request_id", "kind": "math_equation", "question", "latex", "target_concept_id"}`）：問題の検証の状態を返す（201）。
  - `VERIFIED`：一次方程式（文字は x 1つ、整数・有理数の係数）で、解き方の中で対象の概念の技能を使う問題。
  - `PROVISIONAL`：解けるが、対象の概念の技能を使わずに解ける問題（例：「たす・ひく」の練習に `3x=12`）。練習にはなるが、習得の回数に入らない。
  - `UNSUPPORTED`：一次方程式として読めない（2乗・ほかの文字・小数・解が1つに決まらない式など）。理由（`reason`）を返す。
  - 対象の概念は、その授業の概念だけ。同じ `request_id` の再送には同じ問題を返す。
- `POST /api/v1/exercises/{id}/attempt/`（`{"request_id"}`）：ぴあ友の解答（200）。
  - 式は安全な文法だけで読む（`lessons/curated.py` の `parse_side`。`eval` は使わない）。長さと数の大きさにも上限がある（`exercises/solver.py`）。
  - 解き方は決まった手順：x の項を左辺へ → 数の項を右辺へ → x の係数でわる（または逆数をかける）。各ステップの技能（`add_both_sides` など）は、ぴあ友が説明済み以上になっている概念の技能だけ使える。使えない技能に来たら `blocked`（足りない技能の表示名を返す）。対象の概念をまだ教わっていなければ、解き始めずに `blocked`。
  - 検証は解き方とは別に行う：各ステップの解がもとの解と同じか、最後が `x=（解）` か、解を代入して左右が等しいか。
  - 検証済みの正解は、習得の根拠（`MasteryEvidence`）になる。同じ形の問題（数字だけ違う）は1回しか数えない（`reason: duplicate_form`）。根拠の数が習得条件に届いたら習得済みにする。状態を変えるのは `peers/knowledge.py` の `advance` だけ（説明済み → 練習中 → 習得済みの1段ずつ）。
  - 同じ `request_id` の再送には、同じ結果を返す（二重に数えない）。
- 概念の技能と習得条件（必要な正答の数・問題の形の数）は、公開教材のデータファイル（`lessons/data/*.json`）から読む（`lessons/skills.py`）。`GET /peers/me/knowledge/` の `required_correct` も、ここの値を返す。
- 問題の文は保存しない（読み取った方程式の係数と、問題の形だけ）。画面に返した結果は、再送に答えるために保存する。
- 学習レポートの「習得の変化」には、ぴあ友の解答で起きた変化も入る。
