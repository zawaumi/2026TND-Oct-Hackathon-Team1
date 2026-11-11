import {
  ApiError,
  type ApiClient,
  type EvaluationReport,
  type ExerciseAttempt,
  type Profile,
  type Lesson,
  type MessageResponse,
  type Schemas,
  type SessionSummary,
  type TurnResult,
} from "./types";

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
  completeOnboarding: async (body) => {
    const res = await request(`/onboarding/complete/`, { method: "POST", body: JSON.stringify(body) });
    return { created: res.status === 201, profile: (await res.json()) as Profile };
  },
  getPeer: () => json(`/peers/me/`),
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
  createExercise: (id, body) => json(`/sessions/${id}/exercises/`, { method: "POST", body: JSON.stringify(body) }),
  attemptExercise: async (exerciseId, requestId) => {
    const res = await request(`/exercises/${exerciseId}/attempt/`, {
      method: "POST",
      body: JSON.stringify({ request_id: requestId }),
    });
    if (res.status === 202) return { kind: "pending", retryAfterMs: retryAfterMs(res) };
    return { kind: "done", data: (await res.json()) as ExerciseAttempt };
  },
};

/**
 * モックを使うかどうか。
 * - NEXT_PUBLIC_API_MOCK=true のとき
 * - 開発中（npm run dev）で NEXT_PUBLIC_API_BASE_URL が未設定のとき
 *
 * 条件は process.env の直接比較で書く。本番ビルドでは false に決まるので分岐ごと消え、
 * モック（./mock）は成果物に入らない（scripts/check-no-mock.mjs がビルドのあとに確かめる）。
 */
export const usingMock =
  process.env.NEXT_PUBLIC_API_MOCK === "true" ||
  (process.env.NODE_ENV !== "production" && !process.env.NEXT_PUBLIC_API_BASE_URL);

/** モックは使うときにだけ読み込む（本番の成果物に含めないため） */
function lazyMock(): ApiClient {
  let loaded: Promise<ApiClient> | null = null;
  const load = () => (loaded ??= import("@/lib/api/mock").then((m) => m.mockClient));
  return new Proxy({} as ApiClient, {
    get: (_target, name: string | symbol) =>
      // then は返さない（Promise に「待てる値」と誤解されないように）
      typeof name !== "string" || name === "then"
        ? undefined
        : (...args: unknown[]) =>
            load().then((client) => (client[name as keyof ApiClient] as (...a: unknown[]) => unknown)(...args)),
  });
}

export const api: ApiClient = usingMock ? lazyMock() : httpClient;
