/**
 * 画面から呼ぶ共通APIクライアント（OpenAPI v1.1.0-draft 準拠）。
 *
 * - 実API と モック は「同じ実装（このファイル）」を通る。違うのは fetch の差し替え先だけ。
 *   → 戻り型・エラー型は常に同じ。画面は mock かどうかを意識しない。
 * - 切替: NEXT_PUBLIC_API_MOCK=true（開発用 .env.local のみ）。本番成果物では未設定か false。
 * - 秘密情報を NEXT_PUBLIC_* に入れない。
 */

/* ------------------------------------------------------------------ */
/* 型（docs/glossary.md の用語に合わせる）                             */
/* ------------------------------------------------------------------ */

export type SchoolLevel = "middle" | "high";
export type LearningMode = "preset" | "free" | "inquiry";
export type ConceptStatus = "UNKNOWN" | "INTRODUCED" | "PRACTICING" | "MASTERED";
export type SessionStatus = "active" | "finished";
export type PeerAction =
  | "ask_why"
  | "request_example"
  | "check_prerequisite"
  | "contrast_cases"
  | "attempt_exercise"
  | "explain_back";
export type AvatarEmotion =
  | "idle"
  | "listening"
  | "thinking"
  | "question"
  | "practice_success"
  | "mastery_success";

export interface Profile {
  id: number;
  nickname: string;
  school_level: SchoolLevel;
  grade: number;
  onboarding_completed: boolean;
}
export interface OnboardingRequest {
  nickname: string;
  school_level: SchoolLevel;
  grade: number;
  /** 同意の版。契約上の正式名は openapi.yaml で要照合 */
  consent_version?: string;
}

export interface Lesson {
  id: number;
  parent_id: number | null;
  title: string;
  grade: number | null;
  mode: LearningMode;
  published: boolean;
  concept_ids: number[];
}
export interface LessonList {
  results: Lesson[];
}

export interface Peer {
  id: number;
  name: string;
  avatar_id: string;
  knowledge_version: number;
}
export interface KnowledgeItem {
  concept_id: number;
  status: ConceptStatus;
  verified_correct: number;
  required_correct: number;
  reset_epoch: number;
}
export interface KnowledgeState {
  knowledge_version: number;
  items: KnowledgeItem[];
}
export interface KnowledgeNode {
  id: number;
  code: string;
  label: string;
  description: string;
  status: ConceptStatus;
}
export interface KnowledgeEdge {
  prerequisite: number;
  concept: number;
  kind?: "prerequisite" | "related";
}
export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface Session {
  id: number;
  status: SessionStatus;
  mode: LearningMode;
  lesson_ids: number[];
  knowledge_version: number;
}
export interface SessionSummary {
  id: number;
  status: SessionStatus;
  mode: LearningMode;
  lesson_ids: number[];
  started_at: string;
  finished_at: string | null;
  total_score: number | null;
}
export interface SessionList {
  results: SessionSummary[];
}
export interface CreateSessionRequest {
  mode: LearningMode;
  lesson_ids: number[];
}

export interface KnowledgeChange {
  concept_id: number;
  old_status: ConceptStatus;
  new_status: ConceptStatus;
}
export interface TurnResponse {
  request_id: string;
  turn_id: number;
  knowledge_version: number;
  peer_response: {
    action: PeerAction;
    concept_id: number;
    message: string;
    emotion: AvatarEmotion;
  };
  knowledge_changes: KnowledgeChange[];
  fallback_used: boolean;
}
export interface SendMessageRequest {
  /** 送信ごとに画面が作る一意なID（冪等キー） */
  request_id: string;
  message: string;
}

