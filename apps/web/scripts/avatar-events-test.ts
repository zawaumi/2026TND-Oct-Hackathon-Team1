/** 習得の確定イベントの判定と、重複の抑止のテスト（npm run test:avatar） */
import assert from "node:assert/strict";
import { EventLedger, isMasteryTransition, masteryEventKey } from "../src/lib/avatarEvents";

// ── 習得済みへの遷移だけを、確定イベントとして扱う
assert.equal(isMasteryTransition({ old_status: "PRACTICING", new_status: "MASTERED" }), true);
assert.equal(isMasteryTransition({ old_status: "UNKNOWN", new_status: "MASTERED" }), true);
assert.equal(isMasteryTransition({ old_status: "MASTERED", new_status: "MASTERED" }), false); // もともと習得済み
assert.equal(isMasteryTransition({ old_status: "INTRODUCED", new_status: "PRACTICING" }), false); // 練習中になっただけ
assert.equal(isMasteryTransition({ old_status: "MASTERED", new_status: "UNKNOWN" }), false); // リセット

// ── イベントの識別：turn と attempt は、同じ数字でも別のイベント。概念が違えば別のイベント
assert.equal(masteryEventKey({ kind: "turn", id: 12 }, 101), "turn:12:101");
assert.equal(masteryEventKey({ kind: "attempt", id: 12 }, 101), "attempt:12:101");
assert.notEqual(masteryEventKey({ kind: "turn", id: 12 }, 101), masteryEventKey({ kind: "attempt", id: 12 }, 101));
assert.notEqual(masteryEventKey({ kind: "turn", id: 12 }, 101), masteryEventKey({ kind: "turn", id: 12 }, 102));
assert.notEqual(masteryEventKey({ kind: "turn", id: 12 }, 101), masteryEventKey({ kind: "turn", id: 13 }, 101));

// ── 同じイベントを2度受け取っても、1度だけ
const ledger = new EventLedger();
const k = masteryEventKey({ kind: "turn", id: 7, }, 101);
assert.equal(ledger.claim(k), true); // 初めて：演出する
assert.equal(ledger.claim(k), false); // 再受信：演出しない
assert.equal(ledger.claim(k), false);
assert.equal(ledger.claim(masteryEventKey({ kind: "turn", id: 7 }, 102)), true); // 同じ応答で、別の概念：別のイベント
assert.equal(ledger.claim(masteryEventKey({ kind: "attempt", id: 7 }, 101)), true); // 解答は、別のイベント
assert.equal(ledger.size, 3);

// ── 保持の上限：超えたら古いものから忘れる（最近のものは覚えている）
const small = new EventLedger(3);
for (const id of [1, 2, 3]) assert.equal(small.claim(`turn:${id}:101`), true);
assert.equal(small.claim("turn:4:101"), true); // 1 を忘れる
assert.equal(small.size, 3);
assert.equal(small.has("turn:1:101"), false);
assert.equal(small.has("turn:4:101"), true);
assert.equal(small.claim("turn:4:101"), false); // 直近のものは、重複として止める
assert.equal(new EventLedger().claim("x"), true); // 既定の上限でも動く

console.log("AVATAR_EVENTS_OK");
