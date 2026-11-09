import assert from "node:assert/strict";
import { mockFetch, setMockScenario, setMockAttemptMode, resetMockState } from "../src/lib/mocks/mock-api";
const call = async (m: string, p: string, b?: unknown) => {
  const r = await mockFetch(`/api/v1${p}`, { method: m, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json() };
};
(async () => {
  const RID = "11111111-1111-4111-8111-111111111111";
  // normal
  assert.equal((await call("GET", "/lessons/")).j.results.length, 1);
  let r = await call("POST", "/sessions/", { mode: "preset", lesson_ids: [1] });
  assert.equal(r.s, 201); assert.deepEqual((await call("GET", "/sessions/1/")).j, r.j);
  assert.equal((await call("POST", "/sessions/", { mode: "preset", lesson_ids: [1, 9] })).s, 400);
  assert.equal((await call("GET", "/sessions/2/")).s, 404);
  r = await call("POST", "/sessions/1/messages/", { request_id: RID, message: "a" });
  assert.equal(r.s, 200); assert.equal(r.j.request_id, RID); assert.deepEqual(r.j.knowledge_changes, []);
  assert.equal((await call("POST", "/sessions/1/messages/", { request_id: RID, message: "b" })).s, 409);
  assert.equal((await call("POST", "/onboarding/complete/", { nickname: "あお", school_level: "middle", grade: 1 })).s, 201);
  assert.equal((await call("POST", "/onboarding/complete/", { nickname: "あお", school_level: "middle", grade: 1 })).s, 200);
  assert.equal((await call("POST", "/sessions/1/exercises/", { latex: "x+3=7" })).j.id, 201);
  assert.equal((await call("POST", "/sessions/1/exercises/", { latex: "x^2=4" })).j.id, 202);
  await call("POST", "/sessions/1/exercises/", { latex: "x+3=7" });
  assert.equal((await call("POST", "/exercises/201/attempt/")).j.result, "correct");
  assert.equal((await call("POST", "/exercises/201/attempt/")).j.reason, "duplicate_form");
  await call("POST", "/sessions/1/exercises/", { latex: "\\frac{x}{2}=3" });
  assert.equal((await call("POST", "/exercises/201/attempt/")).j.result, "blocked");
  assert.equal((await call("POST", "/sessions/1/finish/")).s, 202);
  assert.equal((await call("GET", "/sessions/1/evaluation/")).s, 202);
  assert.equal((await call("GET", "/sessions/1/evaluation/")).s, 202);
  const ev = await call("GET", "/sessions/1/evaluation/");
  assert.equal(ev.s, 200); assert.equal(ev.j.total_score, Math.round((80 * 40 + 66 * 30) / 70));
  assert.equal((await call("GET", "/nope/")).s, 501);
  // scenarios
  setMockScenario("emptyLessons"); assert.deepEqual((await call("GET", "/lessons/")).j, { results: [] });
  setMockScenario("unauthorized"); r = await call("GET", "/lessons/"); assert.equal(r.s, 401); assert.equal(r.j.code, "UNAUTHORIZED");
  setMockScenario("notFound"); assert.equal((await call("GET", "/sessions/1/")).s, 404);
  setMockScenario("pending"); r = await call("POST", "/sessions/1/messages/", { request_id: RID }); assert.equal(r.s, 202); assert.equal(r.j.request_id, RID);
  assert.equal((await call("GET", "/sessions/1/evaluation/")).s, 202);
  setMockScenario("networkError"); await assert.rejects(call("GET", "/lessons/"), TypeError);
  console.log("SMOKE_OK");
})();
