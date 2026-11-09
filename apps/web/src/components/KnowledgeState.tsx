import type { components } from "@/lib/api/schema";

export type KnowledgeStatus = components["schemas"]["KnowledgeStatus"];

/** 4状態の表示名（用語集）。画面では別の言い方をしない */
export const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  UNKNOWN: "未習",
  INTRODUCED: "説明済み",
  PRACTICING: "練習中",
  MASTERED: "習得済み",
};

function Icon({ status }: { status: KnowledgeStatus }) {
  switch (status) {
    case "UNKNOWN":
      return <circle cx="12" cy="12" r="8" stroke="#8A8DA6" strokeWidth="2" strokeDasharray="3 3" fill="none" />;
    case "INTRODUCED":
      return <circle cx="12" cy="12" r="8" stroke="#7D97E6" strokeWidth="2" fill="#E3E9FC" />;
    case "PRACTICING":
      return (
        <>
          <circle cx="12" cy="12" r="8" stroke="#D5DCF5" strokeWidth="3" fill="none" />
          <path d="M12 4a8 8 0 0 1 8 8" stroke="#3D69DB" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case "MASTERED":
      return (
        <>
          <circle cx="12" cy="12" r="9" fill="#3D69DB" />
          <path d="M8 12.3l2.7 2.7L16 9.7" stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
  }
}

/** ぴあ友の習得の状態。色だけでなくアイコンと文字で示す（docs/04 の 1） */
export function KnowledgeState({ status, className = "" }: { status: KnowledgeStatus; className?: string }) {
  const color = status === "UNKNOWN" ? "text-[#4A4D66]" : "text-link";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium ${color} ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <Icon status={status} />
      </svg>
      {STATUS_LABEL[status]}
    </span>
  );
}
