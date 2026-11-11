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

`python manage.py test accounts` でユーザー作成と UID の一意制約を確認できます。

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
python manage.py test accounts config lessons peers
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

ぴあ友（`Peer`）はユーザー1人に1人で、初めて `GET /api/v1/peers/me/` などを呼んだときに作られます。知識の状態（`PeerKnowledge`）は（ぴあ友, 概念）ごとに1行で、行がない概念は「未習」として返します。

- `GET /api/v1/peers/me/`：本人のぴあ友
- `GET /api/v1/peers/me/knowledge/?concept_ids=1,2`：本人のぴあ友の知識の状態。省略すると、見てよい概念（公開教材と本人の私有）すべて
- 状態を変えるのは状態の遷移サービス（#21）だけです。`required_correct` は習得判定（#39）ができるまで既定値の2を返します。
- ログインの確認（#11）ができるまでは、テストでは `force_authenticate` で本人として呼びます。

## PR のチェック（CI）

`apps/api/**`・`contracts/**` を変えた PR と、`main` への push で `.github/workflows/api-ci.yml` が動きます。

- `api`：PostgreSQL 15（CI 専用の DB と認証情報）を起動し、`manage.py check`、本番設定での `check --deploy`、マイグレーションの作り忘れの確認（`makemigrations --check`）、テストを実行します。
- `contract`：`contracts/openapi.yaml` の構造と参照を検証します。
- `container`：`apps/api/Dockerfile` からコンテナを作れるか確かめます。

## コンテナ

`apps/api/Dockerfile` は Cloud Run（#57）用です。本番設定（`config.settings.production`）で gunicorn を起動し、`PORT`（既定 8080）で待ち受けます。`DJANGO_SECRET_KEY`、`DJANGO_ALLOWED_HOSTS`、`POSTGRES_*` は実行時の環境変数で渡し、イメージには入れません。

## 外部AI：DeepSeek（#30・#27）

`integrations/` に DeepSeek とのつなぎがあります。方針（`action`）と対象の概念は DRF が決め、DeepSeek はぴあ友らしい1つの質問を作るだけです（docs/03 の B）。返ってきた JSON は検証前のものなので、そのまま画面に出さず、出力の検証（#31）を通します。

- **キーはサーバーの環境変数だけ**：`DEEPSEEK_API_KEY`。リポジトリ・`.env.example`・`NEXT_PUBLIC_*` には書きません。本番は Cloud Run の環境変数か Secret Manager（#57）。
- **キーがないときはモック**：テストや開発はキーなしで動きます。`DEEPSEEK_MOCK=true` でキーがあってもモックにできます。`DEEPSEEK_MOCK_MODE` で `normal`・`invalid_json`・`http_error`・`timeout`・`master_all` を再現できます。
- **送るデータは最小限**（#27、`integrations/payload.py`）：教材の名前と説明、方針、直近6件までの会話、今回の説明文だけ。ユーザーの ID・メール・トークンは送りません。文章中のメール・電話番号・URL は伏せ字にします（完全ではありません）。
- **ログ**：結果の種類と時間だけ。キーや会話の中身は出しません。
- その他の設定：`DEEPSEEK_BASE_URL`（既定 `https://api.deepseek.com`）、`DEEPSEEK_MODEL`（既定 `deepseek-chat`）、`DEEPSEEK_TIMEOUT_SECONDS`（既定 15）。

キーを入れたら、1回だけ本物につないで確かめられます。

```powershell
# PowerShell（このウィンドウの間だけ有効）
$env:DEEPSEEK_API_KEY = "（中澤さんから受け取ったキー）"
python manage.py deepseek_check
```
`error=None` と、`action`・`message` などが入った JSON が出れば成功です。
