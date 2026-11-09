/**
 * 画面づくり用のモックAPI。本物のAPI（#6 ほか）ができるまでの仮のもの。
 * 会話の内容は固定の台本で、AIは呼ばない。
 *
 * 動作確認用の合図（送る文章に含める）：
 * - "#202"    … いったん「処理中」を返し、少し待つと応答が届く
 * - "#409"    … 状態の競合（409）を返す
 * - "#neterr" … 1回目だけ通信エラー。同じ request_id で再送すると届く
 * - "#mastered" … 「移項」が習得済みになる（帯とアバターの確認用）
 */
import {
  ApiError,
  type ApiClient,
  type ConceptNode,
  type KnowledgeChange,
  type LearningSession,
  type EvaluationReport,
  type Lesson,
  type MessageResponse,
  type PeerKnowledge,
  type PeerResponse,
  type Profile,
  type SessionSummary,
  type TurnResult,
} from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 領域 → 単元 → 小単元。公開している小単元は3つだけ（ADR-028）
const LESSONS: Lesson[] = [
  { id: 20, parent_id: null, title: "数と式", grade: 1, mode: "preset", published: true, concept_ids: [] },
  { id: 10, parent_id: 20, title: "一次方程式", grade: 1, mode: "preset", published: true, concept_ids: [] },
  { id: 1, parent_id: 10, title: "等式の性質", grade: 1, mode: "preset", published: true, concept_ids: [101] },
  { id: 2, parent_id: 10, title: "方程式の解法", grade: 1, mode: "preset", published: true, concept_ids: [101, 102] },
  { id: 3, parent_id: 10, title: "移項", grade: 1, mode: "preset", published: true, concept_ids: [103] },
];

const CONCEPTS: Omit<ConceptNode, "status">[] = [
  { id: 101, code: "M1-EQ-PROP", label: "等式の性質", description: "両辺に同じ操作をしても等式は成り立つ" },
  { id: 102, code: "M1-EQ-SOLVE", label: "方程式の解法", description: "等式の性質を使って x = の形にする" },
  { id: 103, code: "M1-EQ-TRANS", label: "移項", description: "項の符号を変えて反対側の辺へ移す" },
];

let knowledgeVersion = 7;
const knowledge = new Map<number, PeerKnowledge>([
  [101, { concept_id: 101, status: "MASTERED", verified_correct: 2, required_correct: 2 }],
  [102, { concept_id: 102, status: "INTRODUCED", verified_correct: 0, required_correct: 2 }],
  [103, { concept_id: 103, status: "PRACTICING", verified_correct: 1, required_correct: 2 }],
]);

type Script = { peer: PeerResponse; change?: Omit<KnowledgeChange, "old_status"> };

const SCRIPT: Script[] = [
  {
    peer: { action: "ask_why", concept_id: 103, emotion: "question", message: "どうして反対側に移すと、符号が変わるんですか？" },
  },
  {
    peer: { action: "request_example", concept_id: 103, emotion: "question", message: "なるほど！じゃあ、2x − 5 = 9 だとどうなりますか？" },
  },
  {
    peer: {
      action: "explain_back",
      concept_id: 102,
      emotion: "practice_success",
      message: "わかってきました！方程式は、等式の性質を使って x = の形にすればいいんですね。",
    },
    change: { concept_id: 102, new_status: "PRACTICING" },
  },
  {
    peer: { action: "contrast_cases", concept_id: 103, emotion: "question", message: "x + 3 = 7 と 3x = 12 では、移し方はどう違うんですか？" },
  },
  {
    peer: { action: "check_prerequisite", concept_id: 101, emotion: "question", message: "移項って、等式の性質とどうつながっているんですか？" },
  },
];

const PROFILE: Profile = { id: 1, nickname: "テストユーザー", school_level: "middle", grade: 1, onboarding_completed: true };

const sessions = new Map<number, LearningSession>();
const history: SessionSummary[] = [
  { id: 1, status: "finished", mode: "preset", lesson_ids: [1], started_at: "2026-11-08T10:00:00+09:00", finished_at: "2026-11-08T10:20:00+09:00", total_score: 72 },
];
let nextSessionId = 2;

let scriptIndex = 0;
const answered = new Map<string, MessageResponse>();
const pending = new Map<string, number>(); // request_id → 残りの「処理中」回数
const failedOnce = new Set<string>();
let turnId = 100;

