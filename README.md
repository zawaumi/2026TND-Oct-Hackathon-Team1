ぴあとも（Piatomo）
中学生・高校生が、同年代のAI生徒「ぴあ友」に勉強を教え、教えることで自分の理解を深める学習アプリです。
TND 秋のハッカソン2026・チーム1。
仕様の正本は `docs/`、API契約は `contracts/openapi.yaml`（1.1.0-draft）です。用語は `docs/glossary.md` に従います。
```
apps/web/    Web（Next.js + TypeScript + Tailwind。静的出力）
apps/api/    API（Django REST Framework）
contracts/   API契約（OpenAPI）
docs/        仕様書
compose.yaml ローカルDB（PostgreSQL）
```
1. 前提ソフト
ソフト	版	用途
Git	最近のもの	
Python	3.12	API
Node.js	`apps/web/.nvmrc` の版（26）。nvm なら `cd apps/web && nvm install && nvm use`	Web
Docker（Compose v2）	最近のもの	ローカルのPostgreSQL（使わなくてもAPIは起動できる。手順3参照）
2. 環境変数
```sh
cp .env.example .env
```
`.env` を開いて、`POSTGRES_PASSWORD` を自分用の値に変えます（ローカル専用なので何でもよい）。
`.env` は Gitに入りません（`.gitignore` で除外済み）。コミットしないでください。
`.env.example` には架空の値だけを置きます。本物のパスワード・APIキー・Firebaseのサービスアカウント鍵（`*.json`）は、どのファイルにも書かず、PRにも含めません。
Webの環境変数（`NEXT_PUBLIC_*`）はブラウザに公開されるので、秘密の値を入れません。
変数	使う場所	内容
`POSTGRES_DB` `POSTGRES_USER` `POSTGRES_PASSWORD` `POSTGRES_HOST` `POSTGRES_PORT`	Docker・API	DB接続。5つすべて設定するか、すべて未設定にする（一部だけだとAPIがエラーになる）
`DJANGO_SECRET_KEY`	API	未設定なら起動のたびに自動生成。本番では必須
`DJANGO_SETTINGS_MODULE` `DJANGO_ALLOWED_HOSTS`	API（本番）	本番だけ必須。ローカルでは不要
3. DBを起動する（Docker）
```sh
docker compose up -d db
docker compose ps        # db が healthy になるまで待つ
```
Dockerを使わない場合は、手順2の `POSTGRES_*` をすべて消す（または未設定にする）と、APIは SQLite（`apps/api/db.sqlite3`）で動きます。
4. APIを準備して起動する
```sh
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# .env の値をこのターミナルに読み込む（DBにPostgreSQLを使うとき）
set -a; source ../../.env; set +a

python manage.py migrate     # DBの初期移行
python manage.py runserver   # http://127.0.0.1:8000
```
確認: ブラウザかターミナルで `http://127.0.0.1:8000/api/v1/health/` を開くと `{"status":"ok","service":"piatomo-api"}` が返ります（プロセスの稼働確認で、DBの接続確認ではありません）。
> ターミナルを開き直すたびに、`source .venv/bin/activate` と `set -a; source ../../.env; set +a` が必要です。
5. Webを起動する
別のターミナルで:
```sh
cd apps/web
nvm use                # .nvmrc の版に切り替え（nvmを使う場合）
npm ci                 # 依存の導入（package-lock.json どおり）
npm run dev            # http://localhost:3000
```
`NEXT_PUBLIC_API_BASE_URL` を設定しないときは、画面はモック（`src/lib/api/mock.ts`）で動きます。API（手順4）を起動していなくても、画面は確認できます。モックの合図などは `apps/web/README.md` を参照してください。
現時点のAPIは `health` だけで、ブラウザからのアクセス許可（CORS）も未設定のため、WebをAPIにつなぐのはAPIの実装が進んでからです。つなぐときは `apps/web/.env.local`（Git管理外）に `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` を書きます。
6. テスト・検査
```sh
# API（apps/api で、venv を有効にして、手順4の環境変数を読み込んだうえで）
python manage.py check
python manage.py test accounts config

# Web（apps/web）
npm run lint
npm run typecheck
npm run build            # 静的ビルド → out/（Google Fonts を取得するためインターネット接続が必要）

# API契約（リポジトリ直下）
python3 -m venv contracts/.venv
contracts/.venv/bin/python -m pip install -r contracts/requirements.txt
contracts/.venv/bin/openapi-spec-validator contracts/openapi.yaml    # "OK" が出れば成功
```
PRを出すと、変えた場所に応じて自動チェック（CI）が動きます。動くチェックの一覧は `.github/workflows/` にあります。CIの結果を待つ前に、手元でも上のコマンドを実行しておくと、失敗に早く気づけます。
7. 終了・後片づけ
やりたいこと	コマンド	影響
APIやWebを止める	そのターミナルで `Ctrl + C`	なし
DBを止める	`docker compose down`	DBのデータは残る
DBを止めてデータも消す	`docker compose down -v`	DB内のデータがすべて消える（やり直したいときだけ）
`.env` の `POSTGRES_DB` `POSTGRES_USER` `POSTGRES_PASSWORD` を変えても、すでに作られたDBには反映されません。変えたいときは `docker compose down -v` で作り直します。
ホスト側のポート5432が使用中なら、`.env` の `POSTGRES_PORT` を変えます。
8. ブランチ・PR・レビュー
`main` から、1つのIssueにつき1つの短いブランチを作る（新機能は `feat/<Issue番号>-<内容>`、修正は `fix/<内容>`）。
変更をコミットして push し、PRを作る。説明欄に `Closes #<Issue番号>` を書く。
PRに、実行した確認コマンドと結果、未実施の項目を書く。
受け入れ条件を確認し、CIが成功していることを確かめる。レビューを最低1人から受ける。
レビュー済みで、CIが成功していれば `main` にマージする。`main` はいつでもデプロイできる状態に保つ。
秘密情報を誤ってコミットしたときは、PRを出す前に（または出してすぐに）チームに伝えてください。 一度公開した鍵は、履歴から消しても無効にする（再発行する）必要があります。
9. API契約（`contracts/openapi.yaml`）を変えるとき
APIの要求・応答・認証・エラーを変えるPRでは、同じPRで `contracts/openapi.yaml` を更新する（必要なら仕様書とサンプルも）。
手順6の「API契約」の検証コマンドで `OK` を確認する。
Webの型を作り直す: `cd apps/web && npm run gen:api`（`src/lib/api/schema.d.ts` が更新される。差分も同じPRに含める）。
決定を伴う変更は、`docs/08_decisions_and_open_items.md` の表に1行足す。
PRに、変更内容・検証結果・未実装や未確認の項目を書く。契約草案と実装済みのAPIは区別して書く。
10. 本番公開
画面は Firebase Hosting、API は Cloud Run、DB は Cloud SQL に置きます。手順は [`docs/deploy.md`](docs/deploy.md) にまとめました（`firebase.json` が配信と `/api/**` の転送を決めています）。秘密の値は Secret Manager にだけ置きます。
よくあるつまずき
症状	原因と対処
`Missing PostgreSQL settings: ...`	`POSTGRES_*` が一部しか設定されていない。5つすべて設定するか、すべて外す
`docker compose` が `Set POSTGRES_DB in .env` と言う	リポジトリ直下に `.env` がない。手順2を実行する
DBに接続できない	`docker compose ps` で `healthy` か確認。ポート使用中なら `POSTGRES_PORT` を変える
`npm run build` が失敗する（フォント取得エラー）	インターネットに接続できていない。接続してから再実行する
