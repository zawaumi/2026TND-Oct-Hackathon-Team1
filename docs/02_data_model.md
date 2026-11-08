# データモデル・DB制約詳細

**版** 1.1 / **改訂日** 2026-11-08 / **DB** PostgreSQL, Django ORM

## 1. モデル一覧

| Django app | Model | 最小限の主要フィールド | 重要な制約 |
|---|---|---|---|
| accounts | User | id, firebase_uid, school_level, grade, nickname, consent_version, deleted_at | Firebase UIDは非NULLで一意（本番ユーザー） |
| accounts | DeletionRequest | id, user, state, requested_at, completed_at | 受付・削除の再試行可能性 |
| peers | Peer | id, owner, display_name, avatar_id, persona_code, knowledge_version | 1ユーザー1ぴあ友（MVP） |
| peers | PeerKnowledge | peer, concept, status, reset_epoch, mastered_at | (peer, concept)一意 |
| lessons | CurriculumRevision | id, code, name, issued_year, source_url | 告示版ごとに管理 |
| lessons | CurriculumItem | id, revision, parent, official_code, title, type | (revision, official_code)可能な範囲で一意 |
| lessons | Lesson | id, parent, curriculum_item, title, owner, status, mode, sort_order | 階層の循環禁止 |
| lessons | Concept | id, code, title, description, scope, owner, difficulty | CURATEDは全体、PRIVATEは所有者を必須 |
| lessons | LessonConcept | lesson, concept, sort_order | (lesson, concept)一意 |
| lessons | ConceptPrerequisite | concept, prerequisite | 自己参照/循環禁止、同一エッジ一意 |
| lessons | MasteryPolicy | concept, version, required_correct, required_variants, require_application | conceptの有効版を一意に指定 |
| sessions | LearningSession | id, owner, peer, mode, status, created_at, finished_at | owner/peerの一致 |
| sessions | SessionLesson | session, lesson, sort_order | (session, lesson)一意：複数小単元対応 |
| sessions | LearningTurn | session, request_id, input_hash, status, knowledge_version, expires_at, result_cache | (session, request_id)一意；短期キャッシュはTTL |
| exercises | Exercise | id, session, lesson, kind, verification_status, target_concept, question_fingerprint | 本文は長期保存しない方針。必要ならクライアントへ返す |
| exercises | ExerciseAttempt | id, exercise, peer, result, reason, blocked_skill, verified_at, steps_verified, reset_epoch | 1要求1確定；明示的な検証結果。`reason`は習得の回数に入らない理由（`duplicate_form`等） |
| exercises | AttemptSkill | attempt, concept, step_index, verified | (attempt, concept, step_index)一意 |
| exercises | MasteryEvidence | peer, concept, attempt, reset_epoch, variant_code, evidence_status | 重複の根拠カウントを防ぐ |
| evaluations | Rubric | id, lesson, version, source_ref, status | (lesson, version)一意 |
| evaluations | Criterion | rubric, code, perspective, weight, levels | (rubric, code)一意。codeは`accuracy`・`logic`・`clarity`の3つ、weightは40・30・30（仮。ADR-015） |
| evaluations | Evaluation | session, rubric, engine, model_version, status, total_score | 推定値 / 公式評定ではない |
| evaluations | CriterionResult | evaluation, criterion, score, confidence, evidence_ref | (evaluation, criterion)一意 |

※ Djangoのフィールド実装は「所有者の参照を含む一意制約」「事前にvalidateした循環のないグラフ」「状態遷移Service経由のみ更新」を前提とする。DB制約だけではDAGの循環防止や所有者横断参照までは自動保証できないのでService層・テストで補完する。

## 2. Lessonの階層
指導要領の階層は`CurriculumItem`。アプリ上の学習粒度は`Lesson.parent`自己参照で自由に深くできる。複数小単元選択を`SessionLesson`で表す。単元全体が選択されたとき、対象となる末端小単元を再帰的に展開して`SessionLesson`へ確定記録する。

## 3. Conceptと前提関係
`Concept.description`は知識マップのノード詳細に出す、ユーザー向けの短い説明（1〜2文）。習得条件の文章は保存せず、画面が`MasteryPolicy`の数値から作る（ADR-023 A6）。

`ConceptPrerequisite(concept=A, prerequisite=B)`は「B→A：BがAの前提」を意味する。前提知識は許可技能の判定に使うが、Aの習得済み状態を自動付与しない。
`LessonConcept`は複数のLessonと同一Conceptを結ぶ。同じ基礎技能を各単元で別々に保存しない。

## 4. PeerKnowledgeの状態遷移
- 変更主体：`PeerKnowledgeService`のみ。
- 許可された遷移：`UNKNOWN→INTRODUCED→PRACTICING→MASTERED`、リセット時の`→UNKNOWN`。
- `INTRODUCED`は教材範囲内の妥当な説明を受け取った記録。
- `PRACTICING`にした技能は限定的な演習に使える。使用可否は前提技能・ユーザー説明判定・分野別ルールにも依存。
- `MASTERED`は`MasteryEvidence`とMasteryPolicyで根拠を示せる場合のみ。
- リセット時に`PeerKnowledge.reset_epoch += 1`と`Peer.knowledge_version += 1`。旧世代の演習・証拠は新しい習得計算に含めない。

## 5. Evidenceの最小化
習得の証拠として長期保存するのは`verified_at`、`problem_family/variant_code`、`correctness`、`used_concepts`、`validation_method`、`reset_epoch`などのメタデータ。原問題文・会話全文・手書きの解答全文を永続化する場合は別途同意と保持目的の検討が必要。

## 6. 退会に伴う参照削除
個人に属する`LearningSession`、`Peer`、`PeerKnowledge`、評価、私有教材等を連鎖削除またはジョブで順次削除。`CURATED`教材は共有マスターなので削除しない。`DeletionRequest`の最小限の追跡情報は期限を設ける。削除失敗は匿名化したジョブIDで再実行できるようにする。

## 7. インデックス候補
- `PeerKnowledge(peer_id, status)`
- `Lesson(parent_id, sort_order, status)`
- `CurriculumItem(revision_id, parent_id)`
- `LearningSession(owner_id, created_at DESC)`（ホームの「最近の授業」`GET /sessions/`で使う）
- `LearningTurn(session_id, request_id)` UNIQUE
- `MasteryEvidence(peer_id, concept_id, reset_epoch, variant_code)`
- `ExerciseAttempt(exercise_id, verified_at)`
- `DeletionRequest(state, requested_at)`

## 8. 注意：MVPでのモデルの段階導入
M1でUser/Peer/Lesson/Concept/Sessionを先行し、M3で`LearningTurn`/`ExerciseAttempt`/`MasteryEvidence`、評価時に`Rubric`等を追加してもよい。ただし`AUTH_USER_MODEL`は**初回マイグレーション前に確定する**。
