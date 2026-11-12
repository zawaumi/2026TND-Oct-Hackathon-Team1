"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KnowledgeState, STATUS_LABEL, type KnowledgeStatus } from "@/components/KnowledgeState";
import { PeerAvatar } from "@/components/PeerAvatar";
import {
  api,
  ApiError,
  type EvaluationCriterion,
  type EvaluationReport,
  type LearningSession,
  type Lesson,
  type PeerKnowledge,
} from "@/lib/api/client";
import { getConversation, type ConversationLine } from "@/lib/conversationMemory";
import { lessonStatus } from "@/lib/lessons";
import {
  criterionLabel,
  criterionWeight,
  hasScore,
  improvementHints,
  peerComment,
  unratedCriteria,
} from "@/lib/report";

type Loaded = {
  session: LearningSession;
  lessons: Lesson[];
  unit: Lesson | null;
  labels: Map<number, string>;
  knowledge: Map<number, PeerKnowledge>;
  next: Lesson[];
  report: EvaluationReport;
};

/** ぴあ友がつまずいたところとして引用する、ぴあ友の質問の種類 */
const QUESTION_ACTIONS = new Set(["ask_why", "request_example", "check_prerequisite", "contrast_cases"]);
const MAX_QUOTES = 3;
const MAX_POLLS = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(d);
}

/* ───────── 読み込み ───────── */

export function ReportView() {
  const params = useSearchParams();
  const sessionId = Number(params.get("session"));
  const valid = Number.isInteger(sessionId) && sessionId > 0;

  const [data, setData] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    (async () => {
      try {
        const [session, knowledge, graph] = await Promise.all([
          api.getSession(sessionId),
          api.getPeerKnowledge(),
          api.getKnowledgeGraph(),
        ]);
        const lessons = await Promise.all(session.lesson_ids.map((id) => api.getLesson(id)));
        const parentId = lessons.find((l) => l.parent_id != null)?.parent_id;
        const unit = parentId != null ? await api.getLesson(parentId).catch(() => null) : null;

        // 評価がまだなら（202）、少し待って取り直す（docs/04 の 7.1）
        let result = await api.getEvaluation(sessionId);
        let polls = 0;
        while (result.kind === "pending") {
          if (!alive) return;
          setPending(true);
          if (++polls > MAX_POLLS) throw new ApiError(0, "TIMEOUT", "評価に時間がかかっています");
          await sleep(result.retryAfterMs);
          result = await api.getEvaluation(sessionId);
        }
        const report = result.data;
        const next = (
          await Promise.all((report.next_lesson_ids ?? []).slice(0, 3).map((id) => api.getLesson(id).catch(() => null)))
        ).filter((l): l is Lesson => l != null);

        if (!alive) return;
        setData({
          session,
          lessons,
          unit,
          labels: new Map(graph.nodes.map((n) => [n.id, n.label])),
          knowledge: new Map(knowledge.items.map((k) => [k.concept_id, k])),
          next,
          report,
        });
        setPending(false);
      } catch (e) {
        if (!alive) return;
        setPending(false);
        setError(
          e instanceof ApiError && e.status === 404
            ? "この授業のレポートは見つかりませんでした。"
            : e instanceof ApiError && e.code === "TIMEOUT"
              ? "評価に時間がかかっています。少したってから、もう一度開いてください。"
              : "通信できませんでした。",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, valid, attempt]);

  let body;
  if (!valid) {
    body = <Message text="授業が指定されていません。" action={<HomeLink />} />;
  } else if (error) {
    body = (
      <Message
        text={error}
        action={
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="rounded-2xl bg-primary px-6 py-3 font-bold text-white"
          >
            もう一度
          </button>
        }
      />
    );
  } else if (!data) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16" role="status">
        <PeerAvatar state="thinking" size={120} decorative />
        <p className="text-[16px] font-bold">{pending ? "評価中…" : "読み込み中…"}</p>
        {pending && <p className="text-[13.5px] text-sub">授業の説明を採点しています。少しお待ちください。</p>}
      </div>
    );
  } else {
    body = <Report data={data} />;
  }

  return (
    <AppShell active={null} mobileNav={false}>
      {/* スマホのヘッダー：戻る（ホームへ）と画面名 */}
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-card px-3 py-2.5 lg:hidden">
        <Link href="/" aria-label="ホームへ戻る" className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-soft">
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold">学習レポート</h1>
          {data && <p className="truncate text-[12.5px] text-sub">{subtitle(data, "sp")}</p>}
        </div>
      </header>
      {body}
    </AppShell>
  );
}

