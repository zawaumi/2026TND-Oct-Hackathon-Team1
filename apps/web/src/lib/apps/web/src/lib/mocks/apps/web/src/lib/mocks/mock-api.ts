/**
 * モックの fetch。method + pathname で照合し、OpenAPI と同じ HTTP ステータス・本文を返す。
 * api.ts の transport としてだけ使われる（NEXT_PUBLIC_API_MOCK=true のときのみ読み込まれる）。
 *
 * 対応するクエリ: GET /lessons/?grade= ・ GET /sessions/?limit= ・ GET /knowledge-graph/?lesson_id=
 * それ以外のクエリは無視する。状態はメモリ内のみ。リロードで初期化され、実APIには何も永続化されない。
 */
import * as fx from "./fixtures";
import type { Attempt, Session, TurnResponse } from "../api";

/** 本番成果物にこの文字列が残っていたら CI が落とす（scripts/check-no-mock.mjs） */
export const MOCK_MARKER = "__PIATOMO_API_MOCK__";

/* ----------------------------- シナリオ ----------------------------- */

export const SCENARIOS = [
  "normal",
  "emptyLessons",
  "unauthorized",
  "notFound",
  "pending",
  "networkError",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const ATTEMPT_MODES = ["auto", "correct", "duplicate_form", "blocked"] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

const SCENARIO_KEY = "piatomo.mock.scenario";
const ATTEMPT_KEY = "piatomo.mock.attempt";
let scenarioOverride: Scenario | null = null;
let attemptOverride: AttemptMode | null = null;

function pick<T extends string>(
  all: readonly T[],
  param: string,
  storageKey: string,
  override: T | null,
  fallback: T,
): T {
  if (typeof window === "undefined") return override ?? fallback;
  try {
    const q = new URLSearchParams(window.location.search).get(param);
    if (q && (all as readonly string[]).includes(q)) {
      sessionStorage.setItem(storageKey, q); // 画面遷移でクエリが消えても保つ
      return q as T;
    }
    const s = sessionStorage.getItem(storageKey);
    if (s && (all as readonly string[]).includes(s)) return s as T;
  } catch {
    /* storage が使えなくても動く */
  }
  return override ?? fallback;
}
/** URL の ?mock=pending 、または sessionStorage、または setMockScenario() で選ぶ */
export const currentScenario = (): Scenario =>
  pick(SCENARIOS, "mock", SCENARIO_KEY, scenarioOverride, "normal");
/** URL の ?mock_attempt=blocked 等 */
export const currentAttemptMode = (): AttemptMode =>
  pick(ATTEMPT_MODES, "mock_attempt", ATTEMPT_KEY, attemptOverride, "auto");

export function setMockScenario(s: Scenario) {
  scenarioOverride = s;
  try {
    sessionStorage.setItem(SCENARIO_KEY, s);
  } catch {}
}
export function setMockAttemptMode(m: AttemptMode) {
  attemptOverride = m;
  try {
    sessionStorage.setItem(ATTEMPT_KEY, m);
  } catch {}
}

/* ------------------------------- 状態 ------------------------------- */

interface State {
  onboarded: boolean;
  session: Session;
  finished: boolean;
  evalPollsLeft: number;
  turns: Map<string, { hash: string; turn: TurnResponse }>;
  turnSeq: number;
  latestLatex: string;
  correctCount: number;
  verifiedCorrect: number;
}
const initialState = (): State => ({
  onboarded: false,
  session: { ...fx.session, lesson_ids: [...fx.session.lesson_ids] },
  finished: false,
  evalPollsLeft: 0,
  turns: new Map(),
  turnSeq: 0,
  latestLatex: "",
  correctCount: 0,
  verifiedCorrect: 0,
});
let state = initialState();
export const resetMockState = () => {
  state = initialState();
};

/* ------------------------------ 応答補助 ----------------------------- */

const LATENCY_MS = 150; // 「考え中」などの進捗UIを確認できる程度
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const err = (status: number, code: string, message: string) =>
  json(status, { code, message });
const notFoundSession = () => err(404, "NOT_FOUND", "セッションが見つかりません。");
const validation = (message: string) => err(400, "VALIDATION_ERROR", message);

interface Ctx {
  url: URL;
  body: Record<string, unknown>;
  m: RegExpMatchArray;
  scenario: Scenario;
}
type Handler = (c: Ctx) => Response;

/** 存在しない／他人のセッションは 404（notFound シナリオでは常に 404） */
function sessionGuard(c: Ctx, idStr: string): Response | null {
  if (c.scenario === "notFound" || Number(idStr) !== state.session.id) return notFoundSession();
  return null;
}

/* ------------------------------ ルート ------------------------------ */

const P = "/api/v1";
const routes: Array<[string, RegExp, Handler]> = [
  ["GET", /^\/health\/$/, () => json(200, { status: "ok" })],

  ["GET", /^\/users\/me\/$/, () =>
    state.onboarded
      ? json(200, fx.profile)
      : err(404, "NOT_FOUND", "初回登録が必要です。")], // 実APIは GET で自動作成しない（FR-01）

  ["POST", /^\/onboarding\/complete\/$/, (c) => {
    const { nickname, school_level, grade } = c.body;
    if (typeof nickname !== "string" || !nickname.trim()) return validation("ニックネームを入力してください。");
    if (school_level !== "middle" && school_level !== "high") return validation("校種が正しくありません。");
    if (!Number.isInteger(grade)) return validation("学年が正しくありません。");
    const created = !state.onboarded;
    state.onboarded = true;
    return json(created ? 201 : 200, fx.profile); // 登録済みの再送は 200 で同じ Profile
  }],

  ["GET", /^\/peers\/me\/$/, () => json(200, fx.peer)],

  ["GET", /^\/peers\/me\/knowledge\/$/, () =>
    json(200, {
      ...fx.knowledge,
      items: fx.knowledge.items.map((i) => ({ ...i, verified_correct: state.verifiedCorrect })),
    })],

  ["GET", /^\/knowledge-graph\/$/, (c) => {
    const lid = c.url.searchParams.get("lesson_id");
    if (lid !== null && !fx.KNOWN_LESSON_IDS.includes(Number(lid)))
      return err(404, "NOT_FOUND", "小単元が見つかりません。");
    return json(200, fx.knowledgeGraph);
  }],

  ["GET", /^\/lessons\/$/, (c) => {
    if (c.scenario === "emptyLessons") return json(200, { results: [] });
    const g = c.url.searchParams.get("grade");
    const results = g === null ? fx.lessons.results : fx.lessons.results.filter((l) => l.grade === Number(g));
    return json(200, { results });
  }],

  ["GET", /^\/lessons\/(\d+)\/$/, (c) => {
    const l = c.scenario === "emptyLessons" ? undefined : fx.lessons.results.find((x) => x.id === Number(c.m[1]));
    return l ? json(200, l) : err(404, "NOT_FOUND", "小単元が見つかりません。");
  }],

  ["GET", /^\/sessions\/$/, (c) => {
    const n = Number(c.url.searchParams.get("limit"));
    const all = fx.recentSessions.results;
    return json(200, { results: Number.isInteger(n) && n > 0 ? all.slice(0, n) : all });
  }],

  ["POST", /^\/sessions\/$/, (c) => {
    const { mode, lesson_ids } = c.body;
    if (mode !== "preset") return validation("MVP では mode は preset のみです。");
    if (!Array.isArray(lesson_ids) || lesson_ids.length === 0) return validation("小単元を選んでください。");
    if (new Set(lesson_ids).size !== lesson_ids.length) return validation("小単元が重複しています。");
    if (!lesson_ids.every((i) => Number.isInteger(i) && fx.KNOWN_LESSON_IDS.includes(i as number)))
      return validation("モックにない小単元です。");
    const fresh = initialState();
    state = { ...fresh, onboarded: state.onboarded, session: { ...fx.session, lesson_ids: [...(lesson_ids as number[])] } };
    return json(201, state.session); // 受け取った配列を保持し、後続 GET でも同じ配列を返す
  }],

  ["GET", /^\/sessions\/(\d+)\/$/, (c) => sessionGuard(c, c.m[1]) ?? json(200, state.session)],

  ["POST", /^\/sessions\/(\d+)\/messages\/$/, (c) => {
    const g = sessionGuard(c, c.m[1]);
    if (g) return g;
    const rid = c.body.request_id;
    if (typeof rid !== "string" || !rid) return validation("request_id が必要です。");
    if (c.scenario === "pending") return json(202, { status: "processing", request_id: rid });

    const { request_id: _omit, ...rest } = c.body;
    const hash = JSON.stringify(rest);
    const hit = state.turns.get(rid);
    if (hit) {
      // 同じ request_id の再送は同じ結果（冪等）。本文違いは 409（AT-09）
      return hit.hash === hash
        ? json(200, hit.turn)
        : err(409, "REQUEST_ID_CONFLICT", "同じ送信IDで内容が違います。");
    }
    const turn: TurnResponse = { ...fx.turnTemplate, request_id: rid, turn_id: ++state.turnSeq };
    state.turns.set(rid, { hash, turn });
    return json(200, turn);
  }],

  ["POST", /^\/sessions\/(\d+)\/exercises\/$/, (c) => {
    const g = sessionGuard(c, c.m[1]);
    if (g) return g;
    const latex = c.body.latex;
    if (typeof latex !== "string" || !latex.trim()) return validation("式を入力してください。");
    if (!isSupported(latex)) return json(201, fx.exerciseUnsupported);
    state.latestLatex = latex;
    return json(201, fx.exerciseVerified);
  }],

  ["POST", /^\/exercises\/(\d+)\/attempt\/$/, (c) => {
    const id = Number(c.m[1]);
    if (id === fx.UNSUPPORTED_EXERCISE_ID) return err(409, "EXERCISE_UNSUPPORTED", "この問題は習得に使えません。");
    if (id !== fx.EXERCISE_ID) return err(404, "NOT_FOUND", "問題が見つかりません。");
    return json(200, runAttempt());
  }],

  ["POST", /^\/sessions\/(\d+)\/finish\/$/, (c) => {
    const g = sessionGuard(c, c.m[1]);
    if (g) return g;
    if (!state.finished) {
      state.finished = true;
      state.evalPollsLeft = 2; // 評価は 2 回 202 を返してから 200（ポーリングの確認用）
      state.session = { ...state.session, status: "finished" };
    }
    return json(202, fx.finishResponse);
  }],

  ["GET", /^\/sessions\/(\d+)\/evaluation\/$/, (c) => {
    const g = sessionGuard(c, c.m[1]);
    if (g) return g;
    if (c.scenario === "pending") return json(202, { status: "evaluation_pending" });
    if (state.finished && state.evalPollsLeft > 0) {
      state.evalPollsLeft--;
      return json(202, { status: "evaluation_pending" });
    }
    return json(200, fx.evaluation);
  }],
];

/* --------------------------- 問題・挑戦の判定 --------------------------- */

/** 一次方程式（文字1つ）だけ VERIFIED。= がない／^・\sqrt／文字が2種類以上は UNSUPPORTED */
function isSupported(latex: string): boolean {
  if (!latex.includes("=") || /\^|\\sqrt|\\int/.test(latex)) return false;
  const letters = new Set(latex.replace(/\\[a-zA-Z]+/g, "").match(/[a-zA-Z]/g) ?? []);
  return letters.size === 1;
}
/** かけ算・分数を含む式は「未習の技能が必要」として blocked にする */
const needsUntaughtSkill = (latex: string) => /\\cdot|\\times|\\frac|\//.test(latex);

function runAttempt(): Attempt {
  const mode = currentAttemptMode();
  const kind =
    mode !== "auto"
      ? mode
      : needsUntaughtSkill(state.latestLatex)
        ? "blocked"
        : state.correctCount === 0
          ? "correct"
          : "duplicate_form";
  if (kind === "blocked") return fx.attemptBlocked;
  if (kind === "duplicate_form") return fx.attemptDuplicateForm; // 回数に入らない
  state.correctCount++;
  // 「あと〇問」の確認用に 1 だけ進める。必要数には届かせず、MASTERED には見せない
  state.verifiedCorrect = Math.min(state.verifiedCorrect + 1, fx.REQUIRED_CORRECT - 1);
  return fx.attemptCorrect;
}

/* ------------------------------ fetch 本体 ------------------------------ */

export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await sleep(LATENCY_MS);
  const scenario = currentScenario();
  // 通信例外: HTTP レスポンスなし。401 等とは別物として扱われる
  if (scenario === "networkError") throw new TypeError("Failed to fetch (mock: networkError)");

  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
  let path = url.pathname;
  if (!path.endsWith("/")) path += "/";

  if (scenario === "unauthorized" && path !== `${P}/health/`)
    return err(401, "UNAUTHORIZED", "ログインしてください。");

  let body: Record<string, unknown> = {};
  if (typeof init?.body === "string" && init.body) {
    try {
      const parsed = JSON.parse(init.body);
      if (parsed && typeof parsed === "object") body = parsed;
    } catch {
      return validation("JSON が正しくありません。");
    }
  }

  if (path.startsWith(`${P}/`)) {
    const rel = path.slice(P.length);
    for (const [m, re, h] of routes) {
      const match = m === method ? rel.match(re) : null;
      if (match) return h({ url, body, m: match, scenario });
    }
  }
  // 未知のパスを成功扱いにしない（実装漏れに気づけるよう 501 + コンソール警告）
  const msg = `モック未実装: ${method} ${url.pathname}`;
  if (typeof console !== "undefined") console.error(`[${MOCK_MARKER}] ${msg}`);
  return err(501, "MOCK_NOT_IMPLEMENTED", msg);
}
