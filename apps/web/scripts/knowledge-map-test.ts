/** 知識マップの計算のテスト（npm run test:knowledge） */
import assert from "node:assert/strict";
import { layoutGraph, lessonsOf, masteryCondition, mergeGraphs, prerequisitesOf, progressText, resolveStatus, STATUS_NAME } from "../src/lib/knowledgeMap";

const edge = (source: number, target: number, relation: "prerequisite" | "related" = "prerequisite") => ({ source, target, relation });
const node = (id: number, status: "UNKNOWN" | "INTRODUCED" | "PRACTICING" | "MASTERED" = "UNKNOWN") => ({ id, code: `C${id}`, label: `概念${id}`, status });

// ── 用語集の4つの言葉
assert.deepEqual(STATUS_NAME, { UNKNOWN: "未習", INTRODUCED: "説明済み", PRACTICING: "練習中", MASTERED: "習得済み" });

// ── 状態：本人の知識状態を優先。なければノードの値
assert.equal(resolveStatus({ status: "UNKNOWN" }, { status: "MASTERED" }), "MASTERED");
assert.equal(resolveStatus({ status: "INTRODUCED" }, undefined), "INTRODUCED");

// ── 習得条件の文：数値から作る。数値がなければ作らない
assert.equal(masteryCondition({ required_correct: 1 }), "検証済みの正答1問");
assert.equal(masteryCondition({ required_correct: 2 }), "検証済みの正答2問（同じ形の問題は、くり返しても数えません）");
assert.equal(masteryCondition({ required_correct: 3 }), "検証済みの正答3問（同じ形の問題は、くり返しても数えません）");
assert.equal(masteryCondition(undefined), null);
assert.equal(masteryCondition({ required_correct: 0 }), null);
assert.equal(progressText({ verified_correct: 1, required_correct: 2 }), "1 / 2");
assert.equal(progressText({ verified_correct: 5, required_correct: 2 }), "2 / 2"); // 超えても、必要数まで
assert.equal(progressText(undefined), null);

// ── 前提：向きは source（前提）→ target（あとの概念）。related は前提に入れない
const edges = [edge(101, 102), edge(101, 103), edge(102, 104), edge(103, 102, "related")];
assert.deepEqual(prerequisitesOf(102, edges), [101]);
assert.deepEqual(prerequisitesOf(101, edges), []);
assert.deepEqual(prerequisitesOf(104, edges), [102]);

// ── 小単元ごとのグラフを、まとめる（重複なし）
const merged = mergeGraphs([
  { nodes: [node(101), node(102)], edges: [edge(101, 102)] },
  { nodes: [node(101), node(103)], edges: [edge(101, 103), edge(101, 102)] },
]);
assert.deepEqual(merged.nodes.map((n) => n.id).sort(), [101, 102, 103]);
assert.equal(merged.edges.length, 2);
assert.deepEqual(mergeGraphs([]), { nodes: [], edges: [] });

// ── この概念を含む小単元
const lessons = [{ id: 1, title: "等式の性質", concept_ids: [101] }, { id: 2, title: "方程式の解法", concept_ids: [101, 102] }, { id: 10, title: "一次方程式", concept_ids: [] }];
assert.deepEqual(lessonsOf(101, lessons).map((l) => l.id), [1, 2]);
assert.deepEqual(lessonsOf(104, lessons), []);

// ── レイアウト：前提が左（PC）／上（スマホ）。あとの概念が右／下
const size = { w: 200, h: 88 }, gap = { x: 90, y: 28 };
const lr = layoutGraph([101, 102, 103, 104], edges, "LR", size, gap);
assert.ok(lr.get(101)!.x < lr.get(102)!.x && lr.get(101)!.x < lr.get(103)!.x); // 前提は、あとの概念より左
assert.ok(lr.get(102)!.x < lr.get(104)!.x); // 102 → 104
assert.equal(lr.get(102)!.x, lr.get(103)!.x); // 同じ深さは、同じ列
assert.notEqual(lr.get(102)!.y, lr.get(103)!.y); // 同じ列の中は、縦にずれる
const tb = layoutGraph([101, 102, 103, 104], edges, "TB", { w: 156, h: 88 }, { x: 24, y: 64 });
assert.ok(tb.get(101)!.y < tb.get(102)!.y && tb.get(102)!.y < tb.get(104)!.y); // 前提が上
assert.equal(tb.get(102)!.y, tb.get(103)!.y);
// 辺がなければ全部 同じ段
const flat = layoutGraph([1, 2, 3], [], "LR", size, gap);
assert.equal(new Set([...flat.values()].map((p) => p.x)).size, 1);
// 循環があっても止まる（段0にそろう）
const cyc = layoutGraph([1, 2], [edge(1, 2), edge(2, 1)], "LR", size, gap);
assert.equal(cyc.size, 2);
// 空
assert.equal(layoutGraph([], [], "LR", size, gap).size, 0);
// グラフにない概念をさす辺は無視（落ちない）
assert.equal(layoutGraph([1], [edge(1, 999)], "LR", size, gap).size, 1);

console.log("KNOWLEDGE_MAP_OK");
