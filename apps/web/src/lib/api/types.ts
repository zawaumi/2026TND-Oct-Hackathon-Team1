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

/** 送信の結果。処理中（202）のときは pending */
export type TurnResult =
  | { kind: "done"; data: MessageResponse }
  | { kind: "pending"; retryAfterMs: number };

/** 画面が使うAPI。本物（fetch）とモックで同じ形にする */
export interface ApiClient {
  getMe(): Promise<Profile>;
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
  finishSession(sessionId: number): Promise<{ session_id: number; status: "evaluation_pending" | "evaluation_complete" }>;
}
