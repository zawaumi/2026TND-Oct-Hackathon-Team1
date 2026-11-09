"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PeerEmotion } from "@/components/PeerAvatar";
import { STATUS_LABEL } from "@/components/KnowledgeState";
import { Logo } from "@/components/Logo";
import { api, ApiError, type Lesson, type MessageResponse, type PeerKnowledge } from "@/lib/api/client";
import { understandingPercent } from "@/lib/understanding";
import { ChatLog, type ChatItem } from "./ChatLog";
import { FinishDialog } from "./FinishDialog";
import {
  BackIcon,
  Composer,
  ConceptCard,
  ModeButtons,
  ModeTabs,
  PeerCard,
  PeerSummaryMobile,
  UnderstandingBar,
  type ConceptView,
  type Mode,
} from "./parts";

type Loaded = {
  sessionId: number;
  unit: Lesson | null;
  lessons: Lesson[];
};

const MAX_POLLS = 20;
const RECENT_CONTEXT = 6;

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // 古いブラウザ向けの代わり（UUID v4 の形）
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mergeKnowledge(concepts: ConceptView[], items: PeerKnowledge[]): ConceptView[] {
  const byId = new Map(items.map((k) => [k.concept_id, k]));
  return concepts.map((c) => {
    const k = byId.get(c.id);
    return k ? { ...c, status: k.status, verified: k.verified_correct, required: k.required_correct } : c;
  });
}

