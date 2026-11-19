"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CodeEdge, CodeNode, ResolvedCall } from "@/lib/types";
import { useNodeCode } from "@/lib/hooks";
import { highlightToHtml } from "@/lib/syntax";
import { NODE_ACCENTS } from "./cytoscapeConfig";

const C = {
  card: "#0d1117",
  surface: "#161b22",
  elevated: "#21262d",
  border: "#30363d",
  text: "#e6edf3",
  textSub: "#8b949e",
  textDim: "#6e7681",
  teal: "#2dd4bf",
  amber: "#f0b45c",
  blue: "#60a5fa",
  red: "#f85149",
};

const RANGE_COLORS = ["#60a5fa", "#2dd4bf", "#f0b45c", "#a78bfa", "#f472b6"];
const LINE_H = 20;
const CARD_W = 560;

interface CardModel {
  cardId: string;
  nodeId: string;
  parentCardId?: string;
  parentNodeId?: string;
  callName?: string;
  call?: ResolvedCall;
  minimized?: boolean;
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
}

let seq = 0;

function edgeColor(call?: ResolvedCall): string {
  if (!call) return "#60a5fa";
  if (call.awaited) return "#60a5fa";
  if (call.defer) {
    if (call.defer === "timer") return "#f0b45c";
    if (call.defer === "onReturn") return "#3fb950";
    return "#a78bfa";
  }
  if (call.conc) return "#f472b6";
  if (call.repeat) return "#2dd4bf";
  if (call.maybe) return "#8b949e";
  return "#60a5fa";
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
}: Props) {
  const [cards, setCards] = useState<CardModel[]>([
    { cardId: `c${++seq}`, nodeId: rootNodeId },
  ]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const rf = useReactFlow();

  const openChild = useCallback(
    (parentCardId: string, nodeId: string, call?: ResolvedCall) => {
      setCards((prev) => {
        const existing = prev.find((c) => c.nodeId === nodeId);
        if (existing) return prev;
        const parent = prev.find((c) => c.cardId === parentCardId);
        const siblings = prev.filter((c) => c.parentCardId === parentCardId).length;
        const base = positions[parentCardId] ?? { x: 0, y: 0 };
        const next: CardModel = {
          cardId: `c${++seq}`,
          nodeId,
          parentCardId,
          parentNodeId: parent?.nodeId,
          callName: call?.name,
          call,
        };
        setPositions((p) => ({
          ...p,
          [next.cardId]: {
            x: base.x + CARD_W + 120,
            y: base.y + siblings * 90,
          },
        }));
        return [...prev, next];
      });
    },
    [positions],
  );

  const nodes: Node[] = useMemo(
    () =>
      cards.map((c) => ({
        id: c.cardId,
        type: "card",
        position: positions[c.cardId] ?? { x: 0, y: 0 },
        data: {
          model: c,
          parentName: c.parentCardId
            ? nodesById[cards.find((x) => x.cardId === c.parentCardId)?.nodeId ?? ""]?.name
            : undefined,
          node: nodesById[c.nodeId],
          graphId,
          commitHash,
          graphLanguage,
          edges,
          nodesById,
          onOpenChild: (id: string, call?: ResolvedCall) => openChild(c.cardId, id, call),
          onFocusNode,
          onToggle: () =>
            setCards((prev) =>
              prev.map((x) => (x.cardId === c.cardId ? { ...x, minimized: !x.minimized } : x)),
            ),
          onRemove: () => setCards((prev) => prev.filter((x) => x.cardId !== c.cardId)),
          active: activeNodeId === c.nodeId,
        },
        style: { width: CARD_W },
      })),
    [cards, positions, nodesById, graphId, commitHash, graphLanguage, edges, openChild, onFocusNode, activeNodeId],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      cards
        .filter((c) => c.parentCardId)
        .map((c) => {
          const activeCards = new Set(cards.filter((x) => x.nodeId === activeNodeId).map((x) => x.cardId));
          const dimmed = !!activeNodeId && !activeCards.has(c.cardId) && !activeCards.has(c.parentCardId!);
          return {
          id: `e-${c.cardId}`,
          source: c.parentCardId!,
          target: c.cardId,
          label: c.callName,
          type: "default",
          animated: false,
          style: { stroke: edgeColor(c.call), strokeWidth: dimmed ? 1.2 : 2, opacity: dimmed ? 0.22 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(c.call), width: 18, height: 18 },
          labelStyle: { fill: "#c9d1e3", fontSize: 10, fontFamily: "ui-monospace, monospace", opacity: dimmed ? 0.3 : 1 },
          labelBgStyle: { fill: "#161b22", fillOpacity: dimmed ? 0.3 : 0.92 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        };
        }),
    [cards, activeNodeId],
  );

  const onNodesChange = useCallback((changes: any) => {
      const arr: any[] = typeof changes?.toArray === "function" ? changes.toArray() : (changes ?? []);
      const posChanges = arr.filter((ch) => ch.type === "position" && ch.position);
      if (posChanges.length) {
        setPositions((prev) => {
          const next = { ...prev };
          for (const ch of posChanges) next[ch.id] = ch.position;
          return next;
        });
      }
    }, []);

  const [fittedOnce, setFittedOnce] = useState(false);
  useEffect(() => {
    if (!fittedOnce && nodes.length) {
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 120);
      setFittedOnce(true);
    }
  }, [nodes.length, fittedOnce, rf]);

  // Keep every open card in view as the tree grows. Without this, a new child
  // is placed outside the current viewport and the user sees nothing happen.
  useEffect(() => {
    if (!fittedOnce || nodes.length < 2) return;
    const id = setTimeout(() => rf.fitView({ padding: 0.18, duration: 450, maxZoom: 1 }), 220);
    return () => clearTimeout(id);
  }, [cards.length, fittedOnce, rf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Depth-first tree layout: one column per hop, siblings stacked vertically.
  function arrange() {
    const depthOf = (c: CardModel): number => {
      let d = 0;
      let cur: CardModel | undefined = c;
      const seen = new Set<string>();
      while (cur?.parentCardId && !seen.has(cur.cardId)) {
        seen.add(cur.cardId);
        cur = cards.find((x) => x.cardId === cur!.parentCardId);
        d++;
      }
      return d;
    };
    const next: Record<string, { x: number; y: number }> = {};
    const rows = new Map<number, number>();
    for (const c of cards) {
      const d = depthOf(c);
      const i = rows.get(d) ?? 0;
      rows.set(d, i + 1);
      next[c.cardId] = { x: d * 700, y: i * 560 };
    }
    setPositions(next);
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 400, maxZoom: 1 }), 80);
  }

  return (
    <div className="absolute inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)" }}>
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        minZoom={0.15}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => {
          const model = (n.data as any).model as CardModel;
          onFocusNode(model.nodeId);
        }}
        elevateNodesOnSelect
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background color="#1f2630" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n: any) => NODE_ACCENTS[(n?.data as any)?.node?.type] ?? "#30363d"}
          maskColor="rgba(0,0,0,0.55)"
          style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8 }}
        />
      </ReactFlow>

      <div className="absolute bottom-32 left-4 flex items-center gap-2">
        <button
          onClick={arrange}
          className="text-xs px-3 py-1.5 rounded-md"
          style={{ background: C.card, color: C.textSub, border: `1px solid ${C.border}` }}
          title="Lay the open cards out as a tree"
        >
          Auto-arrange
        </button>
      </div>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-xs px-3 py-1.5 rounded-md"
        style={{ background: C.card, color: C.textSub, border: `1px solid ${C.border}` }}
      >
        Close all
      </button>
    </div>
  );
}