function subtitle(data: Loaded, kind: "pc" | "sp") {
  const grade = data.lessons[0]?.grade;
  const unit = data.unit?.title ?? "";
  const lessons = data.lessons.map((l) => l.title).join("・");
  const date = formatDate(data.session.started_at);
  // 教科はMVPでは数学だけ（ADR-028）
  const head = kind === "pc" ? `中${grade ?? ""}数学・${unit}` : `数学・中学${grade ?? ""}年`;
  return [head, lessons, date].filter(Boolean).join(" ／ ");
}

function Message({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center" role="alert">
      <p className="text-[15px]">{text}</p>
      {action}
    </div>
  );
}

function HomeLink() {
  return (
    <Link href="/" className="rounded-2xl bg-primary px-6 py-3 font-bold text-white">
      ホームへ
    </Link>
  );
}

/* ───────── レポート本体 ───────── */

function Report({ data }: { data: Loaded }) {
  const router = useRouter();
  const [again, setAgain] = useState<"idle" | "busy" | "error">("idle");
  const conversation = getConversation(data.session.id);
  const labelOf = (id: number) => data.labels.get(id) ?? `概念 ${id}`;

  const teachAgain = async () => {
    setAgain("busy");
    try {
      const s = await api.createSession(data.session.lesson_ids);
      router.push(`/study/?session=${s.id}`);
    } catch {
      setAgain("error");
    }
  };

  const buttons = (kind: "pc" | "sp") => (
    <div className={kind === "pc" ? "flex gap-3" : "flex flex-col gap-3"}>
      <button
        type="button"
        onClick={teachAgain}
        disabled={again === "busy"}
        className={`rounded-2xl bg-primary font-bold text-white shadow-[0_6px_16px_rgba(70,119,230,0.35)] disabled:opacity-60 ${
          kind === "pc" ? "h-12 px-6 text-[16px]" : "h-14 w-full text-[17px]"
        }`}
      >
        {again === "busy" ? "準備しています…" : "もう一度教える"}
      </button>
      <Link
        href="/lessons/"
        className={`flex items-center justify-center rounded-2xl border-[1.5px] border-outline bg-card font-bold text-ink ${
          kind === "pc" ? "h-12 px-6 text-[16px]" : "h-14 w-full text-[16px]"
        }`}
      >
        学習内容を選び直す
      </Link>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-[1216px] flex-col gap-4 px-3 pt-3 pb-8 lg:gap-4 lg:px-0 lg:pt-6">
      <div className="hidden items-start justify-between gap-6 lg:flex">
        <div>
          <h1 className="text-[26px] font-black">学習レポート</h1>
          <p className="mt-0.5 text-[13.5px] text-sub">{subtitle(data, "pc")}</p>
        </div>
        {buttons("pc")}
      </div>
      {again === "error" && (
        <p className="rounded-xl bg-[#FDECEC] px-4 py-2.5 text-[14px] text-danger" role="alert">
          授業を始められませんでした。もう一度押してください。
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <ScoreCard report={data.report} comment={peerComment(data.report, labelOf)} />
        <div className="flex flex-col gap-4">
          <StrengthsCard items={data.report.strengths ?? []} />
          <StumbleCard report={data.report} conversation={conversation} />
        </div>
      </div>

      <section aria-labelledby="mastery-title" className="flex flex-col gap-2">
        <h2 id="mastery-title" className="mt-2 px-1 text-[13.5px] font-bold text-sub">
          ぴあ友の習得（検証済み）
        </h2>
        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <ChangesCard data={data} labelOf={labelOf} />
          <NextCard data={data} />
        </div>
      </section>

      <div className="mt-2 lg:hidden">{buttons("sp")}</div>
    </main>
  );
}

function Card({ children, className = "", label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`rounded-card bg-card px-5 py-5 lg:px-6 ${className}`}>
      {children}
    </section>
  );
}

/* ───────── あなたの授業は… ───────── */

function ScoreCard({ report, comment }: { report: EvaluationReport; comment: string }) {
  const scored = hasScore(report);
  const unrated = unratedCriteria(report);
  return (
    <Card label="あなたの授業は…">
      <div className="flex items-center gap-4">
        <div className="flex size-[104px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-b from-[#F3F6FE] to-[#DCE6FB] lg:size-[120px]">
          <PeerAvatar state={scored ? "practice_success" : "idle"} size={108} decorative />
        </div>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold lg:text-[18px]">あなたの授業は…</h2>
          {scored ? (
            <p className="mt-1 flex items-end" aria-label={`${report.score_label}：100点中${report.total_score}点`}>
              <span className="text-[64px] leading-none font-black tracking-tight text-[#2B3FE0] lg:text-[72px]" aria-hidden="true">
                {report.total_score}
              </span>
              <svg viewBox="0 0 24 60" className="mx-1 h-[58px] w-[22px] lg:h-[66px]" aria-hidden="true">
                <path d="M20 4L4 56" stroke="#E5252A" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
              <span className="mb-0.5 text-[24px] leading-none font-black text-[#E5252A]" aria-hidden="true">
                100
              </span>
            </p>
          ) : (
            <p className="mt-2 text-[16px] font-bold">今回は点数を出せませんでした</p>
          )}
        </div>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-sub">
        {!scored
          ? report.status === "UNAVAILABLE"
            ? "評価の処理ができませんでした。"
            : "点数を出すのに使える説明が、足りませんでした。"
          : unrated.length > 0
            ? `評価保留の観点（${unrated.map(criterionLabel).join("・")}）を除いて計算しています。`
            : ""}
        {report.score_label || "ぴあとも独自の説明力スコア"}で、学校の成績ではありません。
      </p>

      {report.criterion_results.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3.5">
          {report.criterion_results.map((c) => (
            <CriterionRow key={c.code} c={c} />
          ))}
        </ul>
      )}
      {report.rubric_version && <p className="mt-3 text-[12px] text-sub">ルーブリック {report.rubric_version}</p>}

      <div className="mt-3 flex items-center gap-2.5">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-soft">
          <PeerAvatar state="idle" size={48} decorative animated={false} />
        </span>
        <p className="rounded-[18px] bg-soft px-4 py-3 text-[14.5px]">
          <span className="sr-only">ぴあ友のひとこと：</span>
          {comment}
        </p>
      </div>
    </Card>
  );
}

