/**
 * モックの動作確認（npm run test:mock）。
 * もとは Shiori さんの #82（scripts/mock-smoke.ts）。いまのモック（src/lib/api/mock.ts）に合わせて書き直した。
 */
import assert from "node:assert/strict";
import { mockClient as api, setMockScenario } from "../src/lib/api/mock";
import { lastLessonId, loadRecent } from "../src/lib/home";
import { ApiError, isNetworkError, isNotFound, isOnboardingRequired, isUnauthorized } from "../src/lib/api/types";

const RID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function main() {
  // 教材とプロフィール
  const me = await api.getMe();
  assert.equal(me.school_level, "middle");
  const lessons = await api.getLessons({ school_level: "middle", grade: 1, subject: "math" });
  assert.ok(lessons.some((l) => l.title === "移項"));
  assert.deepEqual(await api.getLessons({ school_level: "high" }), []);

  // 初回登録：1回目は登録済み扱い（モックは登録済みから始まる）
  const ob = await api.completeOnboarding({
    nickname: "あお",
    school_level: "middle",
    grade: 1,
    terms_version: "2026-11",
    privacy_notice_version: "2026-11",
    consent_confirmed: true,
  });
  assert.equal(ob.created, false);
  assert.equal(ob.profile.nickname, "あお");

  // 授業
  const s = await api.createSession([2, 3]);
  assert.deepEqual((await api.getSession(s.id)).lesson_ids, [2, 3]);
  await assert.rejects(api.createSession([]), (e) => e instanceof ApiError && e.status === 400);

  // 教える：同じ request_id の再送は同じ結果（冪等）
  const t1 = await api.postMessage(s.id, { request_id: RID(1), content: "移項は…" });
  const t2 = await api.postMessage(s.id, { request_id: RID(1), content: "移項は…" });
  assert.equal(t1.kind, "done");
  assert.deepEqual(t1, t2);
  await assert.rejects(api.postMessage(s.id, { request_id: RID(2), content: "#409" }), (e) => e instanceof ApiError && e.status === 409);

  // 問題を出す → ぴあ友の解答
  const ex1 = await api.createExercise(s.id, { request_id: RID(10), kind: "math_equation", question: "x+3=7", latex: "x+3=7", target_concept_id: 103 });
  assert.equal(ex1.verification_status, "VERIFIED");
  const a1 = await api.attemptExercise(ex1.id, RID(11));
  assert.equal(a1.kind, "done");
  if (a1.kind === "done") {
    assert.equal(a1.data.result, "correct");
    assert.equal(a1.data.steps?.at(-1)?.expr, "x=4");
    // 移項（103）は検証済みの正答が 1/2 から始まるので、この正答で習得済みになる
    assert.ok(a1.data.knowledge_changes.some((c) => c.concept_id === 103 && c.new_status === "MASTERED"));
  }
  assert.deepEqual(await api.attemptExercise(ex1.id, RID(11)), a1); // 再送は同じ結果

  // 同じ形の問題は習得の回数に入らない
  const ex2 = await api.createExercise(s.id, { request_id: RID(12), kind: "math_equation", question: "x+5=9", latex: "x+5=9", target_concept_id: 103 });
  const a2 = await api.attemptExercise(ex2.id, RID(13));
  assert.ok(a2.kind === "done" && a2.data.reason === "duplicate_form");

  // 違う形の正答で、方程式の解法（102）が練習中になる（説明済み → 練習中）
  const ex3 = await api.createExercise(s.id, { request_id: RID(14), kind: "math_equation", question: "2x+3=11", latex: "2x+3=11", target_concept_id: 102 });
  const a3 = await api.attemptExercise(ex3.id, RID(15));
  assert.ok(a3.kind === "done" && a3.data.steps?.at(-1)?.expr === "x=4");

  // まだ教わっていない技能で止まる・対応外の問題
  const ex4 = await api.createExercise(s.id, { request_id: RID(16), kind: "math_equation", question: "x/2=3", latex: "\\frac{x}{2}=3", target_concept_id: 102 });
  const a4 = await api.attemptExercise(ex4.id, RID(17));
  assert.ok(a4.kind === "done" && a4.data.result === "blocked" && a4.data.blocked_skill);
  const ex5 = await api.createExercise(s.id, { request_id: RID(18), kind: "math_equation", question: "x^2=4", latex: "x^2=4", target_concept_id: 103 });
  assert.equal(ex5.verification_status, "UNSUPPORTED");

  // 授業を終える → 評価（1回目は評価中）
  assert.equal((await api.finishSession(s.id)).status, "evaluation_pending");
  assert.equal((await api.getEvaluation(s.id)).kind, "pending");
  const ev = await api.getEvaluation(s.id);
  assert.ok(ev.kind === "done" && ev.data.total_score === 74);

  // シナリオ
  setMockScenario("emptyLessons");
  assert.deepEqual(await api.getLessons({}), []);
  setMockScenario("unauthorized");
  await assert.rejects(api.getMe(), isUnauthorized);
  setMockScenario("notFound");
  await assert.rejects(api.getSession(s.id), isNotFound);
  setMockScenario("pending");
  assert.equal((await api.postMessage(s.id, { request_id: RID(20), content: "a" })).kind, "pending");
  setMockScenario("networkError");
  await assert.rejects(api.getLessons({}), isNetworkError);

  // 初回設定がまだの人（newUser）：初回設定以外は 403 ONBOARDING_REQUIRED。同意なしでは登録できない
  setMockScenario("newUser");
  await assert.rejects(api.getMe(), isOnboardingRequired);
  await assert.rejects(api.getLessons({}), isOnboardingRequired);
  const signup = {
    nickname: "あお",
    school_level: "middle" as const,
    grade: 1,
    terms_version: "draft-1",
    privacy_notice_version: "draft-1",
    consent_confirmed: true as const,
  };
  await assert.rejects(
    api.completeOnboarding({ ...signup, consent_confirmed: false as never }),
    (e) => e instanceof ApiError && e.status === 400 && e.code === "CONSENT_REQUIRED",
  );
  await assert.rejects(api.getMe(), isOnboardingRequired); // 同意なしの登録は成功していない
  const first = await api.completeOnboarding(signup);
  assert.equal(first.created, true);
  assert.equal((await api.getMe()).nickname, "あお"); // 登録後は ふつうに使える
  assert.equal((await api.completeOnboarding(signup)).created, false); // 再送は登録済み（200）
  // #neterr：1回目だけ通信エラー（同じ入力でもう一度押せば成功する）
  await assert.rejects(api.completeOnboarding({ ...signup, nickname: "#neterr" }), isNetworkError);
  assert.equal((await api.completeOnboarding({ ...signup, nickname: "#neterr" })).profile.nickname, "#neterr");
  // ホーム：前回の授業の、最後の小単元（docs/04 の 3.1）
  setMockScenario(null);
  assert.equal(lastLessonId([]), null);
  const base = { id: 1, status: "finished" as const, mode: "preset" as const, started_at: "2026-11-01T00:00:00+09:00" };
  assert.equal(lastLessonId([{ ...base, lesson_ids: [2, 3] }, { ...base, id: 2, lesson_ids: [9] }]), 3); // 新しい授業の、複数あれば最後
  assert.equal(lastLessonId([{ ...base, lesson_ids: [] }]), null);
  // この前に小単元 [2, 3] の授業を作ってあるので、いちばん新しい授業の最後の小単元は 3（移項）
  assert.deepEqual(await loadRecent(api), { kind: "last", title: "移項" });
  setMockScenario("noSessions");
  assert.deepEqual(await loadRecent(api), { kind: "none" }); // 授業がまだない
  setMockScenario("unauthorized");
  await assert.rejects(loadRecent(api), isUnauthorized);
  setMockScenario("networkError");
  await assert.rejects(loadRecent(api), isNetworkError);
  // 小単元が見つからない（404）ときは、前回の内容を出さない
  const lost = { listSessions: async () => [{ ...base, lesson_ids: [999] }], getLesson: (id: number) => api.getLesson(id) };
  setMockScenario(null);
  assert.deepEqual(await loadRecent(lost), { kind: "unknown" });
  setMockScenario(null);

  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
