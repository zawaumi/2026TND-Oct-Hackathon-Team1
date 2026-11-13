import type { ConceptEdge, ConceptNode, Lesson, PeerKnowledge } from "@/lib/api/types";

/** 知識マップの計算（画面から切り離してある。docs/04 の 6） */

export type Status = ConceptNode["status"];
export type Graph = { nodes: ConceptNode[]; edges: ConceptEdge[] };
export type Direction = "LR" | "TB";

/** 用語集の4つの言葉。別の言い方で状態を表さない（docs/04 の 1） */
export const STATUS_NAME: Record<Status, string> = {
  UNKNOWN: "未習",
  INTRODUCED: "説明済み",
  PRACTICING: "練習中",
  MASTERED: "習得済み",
};
export const STATUS_ORDER: Status[] = ["UNKNOWN", "INTRODUCED", "PRACTICING", "MASTERED"];

/** 状態は、本人の知識状態（GET /peers/me/knowledge/）を優先し、なければグラフのノードの値を使う */
export function resolveStatus(node: Pick<ConceptNode, "status">, item?: Pick<PeerKnowledge, "status">): Status {
  return item?.status ?? node.status;
}

/** 小単元ごとに取ったグラフを、1つにまとめる（概念と辺は、重複を除く） */
export function mergeGraphs(graphs: Graph[]): Graph {
  const nodes = new Map<number, ConceptNode>();
  const edges = new Map<string, ConceptEdge>();
  for (const g of graphs) {
    for (const n of g.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    for (const e of g.edges) edges.set(`${e.source}>${e.target}:${e.relation}`, e);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** 習得条件の文。API の数値（required_correct）から画面で作る（ADR-023 A6）。保存した文は使わない */
export function masteryCondition(item?: Pick<PeerKnowledge, "required_correct">): string | null {
  const n = item?.required_correct;
  if (n == null || n <= 0) return null;
  // API は「異なる形式の数」を返さないので、形式の数は書かない。同じ形の繰り返しを数えないことだけ添える（docs/00 の 4.4）
  return n === 1 ? "検証済みの正答1問" : `検証済みの正答${n}問（同じ形の問題は、くり返しても数えません）`;
}

/** 「検証済みの進み具合」（例：1 / 2） */
export function progressText(item?: Pick<PeerKnowledge, "verified_correct" | "required_correct">): string | null {
  if (!item || item.required_correct <= 0) return null;
  return `${Math.min(item.verified_correct, item.required_correct)} / ${item.required_correct}`;
}

/** 前提の概念（このノードの前に学ぶもの）。向きは source（前提）→ target（あとの概念） */
export function prerequisitesOf(conceptId: number, edges: ConceptEdge[]): number[] {
  return edges.filter((e) => e.relation === "prerequisite" && e.target === conceptId).map((e) => e.source);
}

/** この概念を含む小単元（公開されているもの）。GET /lessons/ の concept_ids から探す */
export function lessonsOf(conceptId: number, lessons: Pick<Lesson, "id" | "title" | "concept_ids">[]) {
  return lessons.filter((l) => (l.concept_ids ?? []).includes(conceptId));
}

/**
 * 前提の深さ（rank）で段に分けて、位置を決める。前提 → あとの概念の向きに、段が進む。
 * LR（PC）は左から右、TB（スマホ）は上から下。循環があっても止まる（循環の中は段0）。
 */
export function layoutGraph(
  ids: number[],
  edges: ConceptEdge[],
  dir: Direction,
  size: { w: number; h: number },
  gap: { x: number; y: number },
): Map<number, { x: number; y: number }> {
  const set = new Set(ids);
  const pre = edges.filter((e) => e.relation === "prerequisite" && set.has(e.source) && set.has(e.target) && e.source !== e.target);

  const rank = new Map<number, number>(ids.map((id) => [id, 0]));
  const indeg = new Map<number, number>(ids.map((id) => [id, 0]));
  for (const e of pre) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of pre.filter((x) => x.source === cur)) {
      rank.set(e.target, Math.max(rank.get(e.target) ?? 0, (rank.get(cur) ?? 0) + 1));
      indeg.set(e.target, (indeg.get(e.target) ?? 0) - 1);
      if ((indeg.get(e.target) ?? 0) === 0) queue.push(e.target);
    }
  }

  // 同じ段の中の並び：前の段の並びに合わせて（線の交差を減らす）。そろわなければ id 順
  const layers = new Map<number, number[]>();
  for (const id of [...ids].sort((a, b) => a - b)) {
    const r = rank.get(id) ?? 0;
    layers.set(r, [...(layers.get(r) ?? []), id]);
  }
  const order = new Map<number, number>();
  [...layers.keys()].sort((a, b) => a - b).forEach((r) => {
    const layer = layers.get(r)!;
    if (r > 0) {
      const bary = (id: number) => {
        const ps = pre.filter((e) => e.target === id).map((e) => order.get(e.source)).filter((v): v is number => v !== undefined);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.MAX_SAFE_INTEGER;
      };
      layer.sort((a, b) => bary(a) - bary(b) || a - b);
    }
    layer.forEach((id, i) => order.set(id, i));
  });

  const maxCount = Math.max(1, ...[...layers.values()].map((l) => l.length));
  const out = new Map<number, { x: number; y: number }>();
  for (const [r, layer] of layers) {
    const offset = ((maxCount - layer.length) / 2) * (dir === "LR" ? size.h + gap.y : size.w + gap.x);
    layer.forEach((id, i) => {
      out.set(
        id,
        dir === "LR"
          ? { x: r * (size.w + gap.x), y: offset + i * (size.h + gap.y) }
          : { x: offset + i * (size.w + gap.x), y: r * (size.h + gap.y) },
      );
    });
  }
  return out;
}