const nodeTypes = { card: CardNode };

function CardNode({ data }: any) {
  const { model, parentName, node, graphId, commitHash, graphLanguage, edges, nodesById, onOpenChild, onFocusNode, onToggle, onRemove, active } = data as {
    model: CardModel;
    parentName?: string;
    node: CodeNode;
    graphId: string;
    commitHash: string;
    graphLanguage?: string;
    edges?: CodeEdge[];
    nodesById: Record<string, CodeNode>;
    onOpenChild: (id: string, call?: ResolvedCall) => void;
    onFocusNode: (id: string) => void;
    onToggle: () => void;
    onRemove: () => void;
    active: boolean;
  };

  const { data: codeData, isLoading } = useNodeCode(graphId, commitHash, node?.id ?? null);
  const code: string = (codeData as any)?.code ?? (codeData as any)?.rawCode ?? "";
  const [showSummary, setShowSummary] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const lines = useMemo<string[]>(() => (code ? code.split("\n") : []), [code]);
  const highlighted = useMemo(
    () => (code ? highlightToHtml(code, graphLanguage, node?.filePath) : ""),
    [code, graphLanguage, node?.filePath],
  );

  if (!node) return null;
  const summary = (node.technicalSummary || node.businessSummary || "").trim();
  const startLine = node.startLine ?? 1;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      data-card={model.cardId}
      style={{
        background: C.card,
        border: `1px solid ${active ? C.teal : C.border}`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        maxHeight: model.minimized ? 46 : 520,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* header */}
      <div className="px-3 py-2 flex items-center gap-2 shrink-0 cursor-grab"
        style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
          style={{ color: C.teal, background: `${C.teal}14` }}>
          {node.type.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-[12px] truncate" style={{ color: C.text }}>{node.name}</span>
        <span className="font-mono text-[10px] truncate" style={{ color: C.textDim }}>
          {node.filePath.split("/").slice(-2).join("/")}:{node.startLine}
        </span>
        {parentName && (
          <span className="text-[9.5px] truncate shrink-0" style={{ color: C.textDim }} title={`opened from ${parentName}`}>
            ← {parentName}
          </span>
        )}
        {model.minimized && (
          <span className="font-mono text-[10px] shrink-0" style={{ color: C.textDim }}>
            · {calls.length} calls
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 nodrag">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {}
            }}
            className="text-[10px] px-1.5 rounded"
            style={{ color: copied ? C.teal : C.textSub, border: `1px solid ${C.border}` }}
            title="Copy code"
          >
            {copied ? "✓" : "⧉"}
          </button>
          <button onClick={onToggle} className="text-[10px] px-1.5 rounded"
            style={{ color: C.textSub, border: `1px solid ${C.border}` }}>
            {model.minimized ? "▢" : "–"}
          </button>
          <button onClick={onRemove} className="text-[10px] px-1.5 rounded"
            style={{ color: C.red, border: `1px solid ${C.border}` }}>
            ✕
          </button>
        </div>
      </div>

      {!model.minimized && (
        <>
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
            <button onClick={() => setShowSummary((v) => !v)}
              className="text-[10px] uppercase tracking-[0.12em]"
              style={{ color: C.textDim }}>
              Summary {showSummary ? "▾" : "▸"}
            </button>
            {showSummary && (
              <p className="text-[11px] leading-relaxed mt-1" style={{ color: summary ? C.textSub : C.textDim }}>
                {summary || "No summary for this node. Re-analyze with summarization enabled."}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-auto nowheel code-scroller" style={{ scrollbarWidth: "thin" }}>
            {isLoading && <div className="px-3 py-4 text-[11px]" style={{ color: C.textDim }}>Loading…</div>}
            {!isLoading && lines.length === 0 && (
              <div className="px-3 py-4 text-[11px]" style={{ color: C.textDim }}>
                No source code for a {node.type.replace(/_/g, " ")} node.
              </div>
            )}
            {lines.length > 0 && (
              <div className="relative" style={{ height: lines.length * LINE_H }}>
                {children.map((child, i) => {
                  const top = ((child.startLine ?? startLine) - startLine) * LINE_H;
                  const height = (((child.endLine ?? 0) - (child.startLine ?? 0)) + 1) * LINE_H;
                  const color = RANGE_COLORS[i % RANGE_COLORS.length];
                  return (
                    <div key={child.id} style={{ position: "absolute", left: 40, right: 150, top, height, background: `${color}18`, borderLeft: `3px solid ${color}aa`, pointerEvents: "none" }} />
                  );
                })}

                <div className="absolute left-0 top-0 text-right select-none font-mono"
                  style={{ width: 40, color: C.textDim, fontSize: 10.5, lineHeight: `${LINE_H}px`, paddingRight: 6, borderRight: `1px solid ${C.border}` }}>
                  {lines.map((_, i) => <div key={i}>{startLine + i}</div>)}
                </div>

                <pre className="hljs absolute top-0 nodrag"
                  style={{ left: 40, right: 150, margin: 0, padding: "0 8px", background: "transparent", fontSize: 11.5, lineHeight: `${LINE_H}px`, fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' }}
                  dangerouslySetInnerHTML={{ __html: highlighted }} />

                {calls.map((c) => {
                  if (c.line == null) return null;
                  const top = (c.line - startLine) * LINE_H;
                  if (top < 0 || top > lines.length * LINE_H) return null;
                  const flags = [
                    c.awaited ? "await" : null,
                    c.defer ?? null,
                    c.conc ? "conc" : null,
                    c.repeat ? "loop" : null,
                    c.maybe ? "maybe" : null,
                  ].filter(Boolean) as string[];
                  return (
                    <button key={`${c.nodeId}-${c.line}`} data-chip-node={c.nodeId} onClick={() => onOpenChild(c.nodeId, c)}
                      className="absolute text-[9px] px-1.5 rounded font-mono text-left nodrag"
                      style={{ right: 4, top: top + 1, height: LINE_H - 2, width: 142, color: edgeColor(c), background: "#161b22", border: `1px solid ${edgeColor(c)}55`, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                      title={c.name}>
                      {c.name}{flags.length ? ` · ${flags.join(" · ")}` : ""} →
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-2.5 py-1.5 flex items-center gap-1 shrink-0"
            style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
            <span className="text-[9.5px] font-mono" style={{ color: C.textDim }}>{calls.length} calls</span>
            <button onClick={() => onFocusNode(node.id)} className="ml-auto text-[9.5px] px-1.5 rounded nodrag"
              style={{ color: C.teal, border: `1px solid ${C.teal}44` }}>
              show in graph
            </button>
          </div>
        </>
      )}
    </div>
  );
}