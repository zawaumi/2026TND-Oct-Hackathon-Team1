/**
 * 固定データ（すべて架空）。各値は対応する API のレスポンス本文。
 * ID は画面間で揃える: 教材1 / 概念101 / セッション1 / 問題201 / 挑戦301。
 * 型を付けているので、api.ts の型（= openapi.yaml 1.1.0-draft）とずれるとコンパイルで落ちる。
 */
import type {
  Attempt,
  EvaluationReport,
  Exercise,
  FinishResponse,
  KnowledgeGraph,
  KnowledgeState,
  LessonList,
  Peer,
  Profile,
  Session,
  SessionList,
  TurnResponse,
} from "../api";

export const LESSON_ID = 1;
export const CONCEPT_ID = 101;
export const SESSION_ID = 1;
export const EXERCISE_ID = 201;
export const UNSUPPORTED_EXERCISE_ID = 202;
export const REQUIRED_CORRECT = 2;
/** 授業1だけが存在する。他の lesson_ids は黙って成功させず 400 にする */
export const KNOWN_LESSON_IDS: readonly number[] = [1];

export const lessons: LessonList = {
  results: [
    {
      id: 1,
      parent_id: null,
      title: "等式の性質",
      grade: 1,
      mode: "preset",
      published: true,
      concept_ids: [101],
    },
  ],
};

export const session: Session = {
  id: 1,
  status: "active",
  mode: "preset",
  lesson_ids: [1],
  knowledge_version: 1,
};

export const knowledge: KnowledgeState = {
  knowledge_version: 1,
  items: [
    {
      concept_id: 101,
      status: "INTRODUCED",
      verified_correct: 0,
      required_correct: 2,
      reset_epoch: 0,
    },
  ],
};

/** request_id は要求値で必ず上書きする（固定値のまま返さない） */
export const turnTemplate: TurnResponse = {
  request_id: "00000000-0000-4000-8000-000000000001",
  turn_id: 1,
  knowledge_version: 1,
  peer_response: {
    action: "ask_why",
    concept_id: 101,
    message: "どうして両辺に同じ数を足しても等式が成り立つの？",
    emotion: "question",
  },
  knowledge_changes: [],
  fallback_used: false,
};

/** 74 = (80×40 + 66×30) ÷ 70 。clarity は評価保留（0点にしない） */
export const evaluation: EvaluationReport = {
  status: "PARTIAL",
  score_label: "ぴあとも独自の説明力スコア",
  total_score: 74,
  rubric_version: "draft-2",
  criterion_results: [
    {
      code: "accuracy",
      label: "正確さ",
      weight: 40,
      status: "SCORED",
      score: 80,
      explanation: "両辺に同じ操作をする理由を説明できました。",
    },
    {
      code: "logic",
      label: "論理性",
      weight: 30,
      status: "SCORED",
      score: 66,
      explanation: "割り算の理由が抜けていました。",
    },
    {
      code: "clarity",
      label: "分かりやすさ",
      weight: 30,
      status: "UNRATED",
      score: null,
      explanation: "材料が足りないため評価していません。",
    },
  ],
  mastered_concept_ids: [],
  knowledge_changes: [
    { concept_id: 101, old_status: "INTRODUCED", new_status: "PRACTICING" },
  ],
  next_lesson_ids: [1],
  strengths: ["具体的な式（x + 3 = 7）を使って説明できた"],
};

export const peer: Peer = {
  id: 1,
  name: "ぴあ友",
  avatar_id: "default",
  knowledge_version: 1,
};

export const knowledgeGraph: KnowledgeGraph = {
  nodes: [
    {
      id: 101,
      code: "equality-property",
      label: "等式の性質",
      description:
        "等式の両辺に同じ数をたしても、ひいても、等式は成り立つという性質。",
      status: "INTRODUCED",
    },
  ],
  edges: [],
};

export const recentSessions: SessionList = {
  results: [
    {
      id: 1,
      status: "finished",
      mode: "preset",
      lesson_ids: [1],
      started_at: "2026-10-31T10:00:00+09:00",
      finished_at: "2026-10-31T10:12:00+09:00",
      total_score: 74,
    },
  ],
};

export const profile: Profile = {
  id: 1,
  nickname: "あお",
  school_level: "middle",
  grade: 1,
  onboarding_completed: true,
};

export const exerciseVerified: Exercise = {
  id: 201,
  kind: "math_equation",
  verification_status: "VERIFIED",
  target_concept_id: 101,
};
export const exerciseUnsupported: Exercise = {
  id: 202,
  kind: "math_equation",
  verification_status: "UNSUPPORTED",
  reason: "対応範囲外です。",
  target_concept_id: 101,
};

const stepsCorrect: Attempt["steps"] = [
  { expr: "x+3=7", skill: null, skill_label: null },
  { expr: "x=4", skill: "subtract_both_sides", skill_label: "両辺から同じ数をひく" },
];

/** 1問だけで MASTERED に見せない: knowledge_changes は空 */
export const attemptCorrect: Attempt = {
  id: 301,
  result: "correct",
  reason: null,
  blocked_skill: null,
  verification_status: "VERIFIED",
  steps: stepsCorrect,
  knowledge_changes: [],
  knowledge_version: 1,
};
/** 同じ形の2問目: 正解だが回数に入らない（docs/04 5.4） */
export const attemptDuplicateForm: Attempt = {
  ...attemptCorrect,
  id: 302,
  reason: "duplicate_form",
};
/** 教わっていない技能が必要: 回数は増えない。steps は止まった行まで */
export const attemptBlocked: Attempt = {
  id: 303,
  result: "blocked",
  reason: null,
  blocked_skill: "両辺に同じ数をかける",
  verification_status: "VERIFIED",
  steps: [{ expr: "x/2=3", skill: null, skill_label: null }],
  knowledge_changes: [],
  knowledge_version: 1,
};

export const finishResponse: FinishResponse = {
  session_id: 1,
  status: "evaluation_pending",
};
