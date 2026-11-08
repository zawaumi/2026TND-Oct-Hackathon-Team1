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

開発用の秘密鍵は環境変数未指定時に起動ごとに生成されます。データベースは暫定のSQLiteで、PostgreSQLの設定は別途対応します。

## ユーザーとマイグレーション

`accounts.User` は Firebase UID を一意の識別子として使います。通常ユーザーは初回設定と必要な同意の完了後に作成します。管理者は `python manage.py createsuperuser` で UID とパスワードを指定して作成できます。ユーザーモデルは初回マイグレーション前に設定する必要があるため、既存の開発用 DB に既定のユーザーモデルを移行済みの場合はデータ移行が必要です。

`python manage.py test accounts` でユーザー作成と UID の一意制約を確認できます。PostgreSQL の接続設定は #3 で対応予定です。
