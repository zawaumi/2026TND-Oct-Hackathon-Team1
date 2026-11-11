"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { STATUS_LABEL, type KnowledgeStatus } from "@/components/KnowledgeState";
import { PeerAvatar } from "@/components/PeerAvatar";
import { api, type ConceptEdge, type Lesson, type Profile, type SchoolLevel } from "@/lib/api/client";
import {
  buildTree,
  isRecommended,
  lessonStatus,
  MAX_SELECTION,
  prerequisiteCheck,
  type PrereqItem,
} from "@/lib/lessons";
import { loadProfile } from "@/lib/useProfile";
import { LessonTree } from "./LessonTree";

/** 教科（中学）と科目（高校）。MVPで公開しているのは中学の数学だけ（ADR-028） */
const SUBJECTS: Record<SchoolLevel, { value: string; label: string }[]> = {
  middle: [{ value: "math", label: "数学" }],
  high: [
    { value: "math1", label: "数学Ⅰ" },
    { value: "matha", label: "数学A" },
  ],
};
const SUBJECT_KEY = "piatomo.lessons.subject";

function savedSubject(level: SchoolLevel): string {
  const options = SUBJECTS[level];
  try {
    const v = localStorage.getItem(`${SUBJECT_KEY}.${level}`);
    if (v && options.some((o) => o.value === v)) return v;
  } catch {
    // 保存できない環境では既定の教科
  }
  return options[0].value;
}
function saveSubject(level: SchoolLevel, value: string) {
  try {
    localStorage.setItem(`${SUBJECT_KEY}.${level}`, value);
  } catch {
    // 保存できなくても動作には関係しない
  }
}

type Base = {
  profile: Profile;
  status: Map<number, KnowledgeStatus>;
  labels: Map<number, string>;
  edges: ConceptEdge[];
  lastLessonTitle: string | null;
  preselect: Lesson | null;
};

/* ───────── 読み込み ───────── */

export function LessonPicker() {
  const params = useSearchParams();
  const selectId = Number(params.get("select"));
  const [base, setBase] = useState<Base | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [profile, knowledge, graph, recent] = await Promise.all([
          loadProfile(),
          api.getPeerKnowledge(),
          api.getKnowledgeGraph(),
          api.listSessions(1),
        ]);
        const lastId = recent[0]?.lesson_ids[0];
        const [last, preselect] = await Promise.all([
          lastId ? api.getLesson(lastId).catch(() => null) : null,
          Number.isInteger(selectId) && selectId > 0 ? api.getLesson(selectId).catch(() => null) : null,
        ]);
        if (!alive) return;
        setBase({
          profile,
          status: new Map(knowledge.items.map((k) => [k.concept_id, k.status])),
          labels: new Map(graph.nodes.map((n) => [n.id, n.label])),
          edges: graph.edges,
          lastLessonTitle: last?.title ?? null,
          preselect: preselect && preselect.concept_ids.length > 0 ? preselect : null,
        });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectId, attempt]);

  return (
    <AppShell active="lessons">
      {base ? (
        <Picker base={base} />
      ) : failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
          <p className="text-[15px]">通信できませんでした。</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="rounded-2xl bg-primary px-6 py-3 font-bold text-white"
          >
            もう一度
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center" role="status">
          <p className="text-[15px] text-sub">読み込み中…</p>
        </div>
      )}
    </AppShell>
  );
}

/* ───────── 画面本体 ───────── */

