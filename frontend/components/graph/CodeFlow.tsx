"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CodeEdge, CodeNode, ResolvedCall } from "@/lib/types";
import { useNodeCode } from "@/lib/hooks";
import { highlightToHtml } from "@/lib/syntax";
import { summaryToHtml } from "@/lib/sanitize";
import { CODE, UI, UI_REV } from "@/lib/theme";
import { NODE_ACCENTS } from "./cytoscapeConfig";
import { EDGE_INFO, markerList } from "./relations";
import { Badge, Hint } from "@/components/ui/Hint";
import {
  HiOutlineArrowLeft,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineCodeBracket,
  HiOutlineCubeTransparent,
  HiOutlineXMark,
} from "@/components/icons";

const LINE_H = 22;

/** Types that intentionally have no source body (they reference code instead). */
const NO_BODY_TYPES = new Set(["ROUTE", "GHOST", "PACKAGE", "THIRD_PARTY"]);
const CARD_W = 620;
const CARD_H = 600;
const MIN_CARD_W = 420;
const MIN_CARD_H = 240;
const CARD_GAP_X = 150;
const CARD_GAP_Y = 110;

interface CardModel {
  cardId: string;
  nodeId: string;
  parentCardId?: string;
  parentNodeId?: string;
  callName?: string;
  call?: ResolvedCall;
  role?: "callee" | "caller";
  minimized?: boolean;
  /** Card size once the user has dragged the corner handle. */
  w?: number;
  h?: number;
}

interface Props {
  graphId: string;
  commitHash: string;
  graphLanguage?: string;
  nodesById: Record<string, CodeNode>;
  edges?: CodeEdge[];
  rootNodeId: string;
  activeNodeId?: string | null;
  onClose: () => void;
  onFocusNode: (nodeId: string) => void;
  /** Leave the code view and open this node in the details panel. */
  onOpenPanel?: (nodeId: string) => void;
  /** Leave the code view and focus this node on the canvas. */
  onShowInGraph?: (nodeId: string) => void;
}

let seq = 0;

/** Edge colour states the strongest ordering claim the call makes. */
function edgeColor(call?: ResolvedCall): string {
  if (!call) return CODE.cyan;
  if (call.awaited) return CODE.cyan;
  if (call.defer) {
    if (call.defer === "timer") return CODE.orange;
    if (call.defer === "onReturn") return CODE.green;
    return CODE.purple;
  }
  if (call.conc) return CODE.pink;
  if (call.repeat) return CODE.green;
  if (call.maybe) return CODE.comment;
  return CODE.cyan;
}

