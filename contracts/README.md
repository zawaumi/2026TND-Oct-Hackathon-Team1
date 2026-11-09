# API 契約

`openapi.yaml` はぴあともの API 契約 **1.1.0-draft** です。設計上の要求・応答を示す草案であり、掲載された API が実装済みであることを意味しません。`example_lesson.json` は架空の教材データの例です。

API のベースパスは `/api/v1` です。`GET /health/` は公開、それ以外は `firebaseBearer`（Firebase ID トークンの Bearer 認証）を要求します。共通のエラー応答は `ApiError` の `code` と `message` を使います。

v1.0 からの主な変更は `GET /sessions/`、解答手順の式・技能形式と `reason`・`blocked_skill`、評価の3観点、レポートの知識変化等、概念の説明、教材一覧の学年フィルターです。詳細は `openapi.yaml` と `docs/08_decisions_and_open_items.md` の ADR を参照してください。

## 検証

Python 3.12 を使用し、リポジトリ直下から実行します。

```sh
python3 -m venv contracts/.venv
contracts/.venv/bin/python -m pip install -r contracts/requirements.txt
contracts/.venv/bin/openapi-spec-validator contracts/openapi.yaml
```

`contracts/openapi.yaml: OK` が表示されれば OpenAPI 文書の構造と参照の検証は成功です。これは API 実装の動作、認証の実効性、レスポンスの契約適合を検証するものではありません。

## 契約の更新

1. API の要求・応答、認証、エラーなどを変更するときは、実装と同じ PR で `contracts/openapi.yaml` を更新し、必要に応じて仕様書やサンプルも合わせます。
2. 上記の検証を実行し、関連する API テストで実装と契約の整合を確認します。
3. PR に変更内容、検証結果、未実装・未確認の項目を記録します。契約草案と実装状況は区別して扱います。