function CriterionRow({ c }: { c: EvaluationCriterion }) {
  const rated = c.status === "SCORED" && c.score != null;
  const value = rated ? Math.max(0, Math.min(100, c.score!)) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between">
        <span className="text-[14.5px] font-bold">
          {criterionLabel(c)}
          <span className="ml-1 text-[12.5px] font-normal text-sub">（配点 {criterionWeight(c)}）</span>
        </span>
        {rated ? (
          <span className="text-[16px] font-bold">
            {value}
            <span className="ml-0.5 text-[12px] font-normal text-sub">点</span>
          </span>
        ) : (
          <span className="rounded-full bg-[#ECEEF6] px-2.5 py-0.5 text-[12px] font-bold text-sub">評価保留</span>
        )}
      </div>
      <div
        className={`mt-1.5 h-3 overflow-hidden rounded-full ${
          rated ? "bg-track" : "bg-[repeating-linear-gradient(135deg,#E6EAF7_0_6px,#F4F6FC_6px_12px)]"
        }`}
        role={rated ? "progressbar" : undefined}
        aria-label={rated ? criterionLabel(c) : undefined}
        aria-valuemin={rated ? 0 : undefined}
        aria-valuemax={rated ? 100 : undefined}
        aria-valuenow={rated ? value : undefined}
      >
        {rated && <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />}
      </div>
      {c.explanation && <p className="mt-1.5 text-[13px] text-sub">{c.explanation}</p>}
    </li>
  );
}

/* ───────── 良かったところ ───────── */