export default function CodeFlow(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({
  graphId,
  commitHash,
  graphLanguage,
  nodesById,
  edges,
  rootNodeId,
  activeNodeId,
  onClose,
  onFocusNode,
  onOpenPanel,
  onShowInGraph,
}: Props) {
  // Positions belong to React Flow: nodes are uncontrolled (`defaultPosition`
  // only), so dragging moves the DOM directly and never waits for React. The
  // ref holds the *initial* spot for cards that do not exist yet.
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const [cards, setCards] = useState<CardModel[]>(() => {
    const cardId = `c${++seq}`;
    posRef.current[cardId] = { x: 24, y: 18 };
    return [{ cardId, nodeId: rootNodeId, role: "callee" }];
  });
  const rf = useReactFlow();
  const sizesRef = useRef<Record<string, { w: number; h: number }>>({});

  const cardById = useMemo(() => new Map(cards.map((c) => [c.cardId, c])), [cards]);

  const openRelated = useCallback(
    (parentCardId: string, nodeId: string, role: "callee" | "caller", call?: ResolvedCall) => {
      setCards((prev) => {
        if (prev.some((c) => c.nodeId === nodeId)) return prev;
        const parent = prev.find((c) => c.cardId === parentCardId);
        // A card the user has dragged lives at its React Flow position, not the
        // spawn point, so children are placed relative to where it is now.
        const base = rf.getNode(parentCardId)?.position ?? posRef.current[parentCardId] ?? { x: 0, y: 0 };
        const siblings = prev.filter((c) => c.parentCardId === parentCardId).length;
        const cardId = `c${++seq}`;
        const parentW = sizesRef.current[parentCardId]?.w ?? CARD_W;
        posRef.current[cardId] = {
          x: base.x + (role === "caller" ? -(parentW + CARD_GAP_X) : parentW + CARD_GAP_X),
          y: base.y + siblings * CARD_GAP_Y,
        };
        return [
          ...prev,
          {
            cardId,
            nodeId,
            parentCardId,
            parentNodeId: parent?.nodeId,
            callName: call?.name,
            call,
            role,
          },
        ];
      });
    },
    [],
  );

  const removeCard = useCallback((cardId: string) => {
    setCards((prev) => {
      // Dropping a card also drops everything that was opened from it, so no
      // orphaned branch is left floating without its parent.
      const doomed = new Set([cardId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of prev) {
          if (c.parentCardId && doomed.has(c.parentCardId) && !doomed.has(c.cardId)) {
            doomed.add(c.cardId);
            changed = true;
          }
        }
      }
      for (const id of doomed) delete posRef.current[id];
      return prev.filter((c) => !doomed.has(c.cardId));
    });
  }, []);

  /** "Back" pops the card opened most recently. */
  const back = useCallback(() => {
    setCards((prev) => {
      if (prev.length <= 1) return prev;
      const last = prev[prev.length - 1];
      delete posRef.current[last.cardId];
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    if (cards.length === 0) onClose();
  }, [cards.length, onClose]);

  /**
   * Corner resize. Sizes are React state (they change the card's box, not its
   * transform), but pointer events are coalesced into one update per frame so a
   * fast drag does not re-render the highlighted code on every mousemove.
   */
  const startResize = useCallback((e: React.MouseEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = sizesRef.current[cardId] ?? { w: CARD_W, h: CARD_H };
    let pending = { ...start };
    let raf = 0;
    const flush = () => {
      raf = 0;
      sizesRef.current[cardId] = pending;
      setCards((prev) => prev.map((c) => (c.cardId === cardId ? { ...c, w: pending.w, h: pending.h } : c)));
    };
    const move = (ev: MouseEvent) => {
      pending = {
        w: Math.max(MIN_CARD_W, Math.min(1600, start.w + (ev.clientX - startX))),
        h: Math.max(MIN_CARD_H, Math.min(1400, start.h + (ev.clientY - startY))),
      };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const up = () => {
      if (raf) cancelAnimationFrame(raf);
      flush();
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, []);

  // React Flow owns node positions; `data` is rebuilt only when the card list or
  // its inputs change. During a drag only the position updates, the data object
  // keeps its identity, and the memoised card body skips re-rendering — which is
  // what makes the card follow the pointer instead of teleporting at drop.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return cards.map((c) => {
        const existing = byId.get(c.cardId);
        return {
          id: c.cardId,
          type: "card",
          position: existing?.position ?? posRef.current[c.cardId] ?? { x: 0, y: 0 },
          data: {
            model: c,
            parentName: c.parentCardId ? nodesById[cardById.get(c.parentCardId)?.nodeId ?? ""]?.name : undefined,
            node: nodesById[c.nodeId],
            graphId,
            commitHash,
            graphLanguage,
            edges,
            nodesById,
            onOpenRelated: (id: string, call?: ResolvedCall, role: "callee" | "caller" = "callee") =>
              openRelated(c.cardId, id, role, call),
            onFocusNode,
            onOpenPanel,
            onShowInGraph,
            onToggle: () =>
              setCards((p) => p.map((x) => (x.cardId === c.cardId ? { ...x, minimized: !x.minimized } : x))),
            onRemove: () => removeCard(c.cardId),
            onBack: back,
            onResizeStart: (e: React.MouseEvent) => startResize(e, c.cardId),
            cardIndex: cards.indexOf(c),
            isLastCard: cards.indexOf(c) === cards.length - 1,
            active: activeNodeId === c.nodeId,
            openNodeIds: new Set(cards.map((x) => x.nodeId)),
          },
          style: { width: c.w ?? CARD_W },
          draggable: true,
          dragHandle: ".card-drag",
        } as Node;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, nodesById, graphId, commitHash, graphLanguage, edges, activeNodeId, cardById]);

  const rfEdges: Edge[] = useMemo(
    () =>
      cards
        .filter((c) => c.parentCardId)
        .map((c) => {
          const color = c.role === "caller" ? CODE.green : edgeColor(c.call);
          return {
            id: `e-${c.cardId}`,
            source: c.role === "caller" ? c.cardId : c.parentCardId!,
            target: c.role === "caller" ? c.parentCardId! : c.cardId,
            label: c.callName,
            type: "default",
            animated: false,
            style: { stroke: color, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
            labelStyle: {
              fill: UI.textSub,
              fontSize: 11.5,
              fontFamily: "'Fira Code', ui-monospace, monospace",
            },
            labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92, stroke: UI.border, strokeWidth: 1 },
            labelBgPadding: [5, 3] as [number, number],
            labelBgBorderRadius: 4,
          };
        }),
    [cards],
  );

  // Keep every open card in view as the tree grows; without this a new child
  // lands outside the viewport and the click looks like a no-op.
  useEffect(() => {
    if (cards.length < 2) return;
    const id = setTimeout(() => rf.fitView({ padding: 0.16, duration: 380, maxZoom: 1 }), 220);
    return () => clearTimeout(id);
  }, [cards.length, rf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (cards.length > 1) back();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length, back, onClose]);

  // Column-per-hop tree layout: callers land to the left, callees to the right.
  function arrange() {
    const depthOf = (c: CardModel): number => {
      let d = 0;
      let cur: CardModel | undefined = c;
      const seen = new Set<string>();
      while (cur?.parentCardId && !seen.has(cur.cardId)) {
        seen.add(cur.cardId);
        const parentId = cur.parentCardId;
        cur = cardById.get(parentId);
        d += cur?.role === "caller" ? -1 : 1;
      }
      return d;
    };
    const next: Record<string, { x: number; y: number }> = {};
    const rows = new Map<number, number>();
    for (const c of cards) {
      const d = depthOf(c);
      const i = rows.get(d) ?? 0;
      rows.set(d, i + 1);
      next[c.cardId] = { x: d * (CARD_W + CARD_GAP_X), y: i * 620 };
    }
    posRef.current = next;
    rf.setNodes((current) => current.map((n) => ({ ...n, position: next[n.id] ?? n.position })));
    setTimeout(() => rf.fitView({ padding: 0.14, duration: 380, maxZoom: 1 }), 60);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#f7f5f0" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center shrink-0"
        style={{
          gap: 10,
          padding: "0 16px",
          height: 56,
          background: UI.surface,
          borderBottom: `1px solid ${UI.border}`,
          boxShadow: "0 1px 0 rgba(28,25,23,0.03)",
        }}
      >
        <button
          onClick={cards.length > 1 ? back : onClose}
          title={cards.length > 1 ? "Close the most recently opened card (Esc)" : "Close the code view (Esc)"}
          style={barBtn}
        >
          <HiOutlineArrowLeft size={15} />
          {cards.length > 1 ? "Back" : "Close"}
        </button>

        <div style={{ width: 1, height: 22, background: UI.border }} />

        <span style={{ fontSize: 14, fontWeight: 600, color: UI.text }}>Code view</span>
        <span style={{ fontSize: 12.5, color: UI.textDim, fontFamily: "'Fira Code', monospace" }}>
          {cards.length} card{cards.length === 1 ? "" : "s"}
        </span>
        <span
          title="UI revision — if this is not the revision you expect, the tab is running a cached bundle"
          style={{ fontSize: 10.5, color: UI.textGhost, fontFamily: "'Fira Code', monospace" }}
        >
          {UI_REV}
        </span>

        <div className="flex items-center ml-auto" style={{ gap: 8 }}>
          <button onClick={arrange} style={barBtn} title="Lay the open cards out as a tree">
            Auto-arrange
          </button>
          <button
            onClick={onClose}
            title="Close every card and leave the code view"
            style={{ ...barBtn, borderColor: "rgba(185,28,28,0.32)", color: "#b91c1c", background: "rgba(185,28,28,0.06)" }}
          >
            <HiOutlineXMark size={14} />
            Close all
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <ReactFlow
          className={dragging ? "flow-dragging" : undefined}
          nodes={nodes}
          edges={rfEdges}
          onNodeDragStart={() => setDragging(true)}
          onNodeDragStop={() => setDragging(false)}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          elevateNodesOnSelect
          defaultEdgeOptions={{ type: "default" }}
        >
          <Background color="#e0dacd" gap={26} />
          <ZoomControls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n: any) => NODE_ACCENTS[(n?.data as any)?.node?.type] ?? CODE.border}
            maskColor="rgba(250,249,246,0.82)"
            style={{ background: UI.surface, border: `1px solid ${UI.border}`, borderRadius: 8 }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}



// ─── Card ─────────────────────────────────────────────────────────────────────

function CardNodeInner({ data }: any) {
  const {
    model,
    parentName,
    node,
    graphId,
    commitHash,
    graphLanguage,
    edges,
    nodesById,
    onOpenRelated,
    onFocusNode,
    onOpenPanel,
    onShowInGraph,
    onToggle,
    onRemove,
    onBack,
    onResizeStart,
    cardIndex,
    isLastCard,
    active,
    openNodeIds,
  } = data as {
    model: CardModel;
    parentName?: string;
    node: CodeNode;
    graphId: string;
    commitHash: string;
    graphLanguage?: string;
    edges?: CodeEdge[];
    nodesById: Record<string, CodeNode>;
    onOpenRelated: (id: string, call?: ResolvedCall, role?: "callee" | "caller") => void;
    onFocusNode: (id: string) => void;
    onOpenPanel?: (id: string) => void;
    onShowInGraph?: (id: string) => void;
    onToggle: () => void;
    onRemove: () => void;
    onBack: () => void;
    onResizeStart: (e: React.MouseEvent) => void;
    cardIndex: number;
    isLastCard: boolean;
    active: boolean;
    openNodeIds: Set<string>;
  };

  const { data: codeData, isLoading, isError: codeError, error: codeErr, refetch: refetchCode } =
    useNodeCode(graphId, commitHash, node?.id ?? null);
  const code: string = (codeData as any)?.code ?? (codeData as any)?.rawCode ?? "";
  const [openSummary, setOpenSummary] = useState({ technical: true, business: false, security: false });
  const [showCallers, setShowCallers] = useState(model.role !== "caller" && !model.parentCardId);
  const [copied, setCopied] = useState(false);

  /** Definitions declared inside this node (for the range bands). */
  const children = useMemo(() => {
    if (!node) return [];
    return Object.values(nodesById)
      .filter(
        (n) =>
          n.id !== node.id &&
          n.filePath === node.filePath &&
          (n.startLine ?? 0) >= (node.startLine ?? 0) &&
          (n.endLine ?? 0) <= (node.endLine ?? 0),
      )
      .sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));
  }, [node, nodesById]);

  const calls = useMemo(
    () =>
      ((node?.metadata?.resolvedCalls ?? []) as ResolvedCall[])
        .filter((c) => typeof c.firstOrder === "number")
        .sort((a, b) => (a.firstOrder ?? 0) - (b.firstOrder ?? 0)),
    [node],
  );

  /**
   * Everything that reaches this node — the way back up the stack.
   *
   * CALLS-only was too narrow: the engine emits USES for a function that is
   * referenced and then invoked through a wrapper, so a node with real callers
   * showed an empty list. Any incoming edge counts; the chip names the relation.
   */
  const callers = useMemo(() => {
    if (!edges || !node) return [];
    const seen = new Map<string, string>();
    for (const e of edges) {
      if (e.to !== node.id || e.from === node.id) continue;
      if (!nodesById[e.from]) continue;
      if (!seen.has(e.from)) seen.set(e.from, e.type);
    }
    return [...seen.entries()].map(([id, type]) => ({ node: nodesById[id], type }));
  }, [edges, node, nodesById]);

  const lines = useMemo<string[]>(() => (code ? code.split("\n") : []), [code]);
  const highlighted = useMemo(
    () => (code ? highlightToHtml(code, graphLanguage, node?.filePath) : ""),
    [code, graphLanguage, node?.filePath],
  );

  if (!node) return null;

  const technical = (node.technicalSummary ?? "").trim();
  const business  = (node.businessSummary  ?? "").trim();
  const security  = node.security;
  const securityHasContent = !!security && (
    security.severity !== "none" || !!security.summary?.trim()
  );
  const hasAnySummary = !!technical || !!business || securityHasContent;
  const startLine = node.startLine ?? 1;
  const accent = NODE_ACCENTS[node.type] ?? CODE.cyan;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      data-card={model.cardId}
      style={{
        position: "relative",
        background: CODE.bg,
        border: `1px solid ${active ? CODE.cyan : CODE.border}`,
        boxShadow: active ? `0 0 0 1px ${CODE.cyan}55, 0 24px 56px rgba(0,0,0,0.55)` : "0 18px 40px rgba(0,0,0,0.45)",
        // A dragged size wins; otherwise stay within the viewport.
        height: model.minimized ? 52 : model.h,
        maxHeight: model.minimized ? 52 : model.h ?? "min(600px, calc(100vh - 220px))",
        color: CODE.text,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* Corner grip: drag to resize the card in both axes. */}
      {!model.minimized && (
        <div
          className="nodrag"
          onMouseDown={onResizeStart}
          title="Drag to resize this card"
          style={{
            position: "absolute", right: 0, bottom: 0, width: 20, height: 20,
            cursor: "nwse-resize", zIndex: 20,
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            padding: 3, color: CODE.textDim,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* ── Header (drag handle) ─────────────────────────────────────── */}
      <div
        className="card-drag flex items-center shrink-0"
        style={{
          gap: 8,
          padding: "9px 10px 9px 12px",
          background: CODE.surface,
          borderBottom: `1px solid ${CODE.border}`,
          cursor: "grab",
        }}
      >
        <span
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: accent,
            background: `${accent}22`,
            border: `1px solid ${accent}44`,
            flexShrink: 0,
          }}
        >
          {node.type.replace(/_/g, " ")}
        </span>
        <span
          style={{
            fontFamily: "'Fira Code', ui-monospace, monospace",
            fontSize: 14,
            fontWeight: 600,
            color: CODE.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </span>
        <span
          style={{
            fontFamily: "'Fira Code', ui-monospace, monospace",
            fontSize: 11.5,
            color: CODE.textDim,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.filePath.split("/").slice(-2).join("/")}:{node.startLine}
        </span>
        {parentName && (
          <span
            title={`opened from ${parentName}`}
            style={{ fontSize: 11.5, color: CODE.textDim, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            ← {parentName}
          </span>
        )}

        <div className="ml-auto flex items-center nodrag" style={{ gap: 4 }}>
          <CardBtn
            label={copied ? "✓" : "⧉"}
            title="Copy the whole file slice"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {}
            }}
            tone={copied ? CODE.green : CODE.textSub}
          />
          <CardBtn
            label={model.minimized ? "▢" : "–"}
            title={model.minimized ? "Expand card" : "Minimise card"}
            onClick={onToggle}
            tone={CODE.textSub}
          />
          <CardBtn label="✕" title="Close this card and its children" onClick={onRemove} tone={CODE.red} />
        </div>
      </div>

      {!model.minimized && (
        <>
          {/* ── Summaries: technical / business / security ──────────── */}
          {!hasAnySummary && (
            <div
              className="shrink-0 nodrag"
              style={{ padding: "9px 12px", borderBottom: `1px solid ${CODE.border}`, fontSize: 12.5, color: "#a9aec9" }}
            >
              No summary stored — re-analyze with summarization enabled.
            </div>
          )}

          {hasAnySummary && (
            <div
              className="shrink-0 nodrag"
              style={{ padding: "9px 12px", borderBottom: `1px solid ${CODE.border}` }}
            >
              <SummarySection
                label="Technical"
                open={openSummary.technical}
                onToggle={() => setOpenSummary(o => ({ ...o, technical: !o.technical }))}
              >
                {technical ? (
                  <SummaryBody html={summaryToHtml(technical)} />
                ) : (
                  <span style={{ fontSize: 12.5, color: "#a9aec9" }}>No technical summary.</span>
                )}
              </SummarySection>

              {(business || securityHasContent) && (
                <div style={{ borderTop: `1px solid ${CODE.border}`, marginTop: 7, paddingTop: 7 }}>
                  {business && (
                    <SummarySection
                      label="Business"
                      open={openSummary.business}
                      onToggle={() => setOpenSummary(o => ({ ...o, business: !o.business }))}
                    >
                      <SummaryBody html={summaryToHtml(business)} />
                    </SummarySection>
                  )}

                  {securityHasContent && (
                    <div style={{ marginTop: business ? 7 : 0 }}>
                      <SummarySection
                        label="Security"
                        open={openSummary.security}
                        onToggle={() => setOpenSummary(o => ({ ...o, security: !o.security }))}
                        badge={security!.severity !== "none" ? security!.severity.toUpperCase() : undefined}
                        badgeTone={SECURITY_TONE[security!.severity] ?? CODE.textDim}
                      >
                        {security!.summary?.trim() ? (
                          <SummaryBody html={summaryToHtml(security!.summary)} />
                        ) : (
                          <span style={{ fontSize: 12.5, color: "#a9aec9" }}>
                            No security notes for this node.
                          </span>
                        )}
                      </SummarySection>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Callers (way back up the stack) ─────────────────────── */}
          {callers.length > 0 && (
            <div className="shrink-0 nodrag" style={{ padding: "8px 12px", borderBottom: `1px solid ${CODE.border}` }}>
              <button
                onClick={() => setShowCallers((v) => !v)}
                className="flex items-center"
                style={{
                  gap: 5,
                  border: "none",
                  background: "none",
                  color: CODE.textDim,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: 0,
                }}
              >
                {showCallers ? <HiOutlineChevronDown size={11} /> : <HiOutlineChevronRight size={11} />}
                Called by
                <span style={{ color: CODE.green }}>{callers.length}</span>
              </button>
              {showCallers && (
                <div className="flex flex-wrap" style={{ gap: 5, marginTop: 7 }}>
                  {callers.map((c) => (
                    <Hint
                      key={c.node.id}
                      label={
                        openNodeIds.has(c.node.id)
                          ? `${c.node.name} is already open in this view.`
                          : `${EDGE_INFO[c.type] ?? c.type} Open it to the left of this card.`
                      }
                    >
                      <button
                        disabled={openNodeIds.has(c.node.id)}
                        onClick={() => onOpenRelated(c.node.id, undefined, "caller")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "2px 7px",
                          borderRadius: 5,
                          border: `1px solid ${openNodeIds.has(c.node.id) ? CODE.border : `${CODE.green}55`}`,
                          background: openNodeIds.has(c.node.id) ? "transparent" : `${CODE.green}12`,
                          color: openNodeIds.has(c.node.id) ? CODE.textDim : CODE.green,
                          fontFamily: "'Fira Code', monospace",
                          fontSize: 11,
                          cursor: openNodeIds.has(c.node.id) ? "default" : "pointer",
                        }}
                      >
                        {c.node.name}
                      </button>
                    </Hint>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Code ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto nowheel code-scroller" style={{ scrollbarWidth: "thin" }}>
            {isLoading && (
              <div style={{ padding: "14px 12px", fontSize: 12, color: CODE.textDim }}>Loading…</div>
            )}
            {!isLoading && codeError && (
              <div style={{ padding: "14px 12px", fontSize: 12.5, color: CODE.orange, lineHeight: 1.6 }}>
                Could not load the source for this node.
                <div style={{ color: CODE.textDim, marginTop: 4 }}>
                  {(codeErr as Error)?.message ?? "The server did not answer."}
                </div>
                <button
                  onClick={() => refetchCode()}
                  style={{
                    marginTop: 8, padding: "4px 10px", borderRadius: 6,
                    border: `1px solid ${CODE.border}`, background: CODE.elevated,
                    color: CODE.text, fontSize: 12,
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !codeError && lines.length === 0 && (
              NO_BODY_TYPES.has(node.type) ? (
                <div style={{ padding: "14px 12px", fontSize: 12, color: CODE.textDim, lineHeight: 1.6 }}>
                  {node.type.replace(/_/g, " ")} nodes point at code rather than owning a body, so
                  there is nothing to show here. Open the file node, or one of its members, instead.
                </div>
              ) : (
                <div style={{ padding: "14px 12px", fontSize: 12.5, color: CODE.textDim, lineHeight: 1.6 }}>
                  The engine returned no source for this {node.type.replace(/_/g, " ").toLowerCase()} node.
                  That usually means the graph was being rebuilt when the request went out.
                  <button
                    onClick={() => refetchCode()}
                    style={{
                      display: "block",
                      marginTop: 8, padding: "4px 10px", borderRadius: 6,
                      border: `1px solid ${CODE.border}`, background: CODE.elevated,
                      color: CODE.text, fontSize: 12,
                    }}
                  >
                    Retry
                  </button>
                </div>
              )
            )}
            {lines.length > 0 && (
              <div className="relative" style={{ minHeight: lines.length * LINE_H }}>
                {/* Gutter rule: the call-badge column has to read as a column
                    even when no call line is in view. */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    right: 168,
                    width: 1,
                    background: CODE.borderSoft,
                    pointerEvents: "none",
                  }}
                />
                <div
                  aria-hidden
                  className="nodrag"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 8,
                    width: 152,
                    textAlign: "right",
                    fontSize: 9.5,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#7f89b8",
                    pointerEvents: "none",
                  }}
                >
                  calls
                </div>
                {/* Range bands for definitions declared inside this node. */}
                {children.map((child, i) => {
                  const top = ((child.startLine ?? startLine) - startLine) * LINE_H;
                  const height = ((child.endLine ?? 0) - (child.startLine ?? 0) + 1) * LINE_H;
                  const color = BAND_COLORS[i % BAND_COLORS.length];
                  return (
                    <div
                      key={child.id}
                      style={{
                        position: "absolute",
                        left: 46,
                        right: 168,
                        top,
                        height,
                        background: `${color}14`,
                        borderLeft: `2px solid ${color}aa`,
                        pointerEvents: "none",
                      }}
                    />
                  );
                })}

                <div
                  className="absolute left-0 top-0 text-right select-none"
                  style={{
                    width: 46,
                    color: "#7f89b8",
                    fontFamily: "'Fira Code', ui-monospace, monospace",
                    fontSize: 11,
                    lineHeight: `${LINE_H}px`,
                    paddingRight: 8,
                    borderRight: `1px solid ${CODE.borderSoft}`,
                  }}
                >
                  {lines.map((_, i) => (
                    <div key={i}>{startLine + i}</div>
                  ))}
                </div>

                <pre
                  className="hljs absolute top-0 nodrag"
                  style={{
                    left: 46,
                    right: 168,
                    margin: 0,
                    padding: "0 10px",
                    background: "transparent",
                    fontSize: 13,
                    lineHeight: `${LINE_H}px`,
                    fontFamily: "'Fira Code', ui-monospace, Menlo, Consolas, monospace",
                  }}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />

                {calls.map((c) => {
                  if (c.line == null) return null;
                  const top = (c.line - startLine) * LINE_H;
                  if (top < 0 || top > lines.length * LINE_H) return null;
                  const markers = markerList(c);
                  const color = edgeColor(c);
                  return (
                    <Hint
                      key={`${c.nodeId}-${c.line}`}
                      label={
                        <span>
                          <b>{c.name}</b>
                          {openNodeIds.has(c.nodeId) ? " — already open in this view." : ""}
                          {markers.length > 0 && <><br />{markers.map((m) => m.info).join(" ")}</>}
                          <br />
                          Click to open this call as a card.
                        </span>
                      }
                      maxWidth={280}
                    >
                      <button
                        data-chip-node={c.nodeId}
                        onClick={() => onOpenRelated(c.nodeId, c, "callee")}
                        className="absolute nodrag"
                        style={{
                          right: 4,
                          top: top + 1,
                          height: LINE_H - 2,
                          width: 154,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "0 6px",
                          borderRadius: 4,
                          border: `1px solid ${color}66`,
                          background: CODE.surface,
                          color,
                          fontFamily: "'Fira Code', monospace",
                          fontSize: 10.5,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                        {markers.length > 0 && (
                          <span style={{ color: CODE.textDim, flexShrink: 0 }}>
                            · {markers.map((m) => m.label).join(" · ")}
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", flexShrink: 0, color: openNodeIds.has(c.nodeId) ? CODE.textDim : color }}>
                          {openNodeIds.has(c.nodeId) ? "•" : "→"}
                        </span>
                      </button>
                    </Hint>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div
            className="flex items-center shrink-0 nodrag"
            style={{
              gap: 8,
              padding: "7px 10px",
              borderTop: `1px solid ${CODE.border}`,
              background: CODE.surface,
            }}
          >
            <span style={{ fontFamily: "'Fira Code', monospace", fontSize: 11, color: CODE.textDim }}>
              {calls.length} call{calls.length === 1 ? "" : "s"} · {lines.length} lines
            </span>
            <div className="ml-auto flex items-center" style={{ gap: 6 }}>
              {onOpenPanel && (
                <FooterBtn onClick={() => onOpenPanel(node.id)} tone={CODE.purple}>
                  <HiOutlineCodeBracket size={11} />
                  Panel
                </FooterBtn>
              )}
              <FooterBtn onClick={() => (onShowInGraph ?? onFocusNode)(node.id)} tone={CODE.cyan}>
                <HiOutlineCubeTransparent size={11} />
                Show in graph
              </FooterBtn>
              {cardIndex > 0 && isLastCard && (
                <FooterBtn onClick={onBack} tone={CODE.textSub}>
                  ← Back
                </FooterBtn>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const BAND_COLORS = [CODE.cyan, CODE.green, CODE.orange, CODE.purple, CODE.pink];

function CardBtn({
  label,
  title,
  onClick,
  tone,
}: {
  label: string;
  title: string;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        border: `1px solid ${CODE.border}`,
        background: "transparent",
        color: tone,
        fontSize: 11,
        lineHeight: 1,
      }}
      className="hover:!bg-[#44475a]"
    >
      {label}
    </button>
  );
}

function FooterBtn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 7px",
        borderRadius: 5,
        border: `1px solid ${CODE.border}`,
        background: "transparent",
        color: tone,
        fontSize: 11,
      }}
      className="hover:!bg-[#44475a]"
    >
      {children}
    </button>
  );
}

const barBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 7,
  border: `1px solid ${UI.border}`,
  background: UI.elevated,
  color: UI.text,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
/**
 * The card body renders hundreds of highlighted lines, so it must not re-render
 * once per drag frame. Its `data` object is stable across a drag (only the node
 * position changes), which is exactly what this comparator relies on.
 */
const CardNode = memo(CardNodeInner, (a: any, b: any) => a.data === b.data);
const nodeTypes = { card: CardNode };

const SECURITY_TONE: Record<string, string> = {
  high:   CODE.red,
  medium: "#ffb86c",
  low:    "#f1fa8c",
  none:   CODE.textDim,
};

function SummarySection({
  label, open, onToggle, badge, badgeTone, children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  badgeTone?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center"
        style={{
          gap: 5, border: "none", background: "none", color: CODE.textDim,
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", padding: 0, cursor: "pointer",
        }}
      >
        {open ? <HiOutlineChevronDown size={11} /> : <HiOutlineChevronRight size={11} />}
        {label}
        {badge && (
          <span
            style={{
              marginLeft: 6, padding: "1px 6px", borderRadius: 999,
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em",
              color: badgeTone ?? CODE.textDim,
              background: (badgeTone ?? CODE.textDim) + "22",
              border: `1px solid ${(badgeTone ?? CODE.textDim)}66`,
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

function SummaryBody({ html, maxHeight = 150 }: { html: string; maxHeight?: number }) {
  return (
    <div
      className="summary-html summary-html--code summary-scroll nodrag nowheel"
      style={{ fontSize: 12.5, lineHeight: 1.62, maxHeight }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-left" style={{ margin: 16 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: UI.surface,
          border: `1px solid ${UI.border}`,
          borderRadius: 9,
          overflow: "hidden",
          boxShadow: "0 6px 18px rgba(28,25,23,0.12)",
        }}
      >
        <ZoomBtn label="Zoom in" onClick={() => zoomIn({ duration: 160 })}>
          <path d="M6 2.2v7.6M2.2 6h7.6" />
        </ZoomBtn>
        <ZoomBtn label="Zoom out" onClick={() => zoomOut({ duration: 160 })} divider>
          <path d="M2.2 6h7.6" />
        </ZoomBtn>
        <ZoomBtn label="Fit view" onClick={() => fitView({ padding: 0.16, duration: 220 })} divider>
          <path d="M2.4 4.6V2.6h2M9.6 4.6V2.6h-2M2.4 7.4v2h2M9.6 7.4v2h-2" />
        </ZoomBtn>
      </div>
    </Panel>
  );
}

function ZoomBtn({
  label, onClick, divider, children,
}: {
  label: string;
  onClick: () => void;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 30, height: 30, border: "none",
        borderTop: divider ? `1px solid ${UI.border}` : "none",
        background: "transparent", color: UI.textSub,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = UI.elevated;
        e.currentTarget.style.color = UI.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = UI.textSub;
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </g>
      </svg>
    </button>
  );
}
