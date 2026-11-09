import { useId } from "react";

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

const CYAN = "#6FDCF7";
const NAVY = "#1B2546";
const BLUE = "#4F7FEA";
const YELLOW = "#F6C343";

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return <polygon points={pts.join(" ")} fill={YELLOW} />;
}

function Face({ state }: { state: PeerEmotion }) {
  const line = { stroke: CYAN, fill: "none", strokeLinecap: "round" as const };
  switch (state) {
    case "idle":
      return (
        <>
          <rect x="80" y="88" width="9" height="14" rx="4.5" fill={CYAN} />
          <rect x="111" y="88" width="9" height="14" rx="4.5" fill={CYAN} />
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
          {star(84, 94, 10)}
          {star(116, 94, 10)}
          <path d="M88 107 Q100 124 112 107 Z" fill={CYAN} />
        </>
      );
  }
}

function Extras({ state }: { state: PeerEmotion }) {
  const sparkle = (
    <g stroke={YELLOW} strokeWidth="5" strokeLinecap="round">
      <path d="M30 44 L38 54" />
      <path d="M46 30 L49 43" />
      <path d="M22 64 L34 67" />
    </g>
  );
  switch (state) {
    case "practice_success":
      return sparkle;
    case "mastery_success":
      return (
        <>
          {sparkle}
          <rect x="150" y="30" width="7" height="4" rx="1.5" fill="#F28AA6" transform="rotate(20 150 30)" />
          <rect x="166" y="52" width="7" height="4" rx="1.5" fill={BLUE} transform="rotate(-30 166 52)" />
          <rect x="140" y="18" width="7" height="4" rx="1.5" fill="#5FCB7A" transform="rotate(40 140 18)" />
          <rect x="176" y="34" width="7" height="4" rx="1.5" fill={YELLOW} transform="rotate(10 176 34)" />
        </>
      );
    case "thinking":
      return (
        <g fill="#9DB4F2">
          <circle cx="150" cy="40" r="5" />
          <circle cx="164" cy="30" r="6.5" />
          <circle cx="180" cy="20" r="8" />
        </g>
      );
    case "question":
      return (
        <text x="160" y="52" fontSize="40" fontWeight="700" fill={BLUE}>
          ?
        </text>
      );
    case "listening":
      return (
        <g stroke="#9DB4F2" strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M178 86 Q186 100 178 114" />
          <path d="M188 78 Q200 100 188 122" />
        </g>
      );
    default:
      return null;
  }
}

const TILT: Partial<Record<PeerEmotion, number>> = { listening: -6, thinking: 4, question: 7 };

/**
 * ぴあ友のSVGアバター（デザイン 08_avatar_states）。
 * 表情は知識の状態とは別。mastery_success は DRF が習得済みに更新したときだけ使う。
 */
export function PeerAvatar({
  state = "idle",
  size = 200,
  className,
  decorative = false,
}: {
  state?: PeerEmotion;
  size?: number;
  className?: string;
  /** まわりに同じ情報の文字があるときは true（読み上げを重複させない） */
  decorative?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
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
      <Extras state={state} />
      <path d="M42 200 C42 168 66 150 100 150 C134 150 158 168 158 200 Z" fill={`url(#b${uid})`} />
      <ellipse cx="100" cy="152" rx="26" ry="7" fill="#C2D4F7" />
      <g transform={`rotate(${tilt} 100 96)`} style={{ transition: "transform 300ms ease" }}>
        <circle cx="38" cy="98" r="15" fill={BLUE} />
        <circle cx="38" cy="98" r="8" fill="#8DB0F5" />
        <circle cx="162" cy="98" r="15" fill={BLUE} />
        <circle cx="162" cy="98" r="8" fill="#8DB0F5" />
        <path d="M118 42 L126 30" stroke="#C9D8F8" strokeWidth="4" strokeLinecap="round" />
        <circle cx="128" cy="27" r="6" fill="#9DB4F2" />
        <ellipse cx="100" cy="96" rx="62" ry="56" fill={`url(#h${uid})`} />
        <rect x="56" y="66" width="88" height="62" rx="29" fill={`url(#v${uid})`} />
        <path d="M68 76 Q80 70 96 70" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="5" fill="none" strokeLinecap="round" />
        <Face state={state} />
      </g>
    </svg>
  );
}