function applyChange(c: Omit<KnowledgeChange, "old_status">): KnowledgeChange | null {
  const k = knowledge.get(c.concept_id);
  if (!k || k.status === c.new_status) return null;
  const change = { concept_id: c.concept_id, old_status: k.status, new_status: c.new_status };
  k.status = c.new_status;
  if (c.new_status === "MASTERED") k.verified_correct = k.required_correct;
  knowledgeVersion += 1;
  return change;
}

function makeResponse(requestId: string, content: string): MessageResponse {
  let script: Script;
  if (content.includes("#mastered")) {
    script = {
      peer: { action: "explain_back", concept_id: 103, emotion: "mastery_success", message: "できました！移項のしくみがわかりました！" },
      change: { concept_id: 103, new_status: "MASTERED" },
    };
  } else {
    script = SCRIPT[scriptIndex % SCRIPT.length];
    scriptIndex += 1;
  }
  const change = script.change ? applyChange(script.change) : null;
  turnId += 1;
  return {
    request_id: requestId,
    turn_id: turnId,
    knowledge_version: knowledgeVersion,
    peer_response: script.peer,
    knowledge_changes: change ? [change] : [],
    fallback_used: false,
  };
}

/** 授業ごとの知識の変化（レポート用） */
const sessionChanges = new Map<number, KnowledgeChange[]>();
const evaluationPolls = new Map<number, number>();
function record(sessionId: number, res: MessageResponse): MessageResponse {
  const list = sessionChanges.get(sessionId) ?? [];
  list.push(...res.knowledge_changes);
  sessionChanges.set(sessionId, list);
  return res;
}
/** 同じ概念の変化をまとめ、最初の「前」と最後の「後」にする */
function mergeChanges(list: KnowledgeChange[]): KnowledgeChange[] {
  const byId = new Map<number, KnowledgeChange>();
  for (const c of list) {
    const prev = byId.get(c.concept_id);
    byId.set(c.concept_id, prev ? { ...prev, new_status: c.new_status } : { ...c });
  }
  return [...byId.values()].filter((c) => c.old_status !== c.new_status);
}

/**
 * 評価のモック。授業のIDで結果を変えられる（README）。
 * 98：評価できなかった（UNAVAILABLE） 99：3観点すべて評価保留 それ以外：分かりやすさだけ評価保留
 */
function makeEvaluation(sessionId: number): EvaluationReport {
  const recorded = sessionChanges.get(sessionId);
  const changes = recorded
    ? mergeChanges(recorded)
    : [{ concept_id: 102, old_status: "INTRODUCED" as const, new_status: "PRACTICING" as const }];
  const base = {
    score_label: "ぴあとも独自の説明力スコア",
    rubric_version: "draft-2",
    mastered_concept_ids: [...knowledge.values()].filter((k) => k.status === "MASTERED").map((k) => k.concept_id),
    knowledge_changes: changes,
    next_lesson_ids: [3, 2],
  };
  if (sessionId === 98) {
    return { ...base, status: "UNAVAILABLE", total_score: null, criterion_results: [], strengths: [] };
  }
  if (sessionId === 99) {
    return {
      ...base,
      status: "PARTIAL",
      total_score: null,
      strengths: [],
      criterion_results: (["accuracy", "logic", "clarity"] as const).map((code, i) => ({
        code,
        label: ["正確さ", "論理性", "分かりやすさ"][i],
        weight: [40, 30, 30][i],
        status: "UNRATED" as const,
        score: null,
        explanation: "材料が足りないため評価していません",
      })),
    };
  }
  return {
    ...base,
    status: "PARTIAL",
    total_score: 74,
    strengths: [
      "具体的な式（x + 3 = 7）を使って説明できた",
      "移項と等式の性質を結びつけて説明できた",
      "ぴあ友の質問に、順を追って答えられた",
    ],
    criterion_results: [
      { code: "accuracy", label: "正確さ", weight: 40, status: "SCORED", score: 80, explanation: "移項の説明と、質問への答えは正確でした" },
      {
        code: "logic",
        label: "論理性",
        weight: 30,
        status: "SCORED",
        score: 66,
        explanation: "割り算も等式の性質（両辺を同じ数でわっても等しい）で説明できます",
      },
      { code: "clarity", label: "分かりやすさ", weight: 30, status: "UNRATED", score: null, explanation: "材料が足りないため評価していません" },
    ],
  };
}

