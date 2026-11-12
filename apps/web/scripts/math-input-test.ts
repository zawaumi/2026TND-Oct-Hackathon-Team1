/** 数式入力の検査と、結果の文言のテスト（npm run test:math） */
import assert from "node:assert/strict";
import { checkLatex, displayExpr, latexToPlain, latexToSpoken, toDisplay } from "../src/lib/mathInput";
import { exerciseNotice, summarizeAttempt } from "../src/lib/exercise";

const ok = (raw: string) => {
  const r = checkLatex(raw);
  assert.ok(r.ok, `${raw} は通るはず: ${!r.ok ? r.message : ""}`);
  return r;
};
const ng = (raw: string) => {
  const r = checkLatex(raw);
  assert.ok(!r.ok, `${raw} は通らないはず`);
  return r.ok ? "" : r.message;
};

// ── 通る式：APIに送る latex と question
assert.deepEqual(ok("x+3=7"), { ok: true, latex: "x+3=7", question: "x+3=7" });
assert.equal(ok("  2x + 3 = 11 ").question, "2x+3=11");
assert.equal(ok("\\frac{x}{2}=3").question, "x/2=3");
assert.equal(ok("3x\\cdot2=12").question, "3x×2=12");
assert.equal(ok("x\u22123=7").latex, "x-3=7"); // 長いマイナスをそろえる
// 範囲外の式も「書き方」としては通す。分類は API（UNSUPPORTED）が決める
ok("x^2=4");
ok("x^{2}+1=5");
ok("\\sqrt{x}=2");
ok("2x+3y=5");
ok("x+3"); // = がなくても、書き方としては通す

// ── 通らない式
ng("");
ng("   ");
assert.match(ng("x".repeat(201)), /長すぎ/);
assert.match(ng("\\href{javascript:alert(1)}{x}=1"), /対応していない記号/);
assert.match(ng("\\input{/etc/passwd}"), /対応していない記号/);
assert.match(ng("\\def\\a{1}x=\\a"), /対応していない記号/);
assert.match(ng("x=1\\\\2"), /対応していない記号/);
assert.match(ng("x=\\{1\\}"), /対応していない記号/);
assert.match(ng("x=1; DROP TABLE"), /対応していない文字|対応していない記号/);
assert.match(ng("<script>x=1</script>"), /対応していない/); // HTML の形は送らない
assert.match(ng("x<3"), /対応していない/);
assert.match(ng("\\frac{}{2}=3"), /入力していない部分/);
assert.match(ng("\\frac{\\placeholder{}}{2}=3"), /入力していない部分/);
assert.match(ng("(x+3=7"), /かっこの数/);
assert.match(ng("x+3)=7"), /かっこの数/);
assert.match(ng("\\frac{x}{2=3"), /かっこの数/);
assert.match(ng("x=1\u0000"), /使えない文字/);

// ── 文字の式・表示・読み上げ
assert.equal(latexToPlain("\\frac{x}{2}=3"), "x/2=3");
assert.equal(latexToPlain("\\frac{x+1}{2}=3"), "(x+1)/(2)=3");
assert.equal(latexToPlain("\\frac{\\frac{x}{2}}{3}=1"), "(x/2)/(3)=1");
assert.equal(latexToPlain("x^{2}=4"), "x^2=4");
assert.equal(latexToPlain("x^{12}=4"), "x^(12)=4");
assert.equal(latexToPlain("\\sqrt{x}=2"), "√(x)=2");
assert.equal(latexToPlain("\\left(x+1\\right)\\times2=6"), "(x+1)×2=6");
assert.equal(toDisplay("x+3=7"), "x + 3 = 7");
assert.equal(toDisplay("2x-5=9"), "2x − 5 = 9");
assert.equal(toDisplay("x=-5"), "x = −5");
assert.equal(toDisplay("3x×2=12"), "3x × 2 = 12");
assert.equal(displayExpr("x+3=7"), "x + 3 = 7");
assert.equal(displayExpr("2x = 4"), "2x = 4"); // API の例（空白あり）
assert.equal(latexToSpoken("x+3=7"), "エックス たす 3 イコール 7");
assert.equal(latexToSpoken("2x-5=9"), "2 エックス ひく 5 イコール 9");
assert.equal(latexToSpoken("x=-5"), "エックス イコール マイナス 5");
assert.equal(latexToSpoken("\\frac{x}{2}=3"), "2分のエックス イコール 3");
assert.equal(latexToSpoken("x^2=4"), "エックス の2乗 イコール 4");

// ── 検証状態の案内（API の分類をそのまま使う）
assert.deepEqual(exerciseNotice({ verification_status: "VERIFIED" }), { kind: "verified" });
assert.equal(exerciseNotice({ verification_status: "PROVISIONAL" }).kind, "provisional");
const un = exerciseNotice({ verification_status: "UNSUPPORTED", reason: "対応範囲外です。" });
assert.ok(un.kind === "unsupported" && un.text === "対応範囲外です。" && /入力し直して/.test(un.guide));
const un2 = exerciseNotice({ verification_status: "UNSUPPORTED" });
assert.ok(un2.kind === "unsupported" && un2.text.length > 0);

// ── 解答の結果ごとの表示（docs/04 の 5.4）
const base = { verification_status: "VERIFIED" as const, blocked_skill: null };
const s1 = summarizeAttempt({ ...base, result: "correct", reason: null }, 1);
assert.equal(s1.tone, "ok"); assert.deepEqual(s1.details, ["習得まであと1問"]);
assert.deepEqual(summarizeAttempt({ ...base, result: "correct", reason: null }, null).details, []);
assert.deepEqual(summarizeAttempt({ ...base, result: "correct", reason: null }, 0).details, []);
const s2 = summarizeAttempt({ ...base, result: "correct", reason: "duplicate_form" }, 1);
assert.ok(/前と同じ形/.test(s2.details[0]) && /違う形/.test(s2.hint ?? "") && s2.tone === "info");
assert.ok(!s2.details.join("").includes("あと")); // 回数に入らないので「あと〇問」は出さない
const s3 = summarizeAttempt({ ...base, result: "incorrect", reason: null }, null);
assert.equal(s3.markLast, "wrong"); assert.ok(!/ダメ|だめ|ミス|失敗|間違い/.test(s3.headline + s3.details.join(""))); // 責めない
const s4 = summarizeAttempt({ ...base, result: "blocked", reason: null, blocked_skill: "両辺に同じ数をかける" }, null);
assert.equal(s4.markLast, "stopped"); assert.ok(s4.offerTeach); assert.ok(s4.details[0].includes("両辺に同じ数をかける"));
const s5 = summarizeAttempt({ ...base, result: "unverified", reason: null }, null);
assert.ok(/習得には使いません/.test(s5.details[0]));
assert.ok(/暫定|回数には入りません/.test(summarizeAttempt({ ...base, result: "correct", reason: "provisional" }, null).details[0]));
assert.ok(/リセット/.test(summarizeAttempt({ ...base, result: "correct", reason: "reset_during_attempt" }, null).details[0]));

console.log("MATH_OK");