function StrengthsCard({ items }: { items: string[] }) {
  // 0件ならカードを出さない（ADR-033）
  if (items.length === 0) return null;
  return (
    <Card label="良かったところ">
      <h2 className="text-[17px] font-bold">良かったところ</h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.slice(0, 3).map((s) => (
          <li key={s} className="flex items-start gap-2.5 text-[14.5px]">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-[#22A04B]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            {s}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ───────── ぴあ友がつまずいたところ・改善のヒント ───────── */

function StumbleCard({ report, conversation }: { report: EvaluationReport; conversation: ConversationLine[] | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // 端末（このタブ）に会話が残っていれば、ぴあ友の質問を引用する。サーバーは会話本文を返さない
  const quotes = (conversation ?? []).filter((l) => l.role === "peer" && l.action && QUESTION_ACTIONS.has(l.action)).slice(0, MAX_QUOTES);
  const hints = improvementHints(report);
  if (quotes.length === 0 && hints.length === 0) return null;

  const open = (key: string) => {
    setFocusKey(key);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => document.getElementById(`line-${key}`)?.scrollIntoView({ block: "center" }));
  };

  return (
    <Card label={quotes.length > 0 ? "ぴあ友がつまずいたところ" : "改善のヒント"} className="flex-1">
      <h2 className="text-[17px] font-bold">{quotes.length > 0 ? "ぴあ友がつまずいたところ" : "改善のヒント"}</h2>
      {quotes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2.5">
          {quotes.map((q) => (
            <li key={q.key} className="rounded-2xl border border-[#F5C9A8] bg-[#FFF6EF] px-4 py-3">
              <p className="text-[14.5px] font-bold">「{q.text}」</p>
              <button
                type="button"
                onClick={() => open(q.key)}
                className="mt-1 text-[13px] font-bold text-link underline underline-offset-2"
                aria-haspopup="dialog"
              >
                この発言を会話で見る（この端末のみ）
              </button>
            </li>
          ))}
        </ul>
      )}
      {hints.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {hints.map((h) => (
            <li key={h.label} className="flex items-start gap-2 rounded-2xl bg-soft px-4 py-3 text-[14px]">
              <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-[#B4541A]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M12 4l9 16H3z" />
                <path d="M12 10v4.5M12 17.2v.3" strokeLinecap="round" />
              </svg>
              <span>
                <b>改善のヒント（{h.label}）：</b>
                {h.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {conversation && (
        <dialog
          ref={dialogRef}
          aria-labelledby="conv-title"
          className="m-auto max-h-[80dvh] w-[min(94vw,640px)] rounded-card bg-card p-0 text-ink backdrop:bg-[#1C1C2E]/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialogRef.current?.close();
          }}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 id="conv-title" className="text-[16px] font-bold">
              授業の会話（この端末のみ）
            </h2>
            <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-xl px-3 py-1.5 font-bold text-link hover:bg-soft">
              閉じる
            </button>
          </div>
          <ol className="flex max-h-[calc(80dvh-60px)] flex-col gap-3 overflow-y-auto px-5 py-4">
            {conversation.map((l) => (
              <li key={l.key} id={`line-${l.key}`} className={l.role === "user" ? "flex justify-end pl-10" : "flex pr-10"}>
                <p
                  className={`rounded-[18px] px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap ${
                    l.role === "user" ? "bg-[#3359D9] text-white" : "bg-soft"
                  } ${l.key === focusKey ? "ring-2 ring-[#F2A65A] ring-offset-2" : ""}`}
                >
                  <span className="sr-only">{l.role === "user" ? "あなた：" : "ぴあ友："}</span>
                  {l.text}
                </p>
              </li>
            ))}
          </ol>
        </dialog>
      )}
    </Card>
  );
}

/* ───────── 今回の変化・次の学習の候補 ───────── */

function remainingText(k: PeerKnowledge | undefined) {
  if (!k || k.status === "MASTERED" || k.required_correct <= 0) return null;
  return `検証済みの正答 ${k.verified_correct} / ${k.required_correct}問（習得まであと${Math.max(k.required_correct - k.verified_correct, 0)}問）`;
}

function ChangesCard({ data, labelOf }: { data: Loaded; labelOf: (id: number) => string }) {
  const changes = data.report.knowledge_changes ?? [];
  return (
    <Card label="今回の変化">
      <h3 className="text-[17px] font-bold">今回の変化</h3>
      {changes.length === 0 ? (
        <p className="mt-3 text-[14px] text-sub">今回は、ぴあ友の習得の状態は変わりませんでした。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {changes.map((c) => {
            const rest = remainingText(data.knowledge.get(c.concept_id));
            return (
              <li key={c.concept_id} className="rounded-2xl bg-[#F4F6FD] px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <span className="min-w-28 text-[16px] font-bold">{labelOf(c.concept_id)}</span>
                  <span className="flex items-center gap-2" aria-label={`${STATUS_LABEL[c.old_status]}から${STATUS_LABEL[c.new_status]}へ`}>
                    <KnowledgeState status={c.old_status} />
                    <span aria-hidden="true" className="text-sub">
                      →
                    </span>
                    <KnowledgeState status={c.new_status} />
                  </span>
                </div>
                {rest && <p className="mt-1 text-[12.5px] text-sub">{rest}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function NextCard({ data }: { data: Loaded }) {
  const statusOf = (id: number): KnowledgeStatus => data.knowledge.get(id)?.status ?? "UNKNOWN";
  return (
    <Card label="次の学習の候補">
      <h3 className="text-[17px] font-bold">次の学習の候補</h3>
      {data.next.length === 0 ? (
        <p className="mt-3 text-[14px] text-sub">いまは候補がありません。学習内容を選び直して、ほかの小単元を教えてみましょう。</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {data.next.map((l) => {
              const status = lessonStatus(l, statusOf);
              const rest = l.concept_ids
                .map((id) => data.knowledge.get(id))
                .filter((k): k is PeerKnowledge => k != null && k.status !== "MASTERED")
                .reduce((sum, k) => sum + Math.max(k.required_correct - k.verified_correct, 0), 0);
              const note = status === "PRACTICING" && rest > 0 ? `習得まであと${rest}問` : STATUS_LABEL[status];
              return (
                <li key={l.id}>
                  <Link href={`/lessons/?select=${l.id}`} className="text-[16px] font-bold text-link underline underline-offset-4">
                    {l.title}
                    <span className="ml-1 text-[13px] font-normal">（{note}）</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12.5px] text-sub">押すと、この小単元を選んだ状態で学習内容選択を開きます</p>
        </>
      )}
    </Card>
  );
}
