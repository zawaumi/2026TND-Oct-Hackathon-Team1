"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { Extras } from "./avatar/Extras";
import { Face } from "./avatar/Face";
import { figureSpec, headSpec } from "./avatar/motionSpec";
import { BLUE, EMOTION_LABEL, NAVY, TILT, type PeerEmotion } from "./avatar/types";

export { EMOTION_LABEL };
export type { PeerEmotion };

/**
 * ぴあ友のSVGアバター（デザイン 08_avatar_states。SVG + Motion for React）。
 * - 表情は知識の状態とは別。mastery_success は、サーバーが習得済みへの遷移を確定したときだけ使う。
 * - 成功の演出は、状態が変わったときか eventKey が変わったときだけ再生する。同じ状態・同じ eventKey の
 *   まま描き直しても、再生しない（同じイベントを再受信しても、くり返さない）。
 * - prefers-reduced-motion では動かさず、止めた絵で出す（頭の傾き・？・点・星・紙吹雪で、状態は絵でも分かる）。
 */
export function PeerAvatar({
  state = "idle",
  size = 200,
  className,
  decorative = false,
  eventKey,
  animated = true,
}: {
  state?: PeerEmotion;
  size?: number;
  className?: string;
  /** まわりに同じ情報の文字があるときは true（読み上げを重複させない） */
  decorative?: boolean;
  /** 確定イベントの識別子（例：turn:12:101）。変わったときだけ、成功の演出をもう一度再生する */
  eventKey?: string | null;
  /** false なら、動かさない（会話の小さなアイコンなど） */
  animated?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const prefersReduced = useReducedMotion();
  const reduce = !animated || !!prefersReduced;

  const fig = figureSpec(state);
  const head = headSpec(state);
  const tilt = TILT[state] ?? 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `ぴあ友（${EMOTION_LABEL[state]}）`}
      data-state={state}
      data-event-key={eventKey ?? undefined}
      data-motion={reduce ? "reduced" : "full"}
    >
      <defs>
        <radialGradient id={`h${uid}`} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.7" stopColor="#EEF3FE" />
          <stop offset="1" stopColor="#C9D8F8" />
        </radialGradient>
        <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D3E0FA" />
        </linearGradient>
        <linearGradient id={`v${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#25335E" />
          <stop offset="1" stopColor={NAVY} />
        </linearGradient>
      </defs>
      {/* key が変わると、動きが最初からやり直しになる（状態が変わったとき・新しいイベントのとき） */}
      <g key={`${state}:${eventKey ?? ""}`}>
        <Extras state={state} reduce={reduce} />
        <motion.g
          style={{ originX: 0.5, originY: 1 }}
          {...(reduce ? {} : { animate: fig.animate, transition: fig.transition })}
        >
          <path d="M42 200 C42 168 66 150 100 150 C134 150 158 168 158 200 Z" fill={`url(#b${uid})`} />
          <ellipse cx="100" cy="152" rx="26" ry="7" fill="#C2D4F7" />
          <motion.g
            style={{ originX: 0.5, originY: 0.6, ...(reduce ? { rotate: tilt } : {}) }}
            {...(reduce ? {} : { animate: head.animate, transition: head.transition })}
          >
            <circle cx="38" cy="98" r="15" fill={BLUE} />
            <circle cx="38" cy="98" r="8" fill="#8DB0F5" />
            <circle cx="162" cy="98" r="15" fill={BLUE} />
            <circle cx="162" cy="98" r="8" fill="#8DB0F5" />
            <path d="M118 42 L126 30" stroke="#C9D8F8" strokeWidth="4" strokeLinecap="round" />
            <circle cx="128" cy="27" r="6" fill="#9DB4F2" />
            <ellipse cx="100" cy="96" rx="62" ry="56" fill={`url(#h${uid})`} />
            <rect x="56" y="66" width="88" height="62" rx="29" fill={`url(#v${uid})`} />
            <path d="M68 76 Q80 70 96 70" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="5" fill="none" strokeLinecap="round" />
            <Face state={state} reduce={reduce} />
          </motion.g>
        </motion.g>
      </g>
    </svg>
  );
}
