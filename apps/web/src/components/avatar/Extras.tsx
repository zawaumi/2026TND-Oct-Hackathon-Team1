import { motion } from "motion/react";
import { BLUE, YELLOW, type PeerEmotion } from "./types";

const CENTER = { originX: 0.5, originY: 0.5 } as const;

/** きらきら（できた・習得）。1回だけ、ぱっと光る */
function Sparkle({ reduce }: { reduce: boolean }) {
  const paths = ["M30 44 L38 54", "M46 30 L49 43", "M22 64 L34 67"];
  return (
    <g stroke={YELLOW} strokeWidth="5" strokeLinecap="round">
      {paths.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          style={CENTER}
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, scale: 0.4 },
                animate: { opacity: [0, 1, 1], scale: [0.4, 1.2, 1] },
                transition: { duration: 0.6, delay: i * 0.1, times: [0, 0.5, 1] },
              })}
        />
      ))}
    </g>
  );
}

/** 紙吹雪（習得）。1回だけ舞い落ちて消える。動きを減らすときは、止めた絵で出す */
function Confetti({ reduce }: { reduce: boolean }) {
  const pieces = [
    { x: 150, y: 30, r: 20, color: "#F28AA6", dx: -6, delay: 0 },
    { x: 166, y: 52, r: -30, color: BLUE, dx: 8, delay: 0.1 },
    { x: 140, y: 18, r: 40, color: "#5FCB7A", dx: -10, delay: 0.05 },
    { x: 176, y: 34, r: 10, color: YELLOW, dx: 12, delay: 0.15 },
  ];
  return (
    <>
      {pieces.map((p) => (
        <motion.g
          key={`${p.x}-${p.y}`}
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 0, x: 0, rotate: 0 },
                animate: { opacity: [0, 1, 1, 0], y: [0, 14, 34, 56], x: [0, p.dx * 0.5, p.dx, p.dx * 1.4], rotate: [0, 120, 240, 360] },
                transition: { duration: 1.7, delay: p.delay, ease: "easeIn", times: [0, 0.15, 0.7, 1] },
              })}
        >
          <rect x={p.x} y={p.y} width="7" height="4" rx="1.5" fill={p.color} transform={`rotate(${p.r} ${p.x} ${p.y})`} />
        </motion.g>
      ))}
    </>
  );
}

/** まわりの飾り（考え中の点・？・聞いている波・きらきら・紙吹雪）。状態ごとの目印にもなる */
export function Extras({ state, reduce }: { state: PeerEmotion; reduce: boolean }) {
  switch (state) {
    case "practice_success":
      return <Sparkle reduce={reduce} />;
    case "mastery_success":
      return (
        <>
          <Sparkle reduce={reduce} />
          <Confetti reduce={reduce} />
        </>
      );
    case "thinking":
      return (
        <g fill="#9DB4F2">
          {[
            { cx: 150, cy: 40, r: 5 },
            { cx: 164, cy: 30, r: 6.5 },
            { cx: 180, cy: 20, r: 8 },
          ].map((c, i) => (
            <motion.circle
              key={c.cx}
              {...c}
              {...(reduce ? {} : { animate: { opacity: [0.25, 1, 0.25] }, transition: { duration: 1.4, repeat: Infinity, delay: i * 0.25 } })}
            />
          ))}
        </g>
      );
    case "question":
      return (
        <motion.text
          x="160"
          y="52"
          fontSize="40"
          fontWeight="700"
          fill={BLUE}
          {...(reduce ? {} : { animate: { y: [52, 46, 52] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } })}
        >
          ?
        </motion.text>
      );
    case "listening":
      return (
        <g stroke="#9DB4F2" strokeWidth="4" fill="none" strokeLinecap="round">
          {["M178 86 Q186 100 178 114", "M188 78 Q200 100 188 122"].map((d, i) => (
            <motion.path
              key={d}
              d={d}
              {...(reduce ? {} : { animate: { opacity: [0.3, 1, 0.3] }, transition: { duration: 1.6, repeat: Infinity, delay: i * 0.3 } })}
            />
          ))}
        </g>
      );
    default:
      return null;
  }
}
