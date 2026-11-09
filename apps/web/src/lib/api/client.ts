import {
  ApiError,
  type ApiClient,
  type EvaluationReport,
  type Lesson,
  type MessageResponse,
  type Schemas,
  type SessionSummary,
  type TurnResult,
} from "./types";
import { mockClient } from "./mock";

export * from "./types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

/**
 * ログインのトークンを返す関数。#10（Firebase Authentication）で差し込む。
 * それまでは何も付けない。
 */
let getIdToken: () => Promise<string | null> = async () => null;
export function setIdTokenProvider(fn: () => Promise<string | null>) {
  getIdToken = fn;
}

function retryAfterMs(res: Response): number {
  const sec = Number(res.headers.get("Retry-After"));
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 1500;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "通信できませんでした");
  }
  if (res.ok) return res;
  let code = `HTTP_${res.status}`;
  let message = "エラーが起きました";
  try {
    const body = (await res.json()) as Partial<Schemas["ApiError"]>;
    if (body.code) code = body.code;
    if (body.message) message = body.message;
  } catch {
    // 本文がJSONでないときは既定の文言のまま
  }
  throw new ApiError(res.status, code, message);
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init);
  return (await res.json()) as T;
}

async function turn(path: string, init?: RequestInit): Promise<TurnResult> {
  const res = await request(path, init);
  if (res.status === 202) return { kind: "pending", retryAfterMs: retryAfterMs(res) };
  return { kind: "done", data: (await res.json()) as MessageResponse };
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const str = q.toString();
  return str ? `?${str}` : "";
}

const httpClient: ApiClient = {
  getMe: () => json(`/users/me/`),
  getLessons: async (q) => (await json<{ results: Lesson[] }>(`/lessons/${query(q)}`)).results,
  listSessions: async (limit) => (await json<{ results: SessionSummary[] }>(`/sessions/${query({ limit })}`)).results,
  createSession: (lessonIds) =>
    json(`/sessions/`, { method: "POST", body: JSON.stringify({ mode: "preset", lesson_ids: lessonIds }) }),
  getSession: (id) => json(`/sessions/${id}/`),
  getLesson: (id) => json(`/lessons/${id}/`),
  getPeerKnowledge: () => json(`/peers/me/knowledge/`),
  getKnowledgeGraph: (lessonId) =>
    json(`/knowledge-graph/${lessonId != null ? `?lesson_id=${lessonId}` : ""}`),
  postMessage: (id, body) => turn(`/sessions/${id}/messages/`, { method: "POST", body: JSON.stringify(body) }),
  getTurn: (id, requestId) => turn(`/sessions/${id}/turns/${requestId}/`),
  getEvaluation: async (id) => {
    const res = await request(`/sessions/${id}/evaluation/`);
    if (res.status === 202) return { kind: "pending", retryAfterMs: retryAfterMs(res) };
    return { kind: "done", data: (await res.json()) as EvaluationReport };
  },
  finishSession: (id) => json(`/sessions/${id}/finish/`, { method: "POST" }),
};

/**
 * モックを使うかどうか。
 * - NEXT_PUBLIC_API_MOCK=true のとき
 * - 開発中（npm run dev）で NEXT_PUBLIC_API_BASE_URL が未設定のとき
 * 本番のビルドでは、明示しない限りモックを使わない。
 */
export const usingMock =
  process.env.NEXT_PUBLIC_API_MOCK === "true" ||
  (process.env.NODE_ENV !== "production" && BASE_URL === "");

export const api: ApiClient = usingMock ? mockClient : httpClient;
