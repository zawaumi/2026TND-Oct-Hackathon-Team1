# ぴあとも 仕様書

**版** 1.1 / **改訂日** 2026-11-08

「ぴあとも」は、中学生・高校生が同年代のAI生徒「ぴあ友」に勉強を教え、教えることで自分の理解を深める学習アプリ。この `docs/` が仕様の正本で、API契約はリポジトリ直下の `contracts/` に置く。

## 読む順番
1. [用語集](glossary.md)：仕様書・画面・コードで使う言葉
2. [00 総合仕様書](00_master_spec.md)：範囲、要件ID（FR／NFR／SEC／PR）、受入条件
3. 担当に応じて詳細設計を読む

| ファイル | 内容 | 主に読む人 |
|---|---|---|
| [00_master_spec.md](00_master_spec.md) | 総合仕様書（正本） | 全員 |
| [01_architecture.md](01_architecture.md) | システム構成、認証、競合制御、本番構成 | API・Web |
| [02_data_model.md](02_data_model.md) | モデル、制約、状態遷移、削除 | API |
| [03_ai_learning_engine.md](03_ai_learning_engine.md) | AI連携、対話方針、Skill Executor、評価 | AI・API |
| [04_ux_ui.md](04_ux_ui.md) | 画面仕様、問題を出すモード、アクセシビリティ | Web |
| [05_security_privacy.md](05_security_privacy.md) | 認証認可、入力検査、保存最小化、退会 | 全員 |
| [06_test_plan.md](06_test_plan.md) | 受入テスト、採点の比較実験 | 全員 |
| [07_delivery_plan.md](07_delivery_plan.md) | マイルストーン、担当分担、ブランチ、CI/CD | 全員 |
| [08_decisions_and_open_items.md](08_decisions_and_open_items.md) | 設計判断ログ、未検証事項、版の履歴 | 全員 |
| [09_risks_traceability.md](09_risks_traceability.md) | リスク、要件→実装→検証の対応 | 全員 |
| [deploy.md](deploy.md) | 本番公開の手順（Firebase Hosting・Cloud Run・Cloud SQL） | 公開する人 |
| [screens.md](screens.md) | 画面ガイド（画面ごとの説明とスクリーンショット） | 全員 |
| [submission/](submission/README.md) | 最終提出の資料（実装状況と未達の記録、デモの台本、発表資料の構成案） | 全員 |
| [e2e_acceptance.md](e2e_acceptance.md) | MVPの受入試験の記録（API の自動試験と、画面の通し） | 全員 |
| [a11y_check.md](a11y_check.md) | レスポンシブ・アクセシビリティの確認記録 | Web |
| [materials/](materials/mvp_scope_and_sources.md) | 教材の対象・出典・内容のレビュー記録 | 教材 |
| [experiments/scoring/](experiments/scoring/README.md) | 採点実験のデータと人手基準（採点は未実施） | 評価 |
| [diagrams/](diagrams/) | Mermaidの構成図・ER図・シーケンス図 | 全員 |
| [../contracts/openapi.yaml](../contracts/openapi.yaml) | DRF APIの契約（OpenAPI 3.0.3） | API・Web |
| [../contracts/example_lesson.json](../contracts/example_lesson.json) | 小単元・概念・採点規準のサンプル（架空） | API・AI |

## 更新のルール
- 変更はPRで行う。決定を伴う変更は [08](08_decisions_and_open_items.md) の表に1行追加する。
- APIの形を変えるときは、`contracts/openapi.yaml` を同じPRで直す。
- 新しい言葉は、先に [用語集](glossary.md) に足す。
- PDFが必要なときは、日本語フォント（Noto Sans CJK JP など）を指定してこのMarkdownから出力する。中国語・韓国語用のフォントが混ざると字形が崩れる。

## このパッケージで約束しないこと
- 学校の公式な成績・評定を出すこと
- どんな自然言語でも理解し、常に数学的に正しいこと
- チャット履歴をクラウドに無期限で保存すること
- 最初のMVPで全学年・全教科を扱うこと
- API契約は実装済みのAPIではない。認証情報や実在のユーザーの会話はコミットしない
