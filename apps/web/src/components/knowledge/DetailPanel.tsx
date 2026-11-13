"use client";

import Link from "next/link";
import type { Lesson, PeerKnowledge } from "@/lib/api/types";
import { masteryCondition, progressText, STATUS_NAME, type Status } from "@/lib/knowledgeMap";
import { StatusMark } from "./StatusMark";

export type DetailData = {
  id: number;
  label: string;
  description: string | null;
  status: Status;
  item: PeerKnowledge | undefined;
  prerequisites: { id: number; label: string; status: Status }[];
  lessons: Pick<Lesson, "id" | "title">[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <h3 className="text-[13px] font-bold text-sub">{title}</h3>
      <div className="mt-1.5 text-[14.5px] leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * ノードの詳細（docs/04 の 6.1）：概念の説明・関係する小単元・前提・習得条件・検証済みの進み具合。
 * 習得条件の文は、API の数値から画面で作る（ADR-023 A6）。
 */
export function DetailPanel({
  data,
  onSelect,
  titleId,
}: {
  data: DetailData;
  onSelect: (id: number) => void;
  titleId: string;
}) {
  const condition = masteryCondition(data.item);
  const progress = progressText(data.item);
  const ratio = data.item && data.item.required_correct > 0 ? Math.min(1, data.item.verified_correct / data.item.required_correct) : null;
  const teach = data.lessons[0];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 id={titleId} className="text-[19px] leading-snug font-black">
          {data.label}
        </h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-bold">
          <StatusMark status={data.status} ratio={ratio} size={20} />
          {STATUS_NAME[data.status]}
        </p>
      </div>

      <Section title="概念の説明">{data.description?.trim() || <span className="text-sub">説明は、まだありません。</span>}</Section>

      <Section title="関係する小単元">
        {data.lessons.length > 0 ? (
          <ul className="list-disc pl-5">
            {data.lessons.map((l) => (
              <li key={l.id}>{l.title}</li>
            ))}
          </ul>
        ) : (
          <span className="text-sub">まだ、小単元にありません。</span>
        )}
      </Section>

      <Section title="前提（先に学ぶ概念）">
        {data.prerequisites.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {data.prerequisites.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-outline bg-card px-3 py-1.5 text-left hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
                >
                  <StatusMark status={p.status} size={16} />
                  <span className="flex-1 font-bold">{p.label}</span>
                  <span className="text-[12.5px] text-sub">{STATUS_NAME[p.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-sub">前提は、ありません。</span>
        )}
      </Section>

      <Section title="習得条件">{condition ?? <span className="text-sub">習得条件の情報は、まだありません。</span>}</Section>

      {progress && (
        <Section title="検証済みの進み具合">
          <p className="font-bold tabular-nums">{progress}</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }} />
          </div>
        </Section>
      )}

      {teach && (
        <Link
          href={`/lessons/?select=${teach.id}`}
          className="mt-1 flex h-12 items-center justify-center rounded-2xl bg-primary text-[15.5px] font-bold text-white hover:bg-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
        >
          この概念を教える
        </Link>
      )}
    </div>
  );
}
