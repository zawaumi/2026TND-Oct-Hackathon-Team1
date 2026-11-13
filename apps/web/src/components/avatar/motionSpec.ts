import type { TargetAndTransition, Transition } from "motion/react";
import type { PeerEmotion } from "./types";

/** 状態ごとの動き。待つ・聞く・考える・質問は、ゆっくり繰り返す。成功は、1回だけ跳ねる */
export type Spec = { animate: TargetAndTransition; transition: Transition };

const LOOP = { repeat: Infinity, ease: "easeInOut" } as const;

/** 体ぜんたいの上下（足もとを軸に） */
export function figureSpec(state: PeerEmotion): Spec {
  switch (state) {
    case "idle":
      return { animate: { y: [0, -3, 0] }, transition: { duration: 3.4, ...LOOP } };
    case "listening":
      return { animate: { y: [0, -2, 0] }, transition: { duration: 1.8, ...LOOP } };
    case "thinking":
      return { animate: { y: [0, -1.5, 0] }, transition: { duration: 2.6, ...LOOP } };
    case "question":
      return { animate: { y: [0, -2, 0] }, transition: { duration: 2.4, ...LOOP } };
    case "practice_success":
      return {
        animate: { y: [0, -12, 0, -4, 0] },
        transition: { duration: 0.9, ease: "easeOut", times: [0, 0.3, 0.6, 0.8, 1] },
      };
    case "mastery_success":
      return {
        animate: { y: [0, -26, 0, -12, 0], scale: [1, 1.05, 1, 1.02, 1] },
        transition: { duration: 1.3, ease: "easeOut", times: [0, 0.3, 0.6, 0.8, 1] },
      };
  }
}

/** 頭の傾き（首をかしげる・うなずく） */
export function headSpec(state: PeerEmotion): Spec {
  switch (state) {
    case "idle":
      return { animate: { rotate: 0 }, transition: { duration: 0.3 } };
    case "listening":
      return { animate: { rotate: [-6, -8, -6] }, transition: { duration: 1.8, ...LOOP } };
    case "thinking":
      return { animate: { rotate: [2, 6, 2] }, transition: { duration: 2.4, ...LOOP } };
    case "question":
      return { animate: { rotate: [6, 9, 6] }, transition: { duration: 2.6, ...LOOP } };
    case "practice_success":
      return { animate: { rotate: [0, -5, 5, 0] }, transition: { duration: 0.9, ease: "easeOut" } };
    case "mastery_success":
      return { animate: { rotate: [0, -6, 6, -4, 0] }, transition: { duration: 1.3, ease: "easeOut" } };
  }
}
