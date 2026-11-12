/** ぴあ友の状態（OpenAPI の PeerResponse.emotion と同じ）。docs/04 の 5.5 */
export type PeerEmotion =
  | "idle"
  | "listening"
  | "thinking"
  | "question"
  | "practice_success"
  | "mastery_success";

/** 状態ごとの一言（docs/04 の 5.5） */
export const EMOTION_LABEL: Record<PeerEmotion, string> = {
  idle: "待っています",
  listening: "聞いています",
  thinking: "考え中…",
  question: "教えてほしいことがあります",
  practice_success: "できました！",
  mastery_success: "習得しました！",
};

/** 動きを止めたとき（reduced motion）も、頭の傾きで状態の違いを残す */
export const TILT: Partial<Record<PeerEmotion, number>> = { listening: -6, thinking: 4, question: 7 };

export const CYAN = "#6FDCF7";
export const NAVY = "#1B2546";
export const BLUE = "#4F7FEA";
export const YELLOW = "#F6C343";
