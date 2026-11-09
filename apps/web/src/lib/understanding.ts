import type { KnowledgeStatus } from "@/components/KnowledgeState";

/** ぴあ友の理解度の点（docs/04 の 5.6、ADR-032） */
const POINT: Record<KnowledgeStatus, number> = {
  UNKNOWN: 0,
  INTRODUCED: 1 / 3,
  PRACTICING: 2 / 3,
  MASTERED: 1,
};

/**
 * 選んだ小単元の概念の状態を点にして平均し、0〜100 の整数で返す。
 * 概念がひとつもないときは null（画面では理解度を出さない）。
 * 授業の進み具合の目安で、習得の判定には使わない。
 */
export function understandingPercent(statuses: KnowledgeStatus[]): number | null {
  if (statuses.length === 0) return null;
  const sum = statuses.reduce((acc, s) => acc + POINT[s], 0);
  return Math.round((sum / statuses.length) * 100);
}
