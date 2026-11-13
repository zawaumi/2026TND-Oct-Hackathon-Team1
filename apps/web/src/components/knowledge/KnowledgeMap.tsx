"use client";

import "@xyflow/react/dist/style.css";
import "./knowledge.css";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type NodeChange } from "@xyflow/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/AppShell";
import { api, isUnauthorized } from "@/lib/api/client";
import type { Lesson, PeerKnowledge, Profile } from "@/lib/api/types";
import {
  STATUS_NAME,
  STATUS_ORDER,
  layoutGraph,
  lessonsOf,
  mergeGraphs,
  prerequisitesOf,
  progressText,
  resolveStatus,
  type Direction,
  type Graph,
} from "@/lib/knowledgeMap";
import { ConceptNodeCard, type ConceptFlowNode } from "./ConceptNodeCard";
import { DetailPanel, type DetailData } from "./DetailPanel";
import { StatusMark } from "./StatusMark";

type Scope = "current" | "all";
type Data = {
  full: Graph;
  /** 直近の授業の小単元ごとに取ったグラフをまとめたもの。授業がなければ null */
  current: Graph | null;
  items: Map<number, PeerKnowledge>;
  lessons: Lesson[];
  profile: Profile | null;
};
type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

/** 教科：MVPで公開しているのは中学の数学だけ（ADR-028）。グラフのAPIには教科の絞り込みがない */
const SUBJECTS = [{ value: "math", label: "数学" }];

const PC = { size: { w: 200, h: 88 }, gap: { x: 96, y: 30 } };
const SP = { size: { w: 156, h: 88 }, gap: { x: 22, y: 64 } };
const nodeTypes = { concept: ConceptNodeCard };
const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };

/** 画面の幅が 1024px 以上か（PC の配置）。サーバーで作る最初の絵は PC */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

async function fetchAll(): Promise<Data> {
  const [full, knowledge, lessons, profile, recent] = await Promise.all([
    api.getKnowledgeGraph(),
    api.getPeerKnowledge(),
    api.getLessons({}).catch(() => [] as Lesson[]),
    api.getMe().catch(() => null),
    api.listSessions(1).catch(() => []),
  ]);
  // 「学習中の単元」：直近の授業の小単元ごとに取って、まとめる（docs/04 の 6.1）
  const ids = recent[0]?.lesson_ids ?? [];
  const current =
    ids.length > 0
      ? mergeGraphs(await Promise.all(ids.map((id) => api.getKnowledgeGraph(id).catch(() => ({ nodes: [], edges: [] })))))
      : null;
  return { full, current, items: new Map(knowledge.items.map((k) => [k.concept_id, k])), lessons, profile };
}