export type VerificationStatus = "VERIFIED" | "PROVISIONAL" | "UNSUPPORTED";
export interface Exercise {
  id: number;
  kind: string;
  verification_status: VerificationStatus;
  target_concept_id: number;
  reason?: string;
}
export interface CreateExerciseRequest {
  latex: string;
  question?: string;
  target_concept_id?: number;
}
export interface AttemptStep {
  expr: string;
  skill: string | null;
  skill_label: string | null;
}
export interface Attempt {
  id: number;
  result: "correct" | "incorrect" | "blocked" | "unverified";
  reason: string | null; // 例: "duplicate_form"
  blocked_skill: string | null;
  verification_status: VerificationStatus;
  steps: AttemptStep[];
  knowledge_changes: KnowledgeChange[];
  knowledge_version: number;
}

export interface CriterionResult {
  code: "accuracy" | "logic" | "clarity";
  label: string;
  weight: number;
  status: "SCORED" | "UNRATED";
  score: number | null;
  explanation: string;
}
export interface EvaluationReport {
  status: "COMPLETE" | "PARTIAL" | "UNRATED"; // 要照合: openapi.yaml の enum
  score_label: string;
  total_score: number | null;
  rubric_version: string;
  criterion_results: CriterionResult[];
  mastered_concept_ids: number[];
  knowledge_changes: KnowledgeChange[];
  next_lesson_ids: number[];
  strengths: string[];
}

/** 202 の本文 */
export interface PendingBody {
  status: "processing" | "evaluation_pending";
  request_id?: string;
}
/** 200 か 202 かを画面が区別するための戻り型 */
export type Polled<T> =
  | { ready: true; data: T }
  | { ready: false; pending: PendingBody };

export interface FinishResponse {
  session_id: number;
  status: "evaluation_pending";
}

/* ------------------------------------------------------------------ */
/* エラー型（HTTPエラーと通信例外を別クラスにする）                    */
/* ------------------------------------------------------------------ */

/** HTTP レスポンスが返ったエラー（401 / 404 / 409 / 5xx など） */
export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
/** HTTP レスポンスが得られなかった（オフライン・DNS・CORS・タイムアウトなど） */
export class NetworkError extends Error {
  readonly name = "NetworkError";
  constructor(readonly cause?: unknown) {
    super("通信できませんでした");
  }
}
export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isNetworkError = (e: unknown): e is NetworkError =>
  e instanceof NetworkError;
export const isUnauthorized = (e: unknown) => isApiError(e) && e.status === 401;
export const isNotFound = (e: unknown) => isApiError(e) && e.status === 404;

/* ------------------------------------------------------------------ */
/* クライアントのインターフェース                                      */
/* ------------------------------------------------------------------ */

export interface ApiClient {
  getMe(): Promise<Profile>;
  /** created=true: 201（初回） / false: 200（登録済みの再送） */
  completeOnboarding(
    body: OnboardingRequest,
  ): Promise<{ created: boolean; profile: Profile }>;
  getPeer(): Promise<Peer>;
  getKnowledge(): Promise<KnowledgeState>;
  getKnowledgeGraph(params?: { lesson_id?: number }): Promise<KnowledgeGraph>;
  listLessons(params?: { grade?: number }): Promise<LessonList>;
  getLesson(lessonId: number): Promise<Lesson>;
  listSessions(params?: { limit?: number }): Promise<SessionList>;
  createSession(body: CreateSessionRequest): Promise<Session>; // 201
  getSession(sessionId: number): Promise<Session>;
  /** 200 → ready:true / 202 → ready:false（処理中。同じ request_id で再送して取り直す） */
  sendMessage(
    sessionId: number,
    body: SendMessageRequest,
  ): Promise<Polled<TurnResponse>>;
  createExercise(
    sessionId: number,
    body: CreateExerciseRequest,
  ): Promise<Exercise>; // 201
  attemptExercise(exerciseId: number): Promise<Attempt>; // 200
  finishSession(sessionId: number): Promise<FinishResponse>; // 202
  /** 200 → ready:true / 202 → ready:false（評価中。数秒おきに取り直す） */
  getEvaluation(sessionId: number): Promise<Polled<EvaluationReport>>;
}

