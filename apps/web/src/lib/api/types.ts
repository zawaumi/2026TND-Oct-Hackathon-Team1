import type { components } from "./schema";

export type Schemas = components["schemas"];
export type Lesson = Schemas["Lesson"];
export type LearningSession = Schemas["LearningSession"];
export type PeerKnowledge = Schemas["PeerKnowledge"];
export type ConceptNode = Schemas["ConceptNode"];
export type ConceptEdge = Schemas["ConceptEdge"];
export type MessageResponse = Schemas["MessageResponse"];
export type PeerResponse = Schemas["PeerResponse"];
export type KnowledgeChange = Schemas["KnowledgeChange"];
export type Profile = Schemas["Profile"];
export type SchoolLevel = Schemas["SchoolLevel"];
export type SessionSummary = Schemas["SessionSummary"];
export type EvaluationReport = Schemas["EvaluationReport"];
export type EvaluationCriterion = Schemas["EvaluationCriterion"];
export type Peer = Schemas["Peer"];
export type OnboardingRequest = Schemas["OnboardingRequest"];
export type ExerciseCreateRequest = Schemas["ExerciseCreateRequest"];
export type Exercise = Schemas["Exercise"];
export type ExerciseAttempt = Schemas["ExerciseAttempt"];

/** ぴあ友の解答の取得結果。処理中（202）のときは pending */
export type AttemptResult = { kind: "done"; data: ExerciseAttempt } | { kind: "pending"; retryAfterMs: number };

/** 評価の取得結果。評価中（202）のときは pending */
export type EvaluationResult = { kind: "done"; data: EvaluationReport } | { kind: "pending"; retryAfterMs: number };

/** GET /lessons/ の絞り込み（ADR-031） */
export type LessonQuery = {
  school_level?: SchoolLevel;
  grade?: number;
  subject?: string;
};

/** APIのエラー。status が 0 のときは通信できなかった（ネットワークの失敗） */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** ログインが切れた・まだしていない（401）→ ログイン画面へ（docs/04 の 10） */
export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401;
/** 見つからない・本人のものではない（404） */
export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;
/** ログインはしているが、初回設定がまだ（403 ONBOARDING_REQUIRED）→ 初回設定の画面へ（docs/04 の 9） */
export const isOnboardingRequired = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code === "ONBOARDING_REQUIRED";
/** 通信できなかった（応答がない）→「通信できませんでした」と「もう一度」 */
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

/** 送信の結果。処理中（202）のときは pending */
export type TurnResult =
  | { kind: "done"; data: MessageResponse }
  | { kind: "pending"; retryAfterMs: number };

/** 画面が使うAPI。本物（fetch）とモックで同じ形にする */
export interface ApiClient {
  getMe(): Promise<Profile>;
  /** 初回登録。created は初めての登録（201）なら true、登録済み（200）なら false */
  completeOnboarding(body: OnboardingRequest): Promise<{ created: boolean; profile: Profile }>;
  getPeer(): Promise<Peer>;
  getLessons(query: LessonQuery): Promise<Lesson[]>;
  listSessions(limit: number): Promise<SessionSummary[]>;
  createSession(lessonIds: number[]): Promise<LearningSession>;
  getSession(sessionId: number): Promise<LearningSession>;
  getLesson(lessonId: number): Promise<Lesson>;
  getPeerKnowledge(): Promise<{ knowledge_version: number; items: PeerKnowledge[] }>;
  getKnowledgeGraph(lessonId?: number): Promise<{ nodes: ConceptNode[]; edges: ConceptEdge[] }>;
  postMessage(sessionId: number, body: Schemas["MessageRequest"]): Promise<TurnResult>;
  getTurn(sessionId: number, requestId: string): Promise<TurnResult>;
  getEvaluation(sessionId: number): Promise<EvaluationResult>;
  /** 問題を出す（docs/04 の 5.4）。検証状態つきで返る */
  createExercise(sessionId: number, body: ExerciseCreateRequest): Promise<Exercise>;
  /** ぴあ友が問題に挑戦する。requestId で冪等（同じ送信の再送は同じ結果） */
  attemptExercise(exerciseId: number, requestId: string): Promise<AttemptResult>;
  finishSession(sessionId: number): Promise<{ session_id: number; status: "evaluation_pending" | "evaluation_complete" }>;
}
