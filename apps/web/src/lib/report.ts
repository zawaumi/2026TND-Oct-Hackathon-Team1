import type { EvaluationCriterion, EvaluationReport } from "@/lib/api/client";

/** 3観点の表示名と配点（ADR-015）。APIに label・weight がなければこれを使う */
export const CRITERIA: Record<EvaluationCriterion["code"], { label: string; weight: number }> = {
  accuracy: { label: "正確さ", weight: 40 },
  logic: { label: "論理性", weight: 30 },
  clarity: { label: "分かりやすさ", weight: 30 },
};

export const criterionLabel = (c: EvaluationCriterion) => c.label ?? CRITERIA[c.code].label;
export const criterionWeight = (c: EvaluationCriterion) => c.weight ?? CRITERIA[c.code].weight;

/** 点数が「改善のヒント」になる境目（docs/04 の 7.1） */
export const HINT_BELOW = 70;

export function unratedCriteria(report: EvaluationReport) {
  return report.criterion_results.filter((c) => c.status === "UNRATED");
}

/** 改善のヒント：点数が70点未満の観点の説明 */
export function improvementHints(report: EvaluationReport) {
  return report.criterion_results
    .filter((c) => c.status === "SCORED" && c.score != null && c.score < HINT_BELOW && c.explanation)
    .map((c) => ({ label: criterionLabel(c), text: c.explanation! }));
}

/** 点数を出せるか。合計はサーバーが評価保留を除いて割り戻した値（docs/03 の G） */
export function hasScore(report: EvaluationReport): report is EvaluationReport & { total_score: number } {
  return report.status !== "UNAVAILABLE" && report.total_score != null;
}

/**
 * ぴあ友のひとこと（docs/04 の 7.1）。APIからは受け取らず、決まった文から選ぶ。上の条件ほど優先。
 */
export function peerComment(report: EvaluationReport, labelOf: (conceptId: number) => string): string {
  const changes = report.knowledge_changes ?? [];
  const mastered = changes.find((c) => c.new_status === "MASTERED");
  if (mastered) return `「${labelOf(mastered.concept_id)}」を覚えました！ありがとうございます！`;
  const practicing = changes.find((c) => c.new_status === "PRACTICING");
  if (practicing) return `「${labelOf(practicing.concept_id)}」の問題、もう少し練習したいです！`;
  const unrated = unratedCriteria(report);
  const results = report.criterion_results;
  if (results.length > 0 && unrated.length === results.length) {
    return "今日はあまりお話しできませんでした。また教えてください！";
  }
  if (unrated.length > 0) {
    return `${unrated.map(criterionLabel).join("・")}のところは、もっと聞いてみたかったです。`;
  }
  return "今日もありがとうございました！また教えてください！";
}