/* ------------------------------------------------------------------ */
/* 実装（実API・モック共通）                                           */
/* ------------------------------------------------------------------ */

const BASE = "/api/v1";

let tokenProvider: (() => Promise<string | null>) | null = null;
/** Firebase の user.getIdToken() を返す関数を登録する（#10 で接続） */
export function setAuthTokenProvider(fn: (() => Promise<string | null>) | null) {
  tokenProvider = fn;
}

// 本番ビルドでモックが有効なまま作られるのを防ぐ。
// どうしても本番モードの build でモックを使う場合（公開先を分けたステージング）だけ ACK を要求する。
if (
  process.env.NEXT_PUBLIC_API_MOCK === "true" &&
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_MOCK_BUILD_ACK !== "staging-only"
) {
  throw new Error(
    "NEXT_PUBLIC_API_MOCK=true は本番ビルドでは使えません（docs: apps/web/src/lib/mocks/README.md）",
  );
}

/**
 * 重要: 条件式を process.env.NEXT_PUBLIC_API_MOCK の直接比較にしておく。
 * こうするとビルド時に分岐ごと消え、本番成果物に mocks/ が入らない
 * （scripts/check-no-mock.mjs が out/ を検査する）。
 */
const transport: typeof fetch =
  process.env.NEXT_PUBLIC_API_MOCK === "true"
    ? async (input, init) => {
        const { mockFetch } = await import("./mocks/mock-api");
        return mockFetch(input, init);
      }
    : (input, init) => fetch(input, init);

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function call(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await transport(`${BASE}${path}${qs(opts.query)}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new NetworkError(e); // HTTPレスポンスなし
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const b = (data ?? {}) as { code?: string; message?: string };
    throw new ApiError(res.status, b.code ?? "HTTP_ERROR", b.message ?? `HTTP ${res.status}`);
  }
  return { status: res.status, data };
}

const polled = <T>(r: { status: number; data: unknown }): Polled<T> =>
  r.status === 202
    ? { ready: false, pending: r.data as PendingBody }
    : { ready: true, data: r.data as T };

export const api: ApiClient = {
  getMe: async () => (await call("GET", "/users/me/")).data as Profile,
  completeOnboarding: async (body) => {
    const r = await call("POST", "/onboarding/complete/", { body });
    return { created: r.status === 201, profile: r.data as Profile };
  },
  getPeer: async () => (await call("GET", "/peers/me/")).data as Peer,
  getKnowledge: async () =>
    (await call("GET", "/peers/me/knowledge/")).data as KnowledgeState,
  getKnowledgeGraph: async (p) =>
    (await call("GET", "/knowledge-graph/", { query: p })).data as KnowledgeGraph,
  listLessons: async (p) =>
    (await call("GET", "/lessons/", { query: p })).data as LessonList,
  getLesson: async (id) => (await call("GET", `/lessons/${id}/`)).data as Lesson,
  listSessions: async (p) =>
    (await call("GET", "/sessions/", { query: p })).data as SessionList,
  createSession: async (body) =>
    (await call("POST", "/sessions/", { body })).data as Session,
  getSession: async (id) => (await call("GET", `/sessions/${id}/`)).data as Session,
  sendMessage: async (id, body) =>
    polled<TurnResponse>(await call("POST", `/sessions/${id}/messages/`, { body })),
  createExercise: async (id, body) =>
    (await call("POST", `/sessions/${id}/exercises/`, { body })).data as Exercise,
  attemptExercise: async (id) =>
    (await call("POST", `/exercises/${id}/attempt/`)).data as Attempt,
  finishSession: async (id) =>
    (await call("POST", `/sessions/${id}/finish/`)).data as FinishResponse,
  getEvaluation: async (id) =>
    polled<EvaluationReport>(await call("GET", `/sessions/${id}/evaluation/`)),
};
