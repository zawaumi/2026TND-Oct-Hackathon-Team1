import { motion } from "motion/react";
import { CYAN, YELLOW, type PeerEmotion } from "./types";

function star(cx: number, cy: number, r: number, pop: boolean, delay: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  // 星の目：現れるときに、ぽんと大きくなる（動きを減らすときは、そのまま出す）
  return (
    <motion.g
      style={{ originX: 0.5, originY: 0.5 }}
      {...(pop
        ? { initial: { scale: 0.2, opacity: 0 }, animate: { scale: [0.2, 1.35, 1], opacity: 1 }, transition: { duration: 0.5, delay, times: [0, 0.6, 1] } }
        : {})}
    >
      <polygon points={pts.join(" ")} fill={YELLOW} />
    </motion.g>
  );
}

/** 顔（ほっぺは描かない。ADR-036）。表情は、知識の状態とは別 */
export function Face({ state, reduce }: { state: PeerEmotion; reduce: boolean }) {
  const line = { stroke: CYAN, fill: "none", strokeLinecap: "round" as const };
  switch (state) {
    case "idle":
      return (
        <>
          {/* ときどきまばたきする */}
          <motion.g
            style={{ originX: 0.5, originY: 0.5 }}
            {...(reduce
              ? {}
              : {
                  animate: { scaleY: [1, 1, 0.1, 1, 1] },
                  transition: { duration: 4.2, times: [0, 0.9, 0.94, 0.98, 1], repeat: Infinity, ease: "linear" },
                })}
          >
            <rect x="80" y="88" width="9" height="14" rx="4.5" fill={CYAN} />
            <rect x="111" y="88" width="9" height="14" rx="4.5" fill={CYAN} />
          </motion.g>
          <path d="M91 111 Q100 118 109 111" strokeWidth="4" {...line} />
        </>
      );
    case "listening":
      return (
        <>
          <circle cx="84" cy="95" r="7.5" fill={CYAN} />
          <circle cx="116" cy="95" r="7.5" fill={CYAN} />
          <circle cx="86.5" cy="92.5" r="2.4" fill="#FFFFFF" />
          <circle cx="118.5" cy="92.5" r="2.4" fill="#FFFFFF" />
          <path d="M93 112 Q100 117 107 112" strokeWidth="4" {...line} />
        </>
      );
    case "thinking":
      return (
        <>
          <circle cx="81" cy="90" r="6" fill={CYAN} />
          <circle cx="113" cy="90" r="6" fill={CYAN} />
          <path d="M92 113 L108 111" strokeWidth="4" {...line} />
        </>
      );
    case "question":
      return (
        <>
          <circle cx="84" cy="96" r="6.5" fill={CYAN} />
          <path d="M108 90 Q116 84 124 90" strokeWidth="4" {...line} />
          <circle cx="116" cy="97" r="6.5" fill={CYAN} />
          <path d="M92 114 Q96 110 100 114 Q104 118 108 114" strokeWidth="3.6" {...line} />
        </>
      );
    case "practice_success":
      return (
        <>
          <path d="M77 97 Q84 87 91 97" strokeWidth="5" {...line} />
          <path d="M109 97 Q116 87 123 97" strokeWidth="5" {...line} />
          <path d="M89 108 Q100 121 111 108" strokeWidth="4.5" {...line} />
        </>
      );
    case "mastery_success":
      return (
        <>
          {star(84, 94, 10, !reduce, 0.15)}
          {star(116, 94, 10, !reduce, 0.25)}
          <path d="M88 107 Q100 124 112 107 Z" fill={CYAN} />
        </>
      );
  }
}