export const mockClient: ApiClient = {
  async getEvaluation(sessionId) {
    await wait(300);
    // 1回目は「評価中」を返す
    const n = evaluationPolls.get(sessionId) ?? 0;
    evaluationPolls.set(sessionId, n + 1);
    if (n === 0) return { kind: "pending", retryAfterMs: 1500 };
    return { kind: "done", data: makeEvaluation(sessionId) };
  },
  async getMe() {
    await wait(150);
    return { ...PROFILE };
  },
  async getLessons(q) {
    await wait(250);
    // 中学1年の数学だけ公開中。それ以外は空
    if ((q.school_level ?? "middle") !== "middle") return [];
    if (q.grade != null && q.grade !== 1) return [];
    if (q.subject && q.subject !== "math") return [];
    return LESSONS.map((l) => ({ ...l }));
  },
  async listSessions(limit) {
    await wait(150);
    return history.slice(0, limit);
  },
  async createSession(lessonIds) {
    await wait(500);
    if (lessonIds.length === 0 || lessonIds.length > 10) throw new ApiError(400, "INVALID_LESSONS", "小単元の数が正しくありません");
    const s: LearningSession = {
      id: nextSessionId++,
      status: "active",
      mode: "preset",
      lesson_ids: lessonIds,
      knowledge_version: knowledgeVersion,
      started_at: new Date().toISOString(),
    };
    sessions.set(s.id, s);
    history.unshift({ id: s.id, status: "active", mode: "preset", lesson_ids: lessonIds, started_at: new Date().toISOString() });
    return s;
  },
  async getSession(sessionId) {
    await wait(200);
    if (!(sessionId > 0)) throw new ApiError(404, "NOT_FOUND", "授業が見つかりません");
    return (
      sessions.get(sessionId) ?? {
        id: sessionId,
        status: "active",
        mode: "preset",
        lesson_ids: [2, 3],
        knowledge_version: knowledgeVersion,
        started_at: "2026-10-31T16:00:00+09:00",
      }
    );
  },
  async getLesson(lessonId) {
    await wait(100);
    const lesson = LESSONS.find((l) => l.id === lessonId);
    if (!lesson) throw new ApiError(404, "NOT_FOUND", "小単元が見つかりません");
    return lesson;
  },
  async getPeerKnowledge() {
    await wait(150);
    return { knowledge_version: knowledgeVersion, items: [...knowledge.values()].map((k) => ({ ...k })) };
  },
  async getKnowledgeGraph() {
    await wait(150);
    return {
      nodes: CONCEPTS.map((c) => ({ ...c, status: knowledge.get(c.id)?.status ?? "UNKNOWN" })),
      edges: [
        { source: 101, target: 102, relation: "prerequisite" },
        { source: 101, target: 103, relation: "prerequisite" },
      ],
    };
  },
  async postMessage(sessionId, body): Promise<TurnResult> {
    await wait(900);
    const { request_id: id, content } = body;
    if (content.includes("#409")) throw new ApiError(409, "STALE_KNOWLEDGE_VERSION", "状態が更新されました。最新情報を取得してください。");
    if (content.includes("#neterr") && !failedOnce.has(id)) {
      failedOnce.add(id);
      throw new ApiError(0, "NETWORK_ERROR", "通信できませんでした");
    }
    const done = answered.get(id);
    if (done) return { kind: "done", data: done };
    if (content.includes("#202") && !pending.has(id)) {
      pending.set(id, 1);
      answered.set(id, record(sessionId, makeResponse(id, content)));
      return { kind: "pending", retryAfterMs: 1200 };
    }
    const res = record(sessionId, makeResponse(id, content));
    answered.set(id, res);
    return { kind: "done", data: res };
  },
  async getTurn(_sessionId, requestId): Promise<TurnResult> {
    await wait(300);
    const left = pending.get(requestId) ?? 0;
    if (left > 0) {
      pending.set(requestId, left - 1);
      return { kind: "pending", retryAfterMs: 1200 };
    }
    const done = answered.get(requestId);
    if (!done) throw new ApiError(404, "NOT_FOUND", "見つかりません");
    return { kind: "done", data: done };
  },
  async finishSession(sessionId) {
    await wait(500);
    return { session_id: sessionId, status: "evaluation_pending" };
  },
};