function Picker({ base }: { base: Base }) {
  const router = useRouter();
  const { profile, preselect } = base;

  // 初めに開く校種と学年はプロフィールの値、教科は前回選んだもの（docs/04 の 4.1）
  const [level, setLevel] = useState<SchoolLevel>(profile.school_level);
  const [grade, setGrade] = useState<number>(preselect?.grade ?? profile.grade ?? 1);
  const [subject, setSubject] = useState<string>(() => savedSubject(profile.school_level));
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lessonsFailed, setLessonsFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Map<number, Lesson>>(
    () => new Map(preselect ? [[preselect.id, preselect]] : []),
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
  const detailRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .getLessons({ school_level: level, grade: level === "middle" ? grade : undefined, subject })
      .then((list) => {
        if (!alive) return;
        setLessons(list);
        setLessonsFailed(false);
      })
      .catch(() => alive && setLessonsFailed(true));
    return () => {
      alive = false;
    };
  }, [level, grade, subject, reload]);

  const statusOfConcept = useCallback((id: number) => base.status.get(id) ?? "UNKNOWN", [base.status]);
  const userGrade = profile.school_level === level && level === "middle" ? profile.grade : null;
  const tree = useMemo(() => (lessons ? buildTree(lessons) : []), [lessons]);
  const statusOf = useCallback((l: Lesson) => lessonStatus(l, statusOfConcept), [statusOfConcept]);
  const recommended = useCallback(
    (l: Lesson) => isRecommended(l, userGrade, base.edges, statusOfConcept),
    [userGrade, base.edges, statusOfConcept],
  );

  const selectedList = [...selected.values()];
  const prereqs = useMemo(
    () =>
      prerequisiteCheck(selectedList, base.edges, statusOfConcept, (id) => base.labels.get(id) ?? `概念 ${id}`),
    // selectedList は selected から作るので selected を見ればよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, base.edges, base.labels, statusOfConcept],
  );

  // 選択の変更はクリックごとに1回なので、いまの selected から次の状態を作る
  const toggle = (lesson: Lesson) => {
    const next = new Map(selected);
    if (next.has(lesson.id)) next.delete(lesson.id);
    else if (next.size < MAX_SELECTION) next.set(lesson.id, lesson);
    setSelected(next);
    setStartError(null);
    setLimitNotice(next.size >= MAX_SELECTION);
  };
  const toggleAll = (list: Lesson[], select: boolean) => {
    const next = new Map(selected);
    for (const l of list) {
      if (!select) next.delete(l.id);
      else if (next.size < MAX_SELECTION) next.set(l.id, l);
    }
    setSelected(next);
    setStartError(null);
    setLimitNotice(next.size >= MAX_SELECTION || (select && list.some((l) => !next.has(l.id))));
  };

  const changeLevel = (v: SchoolLevel) => {
    setLevel(v);
    setSubject(savedSubject(v));
    setLessons(null);
  };
  const changeSubject = (v: string) => {
    setSubject(v);
    saveSubject(level, v);
    setLessons(null);
  };
  const changeGrade = (v: number) => {
    setGrade(v);
    setLessons(null);
  };

  const start = async () => {
    if (selected.size === 0 || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      // 並びは選んだ順ではなく、木の並び（単元の順）にそろえる
      const order = new Map((lessons ?? []).map((l, i) => [l.id, i]));
      const ids = selectedList
        .map((l) => l.id)
        .sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
      const session = await api.createSession(ids);
      router.push(`/study/?session=${session.id}`);
    } catch {
      // 失敗しても選択は残す（docs/04 の 4.1）
      setStartError("授業を始められませんでした。もう一度押してください。");
      setStarting(false);
    }
  };

  const gradeLabel = profile.school_level === "middle" ? `中学${profile.grade ?? ""}年` : "高校";
  const subjects = SUBJECTS[level];
  const filterKey = `${level}-${grade}-${subject}`;

  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-4 pt-6 pb-36 lg:px-0 lg:pt-7 lg:pb-10">
      {/* 見出し：PCは見出しだけ、スマホは画面名とぴあ友の吹き出し */}
      <h1 className="hidden text-center text-[30px] font-black tracking-wide lg:block">
        先生になって、ぴあ友に教えてあげよう！
      </h1>
      <div className="lg:hidden">
        <h1 className="text-[19px] font-bold">教える内容を選ぶ</h1>
        <div className="mt-3 flex items-center gap-2">
          <p className="relative flex-1 rounded-[22px] bg-card px-4 py-3 shadow-[0_2px_10px_rgba(60,80,170,0.08)]">
            {base.lastLessonTitle ? (
              <>
                <span className="block text-[13px]">前回は</span>
                <span className="block text-[24px] leading-tight font-black text-accent">{base.lastLessonTitle}</span>
                <span className="block text-[13px]">を学習したよ！</span>
              </>
            ) : (
              <span className="block text-[15px] font-bold">どれを教えてくれるの？</span>
            )}
          </p>
          <PeerAvatar state="idle" size={92} decorative className="shrink-0" />
        </div>
      </div>

      <section className="mt-4 rounded-card bg-card px-4 pt-4 pb-3 lg:mt-6 lg:px-7 lg:pt-6 lg:pb-5" aria-label="教える内容">
        {/* 絞り込み */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div role="radiogroup" aria-label="校種" className="flex rounded-2xl border border-line bg-[#EEF1FB] p-1 lg:w-auto">
            {(["middle", "high"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={level === v}
                onClick={() => changeLevel(v)}
                className={`flex-1 rounded-xl px-5 py-2.5 text-[16px] font-bold lg:flex-none ${
                  level === v ? "bg-card text-link shadow-[0_1px_3px_rgba(40,60,140,0.15)]" : "text-sub"
                }`}
              >
                {v === "middle" ? "中学校" : "高校"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-row-reverse lg:justify-end lg:gap-4">
            <Select
              id="subject"
              label={level === "middle" ? "① 教科" : "① 科目"}
              value={subject}
              onChange={changeSubject}
              options={subjects}
              strong
            />
            {level === "middle" ? (
              <Select
                id="grade"
                label="② 学年"
                value={String(grade)}
                onChange={(v) => changeGrade(Number(v))}
                options={[1, 2, 3].map((g) => ({ value: String(g), label: `中学${g}年`, short: `${g}年` }))}
              />
            ) : null}
          </div>
        </div>

        <p className="mt-3 hidden items-center gap-1.5 text-[13px] text-sub lg:flex">
          <span className="text-[#B7791F]" aria-hidden="true">
            ☆
          </span>
          おすすめは、プロフィールの学年（{gradeLabel}）と、ぴあ友の習得状況から出しています
        </p>
        <p className="mt-3 text-[13px] text-sub lg:hidden">③ 小単元（複数選べます）</p>

        {/* 単元 → 小単元 */}
        <div className="mt-2 lg:mt-3">
          {lessonsFailed ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
              <p className="text-[14.5px]">通信できませんでした。</p>
              <button
                type="button"
                onClick={() => {
                  setLessonsFailed(false);
                  setReload((n) => n + 1);
                }}
                className="rounded-2xl border-[1.5px] border-primary px-5 py-2 font-bold text-link"
              >
                もう一度
              </button>
            </div>
          ) : lessons == null ? (
            <p className="py-8 text-center text-[14.5px] text-sub" role="status">
              読み込み中…
            </p>
          ) : tree.length === 0 ? (
            <p className="py-8 text-center text-[14.5px] text-sub">
              この{level === "middle" ? "学年・教科" : "科目"}で教えられる小単元は、まだありません。
              <br />
              いまは中学1年の数学（一次方程式）を教えられます。
            </p>
          ) : (
            <LessonTree
              key={filterKey}
              tree={tree}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              statusOf={statusOf}
              recommended={recommended}
            />
          )}
        </div>
        {limitNotice && (
          <p className="mt-2 text-[13px] text-danger" role="status">
            一度に選べる小単元は{MAX_SELECTION}個までです。
          </p>
        )}
      </section>

      {/* PC：選んでいる小単元・前提の確認・授業を始める */}
      <div className="mt-5 hidden lg:block">
        <div className="flex items-start justify-between gap-6 px-2 text-[14px]">
          <p className="min-w-0">
            {selected.size > 0 ? (
              <>
                <b>{selected.size}つ選択中</b>：{selectedList.map((l) => l.title).join("・")}
              </>
            ) : (
              <span className="text-sub">教える小単元を選んでください</span>
            )}
          </p>
          {selected.size > 0 && <PrereqLine items={prereqs} />}
        </div>
        {startError && (
          <p className="mt-3 rounded-xl bg-[#FDECEC] px-4 py-2.5 text-[14px] text-danger" role="alert">
            {startError}
          </p>
        )}
        <button
          type="button"
          onClick={start}
          disabled={selected.size === 0 || starting}
          className="mt-4 h-[68px] w-full rounded-[22px] bg-primary text-[24px] font-bold text-white shadow-[0_8px_20px_rgba(70,119,230,0.35)] transition-opacity disabled:opacity-45 disabled:shadow-none"
        >
          {starting ? "授業を準備しています…" : "授業を始める"}
        </button>
      </div>

      {/* スマホ：タブバーの上に固定するバー */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-card px-4 py-3 lg:hidden">
        {startError && (
          <p className="mb-2 rounded-xl bg-[#FDECEC] px-3 py-2 text-[13px] text-danger" role="alert">
            {startError}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => detailRef.current?.showModal()}
            className="min-w-0 text-left disabled:cursor-default"
            aria-haspopup="dialog"
          >
            <span className="block text-[15px] font-bold">
              {selected.size > 0 ? `${selected.size}つ選択中` : "小単元を選んでください"}
            </span>
            {selected.size > 0 && <PrereqShort items={prereqs} />}
          </button>
          <button
            type="button"
            onClick={start}
            disabled={selected.size === 0 || starting}
            className="h-13 shrink-0 rounded-2xl bg-primary px-5 text-[17px] font-bold text-white shadow-[0_4px_12px_rgba(70,119,230,0.35)] disabled:opacity-45 disabled:shadow-none"
          >
            {starting ? "準備中…" : "授業を始める"}
          </button>
        </div>
      </div>

      <dialog
        ref={detailRef}
        aria-labelledby="selection-title"
        className="mx-auto mt-auto mb-0 w-full max-w-none rounded-t-card bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-ink backdrop:bg-[#1C1C2E]/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) detailRef.current?.close();
        }}
      >
        <h2 id="selection-title" className="text-[17px] font-bold">
          {selected.size}つ選択中
        </h2>
        <ul className="mt-2 flex flex-col gap-1 text-[14.5px]">
          {selectedList.map((l) => (
            <li key={l.id}>・{l.title}</li>
          ))}
        </ul>
        <h3 className="mt-4 text-[15px] font-bold">前提の確認</h3>
        <PrereqDetail items={prereqs} />
        <button
          type="button"
          onClick={() => detailRef.current?.close()}
          className="mt-5 w-full rounded-2xl border-[1.5px] border-outline py-3 font-bold text-link"
        >
          閉じる
        </button>
      </dialog>
    </main>
  );
}

/* ───────── 部品 ───────── */

function Select({
  id,
  label,
  value,
  onChange,
  options,
  strong = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; short?: string }[];
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] text-sub lg:sr-only">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-[50px] w-full appearance-none rounded-2xl border pr-10 pl-4 text-[17px] font-bold lg:w-60 ${
            strong ? "border-primary bg-primary text-white" : "border-[#CDD3EA] bg-card text-ink"
          }`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-card text-ink">
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          className={`pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 ${strong ? "text-white" : "text-ink"}`}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function WarnMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.5" />
    </svg>
  );
}

/** PC：前提の確認を1行で */
function PrereqLine({ items }: { items: PrereqItem[] }) {
  const missing = items.filter((p) => !p.ready);
  if (items.length === 0) return <p className="shrink-0 text-sub">前提になる概念はありません</p>;
  if (missing.length > 0) {
    const first = missing[0];
    return (
      <p className="flex shrink-0 items-center gap-1.5 text-[#9A3412]">
        <WarnMark />
        前提の「{first.label}」がまだ{STATUS_LABEL[first.status]}です
        {missing.length > 1 && `（ほか${missing.length - 1}つ）`}。このまま始めることもできます
      </p>
    );
  }
  return (
    <p className="flex shrink-0 items-center gap-1.5 text-[#1F7A3A]">
      <CheckMark />
      {items.length === 1
        ? `前提の「${items[0].label}」は、ぴあ友が${STATUS_LABEL[items[0].status]}です`
        : `前提の${items.length}つの概念は、ぴあ友が練習中か習得済みです`}
    </p>
  );
}

/** スマホ：下のバーの短い表示 */
function PrereqShort({ items }: { items: PrereqItem[] }) {
  const ok = items.every((p) => p.ready);
  return ok ? (
    <span className="mt-0.5 flex items-center gap-1 text-[13px] text-[#1F7A3A]">
      <CheckMark />
      前提OK
    </span>
  ) : (
    <span className="mt-0.5 flex items-center gap-1 text-[13px] text-[#9A3412]">
      <WarnMark />
      前提が未習
    </span>
  );
}

/** スマホ：詳しい前提の確認 */
function PrereqDetail({ items }: { items: PrereqItem[] }) {
  if (items.length === 0) return <p className="mt-1 text-[14px] text-sub">前提になる概念はありません。</p>;
  return (
    <>
      <ul className="mt-1 flex flex-col gap-1.5 text-[14px]">
        {items.map((p) => (
          <li key={p.conceptId} className={`flex items-start gap-1.5 ${p.ready ? "text-[#1F7A3A]" : "text-[#9A3412]"}`}>
            <span className="mt-0.5">{p.ready ? <CheckMark /> : <WarnMark />}</span>
            {p.ready
              ? `前提の「${p.label}」は、ぴあ友が${STATUS_LABEL[p.status]}です`
              : `前提の「${p.label}」がまだ${STATUS_LABEL[p.status]}です`}
          </li>
        ))}
      </ul>
      {items.some((p) => !p.ready) && (
        <p className="mt-2 text-[13px] text-sub">前提が足りなくても、授業は始められます。</p>
      )}
    </>
  );
}
