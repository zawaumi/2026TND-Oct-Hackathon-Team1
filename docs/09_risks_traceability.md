# リスク登録簿・要求トレーサビリティ

**版** 1.1 / **改訂日** 2026-11-08

## 1. リスク登録簿
| ID | リスク | 影響 | 予防・対応 | 検証 |
|---|---|---|---|---|
| R-01 | DeepSeekが未習得技能を漏らす | ぴあ友としての整合が崩れる | 構造化出力＋許可技能のルール＋定型応答 | EX-T03, EX-T05, SEC-T04 |
| R-02 | Jev採点が数学的に誤る | 誤った学習フィードバック | 決定的検証、評価保留、基準採点との比較 | 教育評価実験 |
| R-03 | 未成年の会話・個人情報流出 | 高いプライバシー影響 | 保存最小化、ログ本文禁止、第三者送信説明 | PR-T01, PR-T02 |
| R-04 | 同時処理でMASTEREDが巻き戻る | 学習履歴の整合性損失 | request_id、knowledge_version、atomic | CON-T01〜03 |
| R-05 | 公開教材に誤った概念関係 | 学習経路・解答誤り | CURATED/PRIVATE分離、人手の内容レビュー | 教材レビュー |
| R-06 | Cloud Run/AI APIの遅延 | 授業の途中断絶 | APIタイムアウト・進捗UI・段階的縮退 | P95計測 |
| R-07 | 退会データがバックアップに残る | 削除ポリシー不履行 | バックアップ保持設定、削除台帳と復元手順 | 運用試験 |
| R-08 | 開発中に機能を広げすぎる | 最終デモが成立しない | 数学の限定問題でE2E先行、11/13凍結 | M3受入 |
| R-09 | AI事業者の未成年・データ取扱条件が未確認 | 一般公開不可 | サービス規約、保持、利用地域を公開前確認 | 公開ゲート |
| R-10 | 静的Next.jsと動的ルート設計の不整合 | デプロイ失敗 | 固定ルート+クエリ、静的ビルドCI（web-ci） | UI-T02 |
| R-11 | 説明力スコアの配点（40・30・30）が実際の説明の質と合わない | 納得感のないフィードバック | 配点は仮と明記、採点の比較実験で見直す | #67、教育評価実験 |
| R-12 | 画面とAPI契約がまたずれる | 画面が必要なデータを取れない | APIの変更は`contracts/openapi.yaml`を同じPRで直す | APIモック（#6）での画面確認 |

## 2. 要求→実装→検証の対応
| 要求 | 主要モジュール | 確認手順 |
|---|---|---|
| FR-01 | accounts/authentication.py | SEC-T01, SEC-T02 |
| FR-02 | lessons/CurriculumItem, Lesson | 公開小単元の選択E2E |
| FR-03 | peers/PeerKnowledge | CON-T03、複数の授業 |
| FR-04 | sessions/service + integrations | DeepSeek接続、mock判定テスト |
| FR-05 | exercises/SkillExecutor | EX-T02〜06 |
| FR-06 | peers/MasteryPolicy + evidence | EX-T01〜03 |
| FR-07 | web/avatar, graph | UI-T01, UI-T02 |
| FR-08 | evaluations/Rubric+Criterion、sessions（`GET /sessions/`） | 教育評価実験、EV-T01〜02、API-T01 |
| SEC-01 | sessions/filters, validators | SEC-T03〜05 |
| PR-01 | session-store/client, schema | PR-T01 |
| PR-02 | accounts/deletion | PR-T02、運用削除確認 |
| NFR-01 | E2Eデモ | 最終の一連の授業デモ |
| NFR-02 | web（各画面のPC・スマホの配置） | UI-T03 |

## 3. 完成判定の定義
- **設計完了**：仕様にID、入力/出力、制約、受入条件、担当、未決事項がある。
- **実装完了**：該当APIとUIが動作し、CIが成功し、主たる正常系・異常系がテスト済み。
- **リリース可能**：第三者サービスの契約・未成年同意・保存/削除条件を確認し、本人の削除機能を含むP0受入基準が満たされる。
