import type { KnowledgeChange } from "@/lib/api/types";

/**
 * 習得の演出を「確定したイベントにつき1回だけ」出すための部品（docs/04 の 5.5）。
 *
 * API には event_id がないので、重複の判定には、次の組を使う（契約を変えない案）。
 * - 教えた応答（MessageResponse）：セッション内の turn_id と concept_id の組
 * - ぴあ友の解答（ExerciseAttempt）：attempt.id と concept_id の組
 * turn_id と attempt.id は別々に採番されるので、種類（kind）も含めて区別する。
 */
export type EventSource = { kind: "turn" | "attempt"; id: number };

export function masteryEventKey(source: EventSource, conceptId: number): string {
  return `${source.kind}:${source.id}:${conceptId}`;
}

/**
 * 「習得済みへの確定した遷移」か。サーバー（DRF）が返した knowledge_changes の
 * old_status → new_status だけを見る。もともと習得済みのもの（MASTERED → MASTERED）は遷移ではない。
 * ぴあ友の発言（emotion）や、LLM の「分かった」は、ここには入らない。
 */
export function isMasteryTransition(change: Pick<KnowledgeChange, "old_status" | "new_status">): boolean {
  return change.new_status === "MASTERED" && change.old_status !== "MASTERED";
}

/**
 * 見たイベントの記録。claim(key) は、初めてなら true（記録する）、すでに見たなら false。
 *
 * 保持の決まり：授業の画面を開いている間（メモリの中だけ。再読み込みで消える）、最大 max 件。
 * 超えたら、古いものから忘れる。再読み込みのあとは、サーバーから同じイベントが届くことはない
 * （応答は送信ごとにだけ届く）ので、保存して持ち越す必要はない。
 */
export class EventLedger {
  private readonly seen = new Set<string>();

  constructor(private readonly max = 200) {}

  claim(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    while (this.seen.size > this.max) {
      const oldest = this.seen.values().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return true;
  }

  has(key: string): boolean {
    return this.seen.has(key);
  }

  get size(): number {
    return this.seen.size;
  }
}