export function StudyRoom() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = Number(params.get("session"));

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<ConceptView[]>([]);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [emotion, setEmotion] = useState<PeerEmotion>("idle");
  const [masteredLabel, setMasteredLabel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("teach");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const seenTurns = useRef(new Set<number>());
  const conceptsRef = useRef<ConceptView[]>([]);
  useEffect(() => {
    conceptsRef.current = concepts;
  }, [concepts]);

  /* ───── 最初の読み込み ───── */
  useEffect(() => {
    if (!Number.isInteger(sessionId) || sessionId <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await api.getSession(sessionId);
        const [lessons, knowledge, graphs] = await Promise.all([
          Promise.all(session.lesson_ids.map((id) => api.getLesson(id))),
          api.getPeerKnowledge(),
          Promise.all(session.lesson_ids.map((id) => api.getKnowledgeGraph(id))),
        ]);
        const parentId = lessons.find((l) => l.parent_id != null)?.parent_id;
        const unit = parentId != null ? await api.getLesson(parentId).catch(() => null) : null;

        const labels = new Map(graphs.flatMap((g) => g.nodes).map((n) => [n.id, n.label]));
        const ids = [...new Set(lessons.flatMap((l) => l.concept_ids))];
        const base: ConceptView[] = ids.map((id) => ({
          id,
          label: labels.get(id) ?? `概念 ${id}`,
          status: "UNKNOWN",
          verified: 0,
          required: 0,
        }));
        const merged = mergeKnowledge(base, knowledge.items);
        if (cancelled) return;

        // いま教えている概念：まだ応答がないので、最初のまだ習得済みでない概念（docs/04 の 5.2）
        const first = merged.find((c) => c.status !== "MASTERED") ?? merged[0] ?? null;
        setLoaded({ sessionId, unit, lessons });
        setConcepts(merged);
        setCurrentId(first?.id ?? null);
        setItems([
          {
            kind: "peer",
            key: "greeting",
            text: first
              ? `よろしくお願いします！今日は「${first.label}」を教えてくれるんですよね。`
              : "よろしくお願いします！",
          },
        ]);
      } catch (e) {
        if (cancelled) return;
        setLoadError(
          e instanceof ApiError && e.status === 404
            ? "この授業は見つかりませんでした。"
            : "授業を読み込めませんでした。通信の状態を確かめて、もう一度開いてください。",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* ───── 会話のスクロール：いちばん下を見ているときだけ追いかける ───── */
  const onScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    // なめらかなスクロールにすると、途中のスクロール位置で「下を見ていない」と判定されるため、すぐに移動する
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, sending]);

  /* ───── 応答を画面に反映 ───── */
  const applyResponse = useCallback((res: MessageResponse) => {
    // 同じ応答を再受信しても、成功の演出や表示をくり返さない（docs/04 の 5.5）
    if (seenTurns.current.has(res.turn_id)) return;
    seenTurns.current.add(res.turn_id);

    const label = (id: number) => conceptsRef.current.find((c) => c.id === id)?.label ?? `概念 ${id}`;
    const peer = res.peer_response;
    const extra: ChatItem[] = [];
    let mastered: string | null = null;

    for (const ch of res.knowledge_changes) {
      if (ch.new_status === "MASTERED") {
        mastered = label(ch.concept_id);
        extra.push({ kind: "mastery", key: `m${res.turn_id}-${ch.concept_id}`, text: `ぴあ友が「${mastered}」を習得しました！` });
      } else {
        extra.push({
          kind: "notice",
          key: `n${res.turn_id}-${ch.concept_id}`,
          text: `${label(ch.concept_id)}：${STATUS_LABEL[ch.new_status]}`,
        });
      }
    }

    setItems((prev) => [
      ...prev,
      { kind: "peer", key: `p${res.turn_id}`, text: peer.message, action: peer.action },
      ...extra,
    ]);

    if (res.knowledge_changes.length > 0) {
      setConcepts((prev) =>
        prev.map((c) => {
          const ch = res.knowledge_changes.find((x) => x.concept_id === c.id);
          return ch ? { ...c, status: ch.new_status } : c;
        }),
      );
      // 「習得まであと〇問」のために、検証済みの回数も取り直す
      api
        .getPeerKnowledge()
        .then((k) => setConcepts((prev) => mergeKnowledge(prev, k.items)))
        .catch(() => {});
    }

    if (peer.concept_id != null && conceptsRef.current.some((c) => c.id === peer.concept_id)) {
      setCurrentId(peer.concept_id);
    }

    // mastery_success は、DRFが習得済みに更新したときだけ（docs/04 の 5.5）
    if (mastered) {
      setMasteredLabel(mastered);
      setEmotion("mastery_success");
    } else {
      setMasteredLabel(null);
      setEmotion(peer.emotion === "mastery_success" ? "practice_success" : peer.emotion);
    }
  }, []);

  /* ───── 送信 ───── */
  const deliver = useCallback(
    async (requestId: string, content: string, context: { role: "user" | "peer"; content: string }[]) => {
      if (!loaded) return;
      setSending(true);
      setNotice(null);
      const mark = (state: "sending" | "sent" | "failed") =>
        setItems((prev) => prev.map((it) => (it.kind === "user" && it.requestId === requestId ? { ...it, state } : it)));
      mark("sending");

      try {
        let result = await api.postMessage(loaded.sessionId, { request_id: requestId, content, recent_context: context });
        let polls = 0;
        while (result.kind === "pending") {
          if (++polls > MAX_POLLS) throw new ApiError(0, "TIMEOUT", "時間がかかっています");
          await sleep(result.retryAfterMs);
          result = await api.getTurn(loaded.sessionId, requestId);
        }
        mark("sent");
        applyResponse(result.data);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "エラーが起きました");
        if (err.status === 0 || err.status >= 500) {
          // 通信の失敗：同じ request_id で再送できるように残す
          mark("failed");
          setEmotion("idle");
        } else {
          // 409（状態の競合）・410（応答の期限切れ）・400 など：
          // 送った文章を入力欄に戻し、状態を取り直してから、新しい送信として送ってもらう
          setItems((prev) => prev.filter((it) => !(it.kind === "user" && it.requestId === requestId)));
          setText(content);
          setEmotion("idle");
          setNotice(
            err.status === 409 || err.status === 410
              ? "ぴあ友の状態が更新されました。最新の状態にしたので、もう一度送ってください。"
              : err.message,
          );
          api
            .getPeerKnowledge()
            .then((k) => setConcepts((prev) => mergeKnowledge(prev, k.items)))
            .catch(() => {});
        }
      } finally {
        setSending(false);
      }
    },
    [loaded, applyResponse],
  );

  const recentContext = useCallback(
    (list: ChatItem[]) =>
      list
        .filter((it): it is Extract<ChatItem, { kind: "peer" | "user" }> => it.kind === "peer" || it.kind === "user")
        .filter((it) => it.kind === "peer" || it.state === "sent")
        .slice(-RECENT_CONTEXT)
        .map((it) => ({ role: it.kind === "peer" ? ("peer" as const) : ("user" as const), content: it.text })),
    [],
  );

  const send = useCallback(() => {
    const content = text.trim();
    if (!content || sending) return;
    const requestId = newRequestId();
    const context = recentContext(items);
    nearBottom.current = true;
    setItems((prev) => [...prev, { kind: "user", key: `u${requestId}`, text: content, requestId, state: "sending" }]);
    setText("");
    void deliver(requestId, content, context);
  }, [text, sending, items, recentContext, deliver]);

  const retry = useCallback(
    (requestId: string) => {
      if (sending) return;
      const idx = items.findIndex((it) => it.kind === "user" && it.requestId === requestId);
      const item = items[idx];
      if (!item || item.kind !== "user") return;
      void deliver(requestId, item.text, recentContext(items.slice(0, idx)));
    },
    [items, sending, recentContext, deliver],
  );

  /* ───── 授業を終える ───── */
  const finish = useCallback(async () => {
    if (!loaded) return;
    await api.finishSession(loaded.sessionId);
    router.push(`/report/?session=${loaded.sessionId}`);
  }, [loaded, router]);

  /* ───── 表示用の値 ───── */
  const percent = useMemo(() => understandingPercent(concepts.map((c) => c.status)), [concepts]);
  const hasFailed = items.some((it) => it.kind === "user" && it.state === "failed");
  // 入力し始めたら「聞いています」（質問中や成功の表情は消さない）
  const shownEmotion: PeerEmotion = sending ? "thinking" : emotion === "idle" && text.length > 0 ? "listening" : emotion;

  const validId = Number.isInteger(sessionId) && sessionId > 0;
  if (!validId || loadError) {
    return (
      <ErrorScreen message={!validId ? "授業が指定されていません。学習内容を選んで、授業を始めてください。" : loadError!} />
    );
  }
  if (!loaded) return <StudyLoading />;

  const grade = loaded.lessons[0]?.grade;
  const unitTitle = loaded.unit?.title ?? loaded.lessons[0]?.title ?? "授業";
  const lessonTitles = loaded.lessons.map((l) => l.title).join(" ／ ");
  // 教科はMVPでは数学だけ（ADR-028）
  const subjectGrade = grade ? `中${grade}数学` : "数学";

  const inputArea =
    mode === "teach" ? (
      <Composer value={text} onChange={setText} onSend={send} disabled={sending || hasFailed} />
    ) : (
      <ExercisePlaceholder />
    );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ヘッダー */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-3 py-2.5 lg:h-16 lg:px-7">
        <div className="flex min-w-0 items-center gap-1 lg:gap-5">
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-soft lg:hidden"
            aria-label="戻る（授業を終える）"
            onClick={() => setFinishOpen(true)}
          >
            <BackIcon className="size-6" />
          </button>
          {/* 学習ルームではロゴを押せないようにする（docs/04 の 5.2） */}
          <Logo className="hidden h-[26px] lg:block" />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-bold lg:text-[15px]">
              <span className="hidden lg:inline">{subjectGrade}・</span>
              {unitTitle}
            </h1>
            <p className="truncate text-[12.5px] text-sub">
              <span className="lg:hidden">数学・中学{grade ?? ""}年 ／ </span>
              {lessonTitles}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFinishOpen(true)}
          className="shrink-0 rounded-xl border-[1.5px] border-primary bg-card px-3.5 py-2 text-[14px] font-bold text-link hover:bg-soft lg:rounded-2xl lg:px-5 lg:py-2.5 lg:text-[15px]"
        >
          <span className="lg:hidden">終える</span>
          <span className="hidden lg:inline">授業を終える</span>
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:grid lg:grid-cols-[minmax(300px,30%)_1fr] lg:gap-5 lg:p-7">
        {/* 左列（PC） */}
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex">
          <PeerCard emotion={shownEmotion} masteredLabel={masteredLabel} />
          <section className="rounded-card bg-card px-5 py-4.5">
            <UnderstandingBar percent={percent} />
          </section>
          <ConceptCard concepts={concepts} currentId={currentId} />
        </aside>

        {/* 上のカード（スマホ） */}
        <div className="shrink-0 lg:hidden">
          <PeerSummaryMobile
            emotion={shownEmotion}
            masteredLabel={masteredLabel}
            percent={percent}
            concepts={concepts}
            currentId={currentId}
          />
        </div>

        {/* 右列（PC）／会話と入力（スマホ） */}
        <section className="-mx-3 -mb-3 flex min-h-0 flex-1 flex-col lg:m-0 lg:rounded-card lg:bg-card" aria-label="授業">
          <div className="hidden justify-end px-5 pt-3.5 pb-2 lg:flex">
            <ModeTabs mode={mode} onChange={setMode} disabled={sending} />
          </div>

          <ChatLog
            ref={chatRef}
            items={items}
            thinking={sending}
            onRetry={retry}
            retryDisabled={sending}
            onScroll={onScroll}
          />

          <div className="shrink-0 border-t border-line bg-card px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:rounded-b-card lg:px-5 lg:py-4">
            {notice && (
              <p className="mb-2 rounded-xl bg-[#FDECEC] px-3 py-2 text-[13px] text-danger" role="alert">
                {notice}
              </p>
            )}
            {inputArea}
            <div className="mt-3 lg:hidden">
              <ModeButtons mode={mode} onChange={setMode} disabled={sending} />
            </div>
          </div>
        </section>
      </main>

      <FinishDialog open={finishOpen} onClose={() => setFinishOpen(false)} onConfirm={finish} />
    </div>
  );
}

/** 「問題を出す」の入力欄は #47 で作る。ここでは場所だけ用意する */
function ExercisePlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-outline bg-soft px-4 py-4 text-center text-[14px] text-sub">
      「問題を出す」は準備中です。いまは「教える」で説明してください。
    </div>
  );
}

function StudyLoading() {
  return (
    <div className="flex h-dvh items-center justify-center" role="status">
      <p className="text-[15px] text-sub">授業を準備しています…</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[15px]">{message}</p>
      <Link href="/lessons/" className="rounded-2xl bg-primary px-6 py-3 font-bold text-white">
        学習内容を選ぶ
      </Link>
    </div>
  );
}
