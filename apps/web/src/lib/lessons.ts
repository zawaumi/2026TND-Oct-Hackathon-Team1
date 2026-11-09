import type { KnowledgeStatus } from "@/components/KnowledgeState";
import type { ConceptEdge, Lesson } from "@/lib/api/client";

/** 小単元を一度に選べる数の上限（docs/04 の 4.1） */
export const MAX_SELECTION = 10;

/** 4状態の低い順 */
const ORDER: KnowledgeStatus[] = ["UNKNOWN", "INTRODUCED", "PRACTICING", "MASTERED"];
export const rank = (s: KnowledgeStatus) => ORDER.indexOf(s);

export type LessonNode = {
  lesson: Lesson;
  children: LessonNode[];
};

/** 小単元（末端）かどうか。子がなく、概念を持つもの */
export const isLeaf = (n: LessonNode) => n.children.length === 0 && n.lesson.concept_ids.length > 0;

/**
 * GET /lessons/ の平らな一覧を、領域 → 単元 → 小単元の木にする。
 * 小単元を1つも持たない枝は出さない（非公開の小単元は API が返さないため）。
 */
export function buildTree(lessons: Lesson[]): LessonNode[] {
  const nodes = new Map<number, LessonNode>(lessons.map((l) => [l.id, { lesson: l, children: [] }]));
  const roots: LessonNode[] = [];
  for (const l of lessons) {
    const node = nodes.get(l.id)!;
    const parent = l.parent_id != null ? nodes.get(l.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const prune = (list: LessonNode[]): LessonNode[] =>
    list
      .map((n) => ({ ...n, children: prune(n.children) }))
      .filter((n) => isLeaf(n) || n.children.length > 0);
  return prune(roots);
}

/** その枝の下にある小単元をすべて（並び順のまま） */
export function leavesOf(node: LessonNode): Lesson[] {
  if (isLeaf(node)) return [node.lesson];
  return node.children.flatMap(leavesOf);
}

/** 小単元の状態：その概念のうち、いちばん低い状態（まだ状態がなければ未習） */
export function lessonStatus(lesson: Lesson, statusOf: (conceptId: number) => KnowledgeStatus): KnowledgeStatus {
  if (lesson.concept_ids.length === 0) return "UNKNOWN";
  return lesson.concept_ids.map(statusOf).reduce((a, b) => (rank(b) < rank(a) ? b : a));
}

/** 概念の前提の概念（prerequisite の辺だけ） */
export function prerequisitesOf(conceptIds: number[], edges: ConceptEdge[]): number[] {
  const own = new Set(conceptIds);
  const result: number[] = [];
  for (const e of edges) {
    if (e.relation === "prerequisite" && own.has(e.target) && !own.has(e.source) && !result.includes(e.source)) {
      result.push(e.source);
    }
  }
  return result;
}

/** 前提として足りている（練習中か習得済み） */
export const isReady = (s: KnowledgeStatus) => s === "PRACTICING" || s === "MASTERED";

/**
 * おすすめ（docs/04 の 4.1、ADR-023 A5）。次をすべて満たす小単元。
 * 1. ユーザーの学年以下（高校など学年が比べられないときは問わない）
 * 2. その概念の前提が、すべて練習中か習得済み
 * 3. その概念が、まだすべて習得済みにはなっていない
 */
export function isRecommended(
  lesson: Lesson,
  userGrade: number | null,
  edges: ConceptEdge[],
  statusOf: (conceptId: number) => KnowledgeStatus,
): boolean {
  if (userGrade != null && lesson.grade != null && lesson.grade > userGrade) return false;
  if (!prerequisitesOf(lesson.concept_ids, edges).every((id) => isReady(statusOf(id)))) return false;
  return lesson.concept_ids.some((id) => statusOf(id) !== "MASTERED");
}

export type PrereqItem = { conceptId: number; label: string; status: KnowledgeStatus; ready: boolean };

/** 選んだ小単元の前提の確認。選んだ小単元の中にある概念は前提に数えない */
export function prerequisiteCheck(
  selected: Lesson[],
  edges: ConceptEdge[],
  statusOf: (conceptId: number) => KnowledgeStatus,
  labelOf: (conceptId: number) => string,
): PrereqItem[] {
  const ids = [...new Set(selected.flatMap((l) => l.concept_ids))];
  return prerequisitesOf(ids, edges).map((id) => {
    const status = statusOf(id);
    return { conceptId: id, label: labelOf(id), status, ready: isReady(status) };
  });
}