export function KnowledgeMap() {
  const desktop = useIsDesktop();
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [scope, setScope] = useState<Scope | null>(null); // null：授業があれば「学習中の単元」、なければ「ぜんぶ」
  const [subject, setSubject] = useState(SUBJECTS[0].value);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const readyRef = useRef(false);
  const dragStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // 取得（開いたとき・「最新にする」・タブに戻ったとき）。取り直しても、前の表示は残す
  useEffect(() => {
    let alive = true;
    fetchAll().then(
      (data) => {
        if (!alive) return;
        readyRef.current = true;
        setLoad({ kind: "ready", data });
        setRefreshing(false);
        setRefreshFailed(false);
      },
      (e: unknown) => {
        if (!alive || isUnauthorized(e)) return; // 401 は、ログイン画面への切り替えに任せる
        setRefreshing(false);
        if (readyRef.current) setRefreshFailed(true);
        else setLoad({ kind: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const data = load.kind === "ready" ? load.data : null;
  const effectiveScope: Scope = scope ?? (data?.current && data.current.nodes.length > 0 ? "current" : "all");
  const graph: Graph = useMemo(
    () => (data ? (effectiveScope === "current" && data.current ? data.current : data.full) : EMPTY_GRAPH),
    [data, effectiveScope],
  );
  const dir: Direction = desktop ? "LR" : "TB";

  const flow = useMemo(() => {
    if (!data) return { nodes: [] as ConceptFlowNode[], edges: [] as Edge[] };
    const dims = desktop ? PC : SP;
    const pos = layoutGraph(graph.nodes.map((n) => n.id), graph.edges, dir, dims.size, dims.gap);
    const byId = new Map([...data.full.nodes, ...graph.nodes].map((n) => [n.id, n]));
    const nodes: ConceptFlowNode[] = graph.nodes.map((n) => {
      const item = data.items.get(n.id);
      const status = resolveStatus(n, item);
      const progress = progressText(item);
      return {
        id: String(n.id),
        type: "concept",
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        selected: n.id === selectedId,
        draggable: false,
        ariaLabel: `${n.label}、${STATUS_NAME[status]}${progress ? `、検証済み ${progress}` : ""}${n.id === selectedId ? "、選択中" : ""}`,
        data: {
          label: n.label,
          status,
          progress,
          ratio: item && item.required_correct > 0 ? item.verified_correct / item.required_correct : null,
          dir,
          width: dims.size.w,
          height: dims.size.h,
        },
      };
    });
    const ids = new Set(graph.nodes.map((n) => n.id));
    const edges: Edge[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => {
        const a = byId.get(e.source)?.label ?? "";
        const b = byId.get(e.target)?.label ?? "";
        const pre = e.relation === "prerequisite";
        return {
          id: `${e.relation}-${e.source}-${e.target}`,
          source: String(e.source),
          target: String(e.target),
          type: "smoothstep",
          // 前提の辺は実線の矢印（前提 → あとの概念）。関連の辺は破線で、矢印なし
          markerEnd: pre ? { type: MarkerType.ArrowClosed, width: 22, height: 22, color: "#2F55D4" } : undefined,
          style: pre ? { stroke: "#2F55D4", strokeWidth: 2.2 } : { stroke: "#7A7FA3", strokeWidth: 2, strokeDasharray: "7 5" },
          focusable: false,
          ariaLabel: pre ? `前提：${a} から ${b} へ（${a}を先に学ぶ）` : `関連：${a} と ${b}`,
        };
      });
    return { nodes, edges };
  }, [data, graph, desktop, dir, selectedId]);

  const onNodesChange = useCallback((changes: NodeChange<ConceptFlowNode>[]) => {
    for (const c of changes) {
      if (c.type !== "select") continue;
      const id = Number(c.id);
      setSelectedId((prev) => (c.selected ? id : prev === id ? null : prev));
    }
  }, []);

  const detail: DetailData | null = useMemo(() => {
    if (!data || selectedId == null) return null;
    const byId = new Map([...data.full.nodes, ...graph.nodes].map((n) => [n.id, n]));
    const node = byId.get(selectedId);
    if (!node) return null;
    return {
      id: node.id,
      label: node.label,
      description: node.description ?? null,
      status: resolveStatus(node, data.items.get(node.id)),
      item: data.items.get(node.id),
      // 全体と、いまの範囲の両方に同じ辺があるので、重複を除く
      prerequisites: [...new Set(prerequisitesOf(node.id, [...data.full.edges, ...graph.edges]))].flatMap((id) => {
        const p = byId.get(id);
        return p ? [{ id, label: p.label, status: resolveStatus(p, data.items.get(id)) }] : [];
      }),
      lessons: lessonsOf(node.id, data.lessons),
    };
  }, [data, graph, selectedId]);

  // スマホの詳細シート：Esc で閉じる。開いたら、閉じるボタンへ
  const sheetOpen = !desktop && detail != null;
  useEffect(() => {
    if (!sheetOpen) return;
    // 開く前にフォーカスしていた所（選んだノード）を覚えておき、閉じたら戻す
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // フォーカスは、ボタンではなくシート自体に置く。ボタンに置くと、ノードを選んだ Enter の押下が、そのまま「閉じる」を押したことになる
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key !== "Tab") return;
      // Tab は、シートの中だけで回す（外へ出さない）
      const items = [...(sheetRef.current?.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])") ?? [])].filter(
        (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = sheetRef.current?.contains(active) ?? false;
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === sheetRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [sheetOpen]);

  const refresh = () => {
    setRefreshing(true);
    setTick((t) => t + 1);
  };

  const allLabel = (() => {
    const p = data?.profile;
    const subj = SUBJECTS.find((s) => s.value === subject)?.label ?? "";
    return p ? `${p.school_level === "middle" ? "中" : "高"}${p.grade}${subj}ぜんぶ` : `${subj}ぜんぶ`;
  })();

  const mapKey = `${effectiveScope}-${dir}-${graph.nodes.map((n) => n.id).join(",")}`;

  return (
    <AppShell active="knowledge">
      <main inert={sheetOpen} className="mx-auto w-full max-w-[1280px] px-4 pt-5 pb-8 lg:px-7 lg:pt-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-[22px] font-black lg:text-[26px]">ぴあ友の知識マップ</h1>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div role="group" aria-label="表示する範囲" className="flex rounded-2xl border border-outline bg-card p-1">
              {(
                [
                  ["current", "学習中の単元"],
                  ["all", allLabel],
                ] as [Scope, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={effectiveScope === value}
                  disabled={!data || (value === "current" && !data.current)}
                  onClick={() => {
                    setScope(value);
                    setSelectedId(null);
                  }}
                  className={`h-10 flex-1 rounded-xl px-4 text-[14px] font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-45 ${
                    effectiveScope === value ? "bg-primary text-white" : "text-link hover:bg-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="km-subject" className="sr-only">
                教科
              </label>
              <select
                id="km-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-10 flex-1 rounded-xl bg-primary px-4 text-[14px] font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link lg:flex-none"
              >
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing || !data}
                className="h-10 shrink-0 rounded-xl border border-outline bg-card px-3.5 text-[13.5px] font-bold text-link hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-link disabled:opacity-50"
              >
                {refreshing ? "更新中…" : "最新にする"}
              </button>
            </div>
          </div>
        </div>

        {refreshFailed && (
          <p role="alert" className="mt-3 rounded-xl bg-[#FDECEC] px-3 py-2 text-[13.5px] font-bold text-danger">
            最新の状態を取れませんでした。いま出ているのは、前に取った内容です。
          </p>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px] lg:gap-5">
          <div className="min-w-0">
            <div className="relative h-[calc(100dvh-24rem)] min-h-[340px] overflow-hidden rounded-card border border-line bg-card lg:h-[calc(100dvh-15rem)] lg:min-h-[480px]">
              {load.kind === "loading" && (
                <p role="status" className="flex h-full items-center justify-center text-[15px] text-sub">
                  読み込み中…
                </p>
              )}
              {load.kind === "error" && (
                <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-[16px] font-bold">通信できませんでした</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoad({ kind: "loading" });
                      setTick((t) => t + 1);
                    }}
                    className="h-11 rounded-2xl bg-primary px-6 font-bold text-white"
                  >
                    もう一度
                  </button>
                </div>
              )}
              {data && graph.nodes.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-[16px] font-bold">
                    {effectiveScope === "current" ? "学習中の単元の概念は、まだありません。" : "まだ、知識マップに出せる概念がありません。"}
                  </p>
                  <p className="text-[14px] text-sub">最初の授業を始めよう。教えるたびに、ぴあ友の知識が増えていきます。</p>
                  <Link href="/lessons/" className="flex h-11 items-center rounded-2xl bg-primary px-6 font-bold text-white">
                    学習内容を選ぶ
                  </Link>
                </div>
              )}
              {data && graph.nodes.length > 0 && (
                <ReactFlow
                  key={mapKey}
                  nodes={flow.nodes}
                  edges={flow.edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onPaneClick={() => setSelectedId(null)}
                  fitView
                  fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
                  minZoom={0.3}
                  maxZoom={2}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable
                  panOnDrag
                  attributionPosition="bottom-left"
                  aria-label="ぴあ友の知識マップ。ノードを選ぶと、詳細が出ます"
                >
                  <Background gap={22} color="#E3E8FA" />
                  <Controls showInteractive={false} position="bottom-right" />
                </ReactFlow>
              )}
            </div>

            <Legend />

            {/* 読み上げ用：地図が見えなくても、概念・状態・前提が分かる一覧 */}
            {data && graph.nodes.length > 0 && (
              <ul className="sr-only" aria-label="概念の一覧">
                {graph.nodes.map((n) => {
                  const pre = prerequisitesOf(n.id, graph.edges)
                    .map((id) => graph.nodes.find((x) => x.id === id)?.label)
                    .filter(Boolean);
                  return (
                    <li key={n.id}>
                      {n.label}：{STATUS_NAME[resolveStatus(n, data.items.get(n.id))]}。前提：{pre.length ? pre.join("、") : "なし"}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* PC：右の列に常に出す */}
          {desktop && (
            <aside aria-label="概念の詳細" className="rounded-card border border-line bg-card p-5 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto">
              {detail ? (
                <DetailPanel data={detail} onSelect={setSelectedId} titleId={titleId} />
              ) : (
                <p className="py-10 text-center text-[14px] text-sub">ノードを選ぶと詳細が出ます</p>
              )}
            </aside>
          )}
        </div>
      </main>

      {/* スマホ：ノードを選ぶと、下から出るシート。下に引くか、閉じるボタンか、外側を押すと閉じる */}
      {sheetOpen && detail && (
        <div className="fixed inset-0 z-40 flex items-end" role="presentation">
          <button type="button" aria-label="詳細を閉じる" tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={() => setSelectedId(null)} />
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={{ transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform 180ms ease" }}
            className="relative max-h-[78dvh] w-full overflow-y-auto outline-none rounded-t-[26px] bg-card px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(40,60,140,0.2)]"
          >
            <div
              className="mx-auto flex h-8 w-full cursor-grab touch-none items-center justify-center"
              onPointerDown={(e) => {
                dragStart.current = e.clientY;
                setDragging(true);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (dragStart.current != null) setDragY(Math.max(0, e.clientY - dragStart.current));
              }}
              onPointerUp={() => {
                const far = dragY > 80;
                dragStart.current = null;
                setDragging(false);
                setDragY(0);
                if (far) setSelectedId(null);
              }}
              onPointerCancel={() => {
                dragStart.current = null;
                setDragging(false);
                setDragY(0);
              }}
            >
              <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-[#CBD2EC]" />
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="absolute top-2 right-3 h-10 rounded-xl px-3 text-[14px] font-bold text-link focus-visible:outline-2 focus-visible:outline-link"
            >
              閉じる
            </button>
            <DetailPanel data={detail} onSelect={setSelectedId} titleId={titleId} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** 凡例：4つの状態と、辺の意味（実線の矢印＝前提の向き、破線＝関連） */
function Legend() {
  return (
    <section aria-label="凡例" className="mt-3 rounded-2xl bg-card px-4 py-3 text-[13px]">
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5 font-bold">
            <StatusMark status={s} size={18} />
            {STATUS_NAME[s]}
          </li>
        ))}
      </ul>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 text-sub">
        <li className="flex items-center gap-2">
          <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true">
            <line x1="2" y1="6" x2="30" y2="6" stroke="#2F55D4" strokeWidth="2.2" />
            <polygon points="38,6 29,1.5 29,10.5" fill="#2F55D4" />
          </svg>
          <span>
            <b className="text-ink">前提</b>（矢印の向きに学ぶ：前提 → あとの概念）
          </span>
        </li>
        <li className="flex items-center gap-2">
          <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true">
            <line x1="2" y1="6" x2="38" y2="6" stroke="#7A7FA3" strokeWidth="2" strokeDasharray="7 5" />
          </svg>
          <span>
            <b className="text-ink">関連</b>（一般的なつながり）
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-4 w-6 rounded outline-[3px] outline-[#F6C343]" />
          <span>選んでいるノード</span>
        </li>
      </ul>
    </section>
  );
}
