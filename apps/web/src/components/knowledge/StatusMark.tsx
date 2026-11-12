import type { Status } from "@/lib/knowledgeMap";

/**
 * 4つの状態の印（アイコン）。色だけに頼らず、形も変える（docs/04 の 6.1・11）。
 * 未習＝点線の輪、説明済み＝淡く点灯、練習中＝進捗の輪、習得済み＝はっきり点灯（チェック）。
 */
export function StatusMark({ status, ratio, size = 18 }: { status: Status; ratio?: number | null; size?: number }) {
  const r = 7;
  const circ = 2 * Math.PI * r;
  const arc = Math.max(0.12, Math.min(1, ratio ?? 0.5)) * circ; // 進み具合が分からないときは、半分ほど
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      {status === "UNKNOWN" && <circle cx="9" cy="9" r={r} fill="none" stroke="#8A8FB0" strokeWidth="1.8" strokeDasharray="2.6 2.6" />}
      {status === "INTRODUCED" && (
        <>
          <circle cx="9" cy="9" r={r} fill="#DCE6FD" stroke="#7F9FEF" strokeWidth="1.8" />
          <circle cx="9" cy="9" r="2.2" fill="#7F9FEF" />
        </>
      )}
      {status === "PRACTICING" && (
        <>
          <circle cx="9" cy="9" r={r} fill="none" stroke="#C9D6F7" strokeWidth="2.6" />
          <circle
            cx="9"
            cy="9"
            r={r}
            fill="none"
            stroke="#4677E6"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ}`}
            transform="rotate(-90 9 9)"
          />
        </>
      )}
      {status === "MASTERED" && (
        <>
          <circle cx="9" cy="9" r="8" fill="#4677E6" />
          <path d="M5.2 9.3 L8 12 L12.8 6.4" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** ノード・凡例の見た目（点線の輪郭／淡く点灯／進捗の輪／はっきり点灯） */
export const NODE_STYLE: Record<Status, string> = {
  UNKNOWN: "border-2 border-dashed border-[#9A9FBF] bg-white/80 text-sub",
  INTRODUCED: "border-2 border-[#BFD0FA] bg-[#EEF3FF] text-ink",
  PRACTICING: "border-2 border-[#7FA0F0] bg-[#E3ECFF] text-ink",
  MASTERED: "border-2 border-primary bg-[#CFE0FF] text-ink shadow-[0_0_16px_rgba(70,119,230,0.5)]",
};
