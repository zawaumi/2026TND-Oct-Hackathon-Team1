"use client";

import { useState } from "react";
import { KnowledgeState, type KnowledgeStatus } from "@/components/KnowledgeState";
import type { Lesson } from "@/lib/api/client";
import { isLeaf, MAX_SELECTION, type LessonNode } from "@/lib/lessons";

type Props = {
  tree: LessonNode[];
  selected: Map<number, Lesson>;
  onToggle: (lesson: Lesson) => void;
  onToggleAll: (lessons: Lesson[], select: boolean) => void;
  statusOf: (lesson: Lesson) => KnowledgeStatus;
  recommended: (lesson: Lesson) => boolean;
};

/** 最初に開いておく枝：選んでいる・おすすめの小単元を含む枝。なければ先頭の枝 */
function initialOpen(tree: LessonNode[], selected: Map<number, Lesson>, recommended: (l: Lesson) => boolean) {
  const open = new Set<number>();
  const walk = (n: LessonNode): boolean => {
    if (isLeaf(n)) return selected.has(n.lesson.id) || recommended(n.lesson);
    const hit = n.children.map(walk).some(Boolean);
    if (hit) open.add(n.lesson.id);
    return hit;
  };
  tree.forEach(walk);
  if (open.size === 0) {
    let n: LessonNode | undefined = tree[0];
    while (n && !isLeaf(n)) {
      open.add(n.lesson.id);
      n = n.children[0];
    }
  }
  return open;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-4.5 shrink-0 text-sub transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

export function RecommendBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF3C9] px-2.5 py-0.5 text-[12px] font-bold text-[#6B4A00]">
      <StarIcon />
      おすすめ
    </span>
  );
}

/** 単元 → 小単元の階層（docs/04 の 4.1） */
export function LessonTree(props: Props) {
  const { tree, selected, recommended } = props;
  const [open, setOpen] = useState(() => initialOpen(tree, selected, recommended));
  const toggleOpen = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="flex flex-col">
      {tree.map((n) => (
        <Branch key={n.lesson.id} node={n} depth={0} open={open} onOpen={toggleOpen} {...props} />
      ))}
    </ul>
  );
}

function Branch({
  node,
  depth,
  open,
  onOpen,
  ...props
}: Props & { node: LessonNode; depth: number; open: Set<number>; onOpen: (id: number) => void }) {
  if (isLeaf(node)) return <Leaf lesson={node.lesson} {...props} />;

  const isOpen = open.has(node.lesson.id);
  const leafChildren = node.children.filter(isLeaf).map((c) => c.lesson);
  const allSelected = leafChildren.length > 0 && leafChildren.every((l) => props.selected.has(l.id));
  const listId = `lesson-branch-${node.lesson.id}`;

  return (
    <li className={depth === 0 ? "border-b border-line last:border-b-0" : ""}>
      <div className={`flex items-center justify-between gap-3 py-2.5 ${depth > 0 ? "pl-3 lg:pl-5" : ""}`}>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => onOpen(node.lesson.id)}
          className="flex min-w-0 items-center gap-2 rounded-lg py-1 text-left"
        >
          <Chevron open={isOpen} />
          <span className={`truncate font-bold ${depth === 0 ? "text-[16px]" : "text-[16px] lg:text-[17px]"}`}>
            {node.lesson.title}
          </span>
        </button>
        {isOpen && leafChildren.length > 0 && (
          <button
            type="button"
            onClick={() => props.onToggleAll(leafChildren, !allSelected)}
            className="shrink-0 text-[13.5px] font-bold text-link underline underline-offset-2"
          >
            {allSelected ? "まとめて外す" : "まとめて選ぶ"}
          </button>
        )}
      </div>
      <ul id={listId} hidden={!isOpen} className={`flex flex-col gap-2.5 pb-3 ${depth > 0 ? "lg:pl-7" : "lg:pl-5"}`}>
        {node.children.map((c) => (
          <Branch key={c.lesson.id} node={c} depth={depth + 1} open={open} onOpen={onOpen} {...props} />
        ))}
      </ul>
    </li>
  );
}

function Leaf({ lesson, selected, onToggle, statusOf, recommended }: Props & { lesson: Lesson }) {
  const checked = selected.has(lesson.id);
  const full = !checked && selected.size >= MAX_SELECTION;
  const rec = recommended(lesson);
  const status = statusOf(lesson);
  const id = `lesson-${lesson.id}`;
  return (
    <li>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
          checked ? "border-[#9DB2EE] bg-[#F0F4FE]" : "border-line bg-card hover:bg-[#FAFBFF]"
        } ${full ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={full}
          onChange={() => onToggle(lesson)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
            checked ? "border-primary bg-primary" : "border-[#A9AFCB] bg-card"
          }`}
        >
          {checked && (
            <svg viewBox="0 0 24 24" className="size-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
        {/* PC：名前・おすすめ・状態を1行。スマホ：名前の下に状態とおすすめ */}
        <span className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-4">
          <span className="min-w-0 flex-1 text-[16px] font-bold">{lesson.title}</span>
          <span className="flex items-center gap-2 lg:contents">
            <KnowledgeState status={status} className="lg:order-2 lg:w-24 lg:justify-end" />
            {rec && (
              <span className="lg:order-1">
                <RecommendBadge />
              </span>
            )}
          </span>
        </span>
      </label>
    </li>
  );
}
