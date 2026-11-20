"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CodeEdge, CodeNode, ResolvedCall } from "@/lib/types";
import { useNodeCode } from "@/lib/hooks";
import { highlightToHtml } from "@/lib/syntax";
import { summaryToHtml } from "@/lib/sanitize";
import { CODE, UI } from "@/lib/theme";
import { NODE_COLORS } from "./cytoscapeConfig";
import {
  EDGE_INFO,
  EDGE_LABEL,
  EDGE_ORDER,
  EDGE_VERB,
  MARKER_TONES,
  markerList,
} from "./relations";
import { Badge, Hint } from "@/components/ui/Hint";
import { bfsReachable, blastRadius, buildAdjacency } from "@/lib/graphAlgo";
import {
  HiOutlineArrowLeft,
  HiOutlineBolt,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineCodeBracket,
  HiOutlineCubeTransparent,
  HiOutlineShieldExclamation,
  HiOutlineSparkles,
  HiOutlineXMark,
} from "@/components/icons";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  node: CodeNode;
  graphId: string;
  commitHash: string;
  graphLanguage?: string;
  nodesById: Record<string, CodeNode>;
  edges: CodeEdge[];
  onClose: () => void;
  onNodeFocus: (nodeId: string) => void;
  onOpenCode: (nodeId: string) => void;
  /** Opens the subgraph overlay in k-hop / blast-radius mode. */
  onExplore?: (mode: "khop" | "blast", depth: number) => void;
  /** How many overlays are stacked (0 = the canvas itself). */
  overlayDepth?: number;
  onOverlayBack?: () => void;
}

type Tab = "overview" | "flow" | "code";
type FlowDir = "callees" | "callers";

const WIDTH_KEY = "devlens:nodePanelWidth";
const MIN_W = 400;
const MAX_W = 760;

const clampWidth = (w: number) =>
  Math.max(MIN_W, Math.min(MAX_W, Math.min(w, (typeof window !== "undefined" ? window.innerWidth : 1400) - 96)));

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function NodePanel({
  node,
  graphId,
  commitHash,
  graphLanguage,
  nodesById,
  edges,
  onClose,
  onNodeFocus,
  onOpenCode,
  onExplore,
  overlayDepth = 0,
  onOverlayBack,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [flowDir, setFlowDir] = useState<FlowDir>("callees");
  const [flowQuery, setFlowQuery] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [hopDepth, setHopDepth] = useState(2);
  const [width, setWidth] = useState(460);

  // Restore the dragged width across node switches and reloads.
  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY) ?? "");
    if (Number.isFinite(saved) && saved > 0) setWidth(clampWidth(saved));
  }, []);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      let next = width;
      const move = (ev: MouseEvent) => {
        next = clampWidth(startW - (ev.clientX - startX));
        setWidth(next);
      };
      const up = () => {
        localStorage.setItem(WIDTH_KEY, String(next));
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.style.userSelect = "";
      };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    },
    [width],
  );

  // ── Derived data ──────────────────────────────────────────────────────────
  const calls = useMemo(
    () =>
      ((node.metadata?.resolvedCalls ?? []) as ResolvedCall[])
        .filter((c) => typeof c.firstOrder === "number")
        .sort((a, b) => (a.firstOrder ?? 0) - (b.firstOrder ?? 0)),
    [node],
  );

  const outgoing = useMemo(() => {
    const byType = new Map<string, CodeEdge[]>();
    for (const e of edges) {
      if (e.from !== node.id) continue;
      const arr = byType.get(e.type) ?? [];
      arr.push(e);
      byType.set(e.type, arr);
    }
    return byType;
  }, [edges, node.id]);

  const incoming = useMemo(() => {
    const byType = new Map<string, CodeEdge[]>();
    for (const e of edges) {
      if (e.to !== node.id) continue;
      const arr = byType.get(e.type) ?? [];
      arr.push(e);
      byType.set(e.type, arr);
    }
    return byType;
  }, [edges, node.id]);

  // Any incoming edge counts as a caller: the engine records USES for a
  // function that is handed around before being invoked, and a node with real
  // callers must never show an empty "Called by" list.
  const callers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const [type, list] of incoming) {
      for (const e of list) {
        if (!nodesById[e.from]) continue;
        if (!seen.has(e.from)) seen.set(e.from, type);
      }
    }
    return [...seen.entries()].map(([id, type]) => ({ node: nodesById[id], type }));
  }, [incoming, nodesById]);
  const callees = useMemo(() => dedupeNodes(outgoing.get("CALLS") ?? [], nodesById), [outgoing, nodesById]);

  // Relations that are not calls (renders, reads, implements…).
  const relations = useMemo(
    () =>
      [...outgoing.entries()]
        .filter(([type]) => type !== "CALLS")
        .map(([type, list]) => ({ type, nodes: dedupeNodes(list, nodesById) }))
        .filter((g) => g.nodes.length > 0)
        .sort((a, b) => EDGE_ORDER.indexOf(a.type as any) - EDGE_ORDER.indexOf(b.type as any)),
    [outgoing, nodesById],
  );

  const incomingRelations = useMemo(
    () =>
      [...incoming.entries()]
        .filter(([type]) => type !== "CALLS")
        .map(([type, list]) => ({ type, nodes: dedupeNodes(list, nodesById) }))
        .filter((g) => g.nodes.length > 0),
    [incoming, nodesById],
  );

  const parentsOf = useMemo(() => {
    const map = new Map<string, { id: string; type: string }[]>();
    for (const e of edges) {
      if (e.from === e.to) continue;
      const list = map.get(e.to) ?? [];
      if (!list.some((x) => x.id === e.from)) list.push({ id: e.from, type: e.type });
      map.set(e.to, list);
    }
    return map;
  }, [edges]);

  const { adj, radj } = useMemo(() => buildAdjacency(edges), [edges]);
  const hopCount = useMemo(() => bfsReachable(node.id, adj, hopDepth).size, [adj, node.id, hopDepth]);
  const blastCount = useMemo(() => blastRadius(node.id, radj, hopDepth).size, [radj, node.id, hopDepth]);

  const filteredCalls = useMemo(
    () =>
      flowQuery.trim()
        ? calls.filter((c) => c.name.toLowerCase().includes(flowQuery.trim().toLowerCase()))
        : calls,
    [calls, flowQuery],
  );

  const accent = NODE_COLORS[node.type] ?? UI.accent;
  const boundary = (node.metadata?.renderingBoundary as string) ?? null;
  const technical = (node.technicalSummary ?? "").trim();
  const business = (node.businessSummary ?? "").trim();
  const summary = business || technical;
  const hooks = Array.isArray(node.metadata?.hooks) ? (node.metadata!.hooks as string[]) : [];
  const file = node.filePath.split("/").slice(-2).join("/");
  const relationCount = relations.reduce((n, g) => n + g.nodes.length, 0);

  return (
    <div
      data-node-panel
      className="absolute top-0 right-0 h-full z-30 flex flex-col overflow-hidden"
      style={{
        width,
        background: UI.surface,
        borderLeft: `1px solid ${UI.border}`,
        boxShadow: "-16px 0 40px rgba(28,25,23,0.07)",
      }}
    >
      {/* Drag any point of the left edge to resize the panel. */}
      <div
        onMouseDown={startResize}
        data-resize="node-panel"
        title="Drag to resize"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 7,
          cursor: "col-resize",
          zIndex: 5,
        }}
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="shrink-0" style={{ padding: "16px 18px 0", borderBottom: `1px solid ${UI.borderSubtle}` }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          {overlayDepth > 0 && onOverlayBack && (
            <button
              onClick={onOverlayBack}
              title="Back to the previous node overlay"
              style={ghostBtn}
              className="hover:bg-[#f4f2ec]"
            >
              <HiOutlineArrowLeft size={13} />
              Back
            </button>
          )}

          <Hint label={`${node.type.replace(/_/g, " ")} — the kind of definition this node is`}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 9px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: UI.text,
                background: `${accent}2e`,
                border: `1px solid ${accent}66`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 99, background: accent }} />
              {node.type.replace(/_/g, " ")}
            </span>
          </Hint>

          {boundary && (
            <Hint label={`Rendering boundary: this ${boundary === "client" ? "runs in the browser" : "runs on the server"}`}>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: boundary === "client" ? "#0e7490" : UI.warning,
                  background: boundary === "client" ? "rgba(14,116,144,0.07)" : "rgba(180,83,9,0.07)",
                  border: `1px solid ${boundary === "client" ? "rgba(14,116,144,0.24)" : "rgba(180,83,9,0.24)"}`,
                }}
              >
                {boundary}
              </span>
            </Hint>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Hint label="Importance score 0–10, from fan-in, fan-out and how central this node is in the graph">
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "help" }}>
                <span
                  style={{
                    fontFamily: "'Fira Code', monospace",
                    fontSize: 16,
                    fontWeight: 700,
                    color: UI.text,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {(node.score ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: UI.textDim, fontWeight: 500 }}>impact</span>
              </span>
            </Hint>
            <button
              onClick={onClose}
              title="Close panel (Esc)"
              style={{
                width: 30,
                height: 30,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 7,
                border: `1px solid ${UI.border}`,
                background: UI.surface,
                color: UI.textSub,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = UI.text;
                e.currentTarget.style.borderColor = "#cfc8bb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = UI.textSub;
                e.currentTarget.style.borderColor = UI.border;
              }}
            >
              <HiOutlineXMark size={15} />
            </button>
          </div>
        </div>

        <h2
          style={{
            margin: 0,
            fontFamily: "'Fira Code', ui-monospace, monospace",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: UI.text,
            wordBreak: "break-word",
            lineHeight: 1.35,
          }}
        >
          {node.name}
        </h2>

        <button
          onClick={() => onOpenCode(node.id)}
          title={`Open ${node.filePath} in the code view`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            margin: "6px 0 0",
            padding: 0,
            background: "none",
            border: "none",
            fontFamily: "'Fira Code', monospace",
            fontSize: 12.5,
            color: UI.accent,
          }}
          className="hover:underline"
        >
          {file}:{node.startLine}-{node.endLine}
        </button>

        {/* Primary actions — both destinations for this node, always visible. */}
        <div className="flex items-center gap-2" style={{ margin: "14px 0 14px" }}>
          <button
            onClick={() => onOpenCode(node.id)}
            title="Open this node's source, its callees and callers as cards"
            style={primaryBtn}
          >
            <HiOutlineCodeBracket size={14} />
            Open code view
          </button>
          <button
            onClick={() => onNodeFocus(node.id)}
            title="Focus this node on the graph canvas"
            style={secondaryBtn}
          >
            <HiOutlineCubeTransparent size={14} />
            Show in graph
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex items-center"
          style={{ gap: 2, background: UI.elevated, borderRadius: 9, padding: 3, marginBottom: -1 }}
        >
          {(
            [
              ["overview", "Overview", null],
              ["flow", "Flow", calls.length > 0 ? String(calls.length) : null],
              ["code", "Code", null],
            ] as [Tab, string, string | null][]
          ).map(([id, label, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "6px 8px",
                  borderRadius: 7,
                  border: "none",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? UI.text : UI.textDim,
                  background: active ? UI.surface : "transparent",
                  boxShadow: active
                    ? `inset 0 -2px 0 ${UI.accent}, 0 1px 2px rgba(28,25,23,0.08)`
                    : "none",
                  transition: "background 120ms, color 120ms",
                }}
              >
                {label}
                {count && (
                  <span
                    style={{
                      fontFamily: "'Fira Code', monospace",
                      fontSize: 10.5,
                      padding: "0 5px",
                      borderRadius: 99,
                      background: active ? `${UI.accent}18` : "rgba(28,25,23,0.06)",
                      color: active ? UI.accent : UI.textDim,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "18px", scrollbarWidth: "thin" }}>
        {tab === "overview" && (
          <div className="flex flex-col" style={{ gap: 22 }}>
            {/* What it does */}
            <Section
              title="What it does"
              right={
                technical && business ? (
                  <span style={sectionMeta}>technical + business</span>
                ) : undefined
              }
            >
              {summary ? (
                <>
                  <div
                    className="summary-html"
                    style={{
                      color: UI.textSub,
                      maxHeight: summaryOpen ? undefined : 132,
                      overflow: "hidden",
                      position: "relative",
                    }}
                    dangerouslySetInnerHTML={{ __html: summaryToHtml(summary) }}
                  />
                  {summary.length > 340 && (
                    <button
                      onClick={() => setSummaryOpen((v) => !v)}
                      style={linkBtn}
                      className="hover:underline"
                    >
                      {summaryOpen ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              ) : (
                <Empty>
                  No summary stored for this node. Run “Re-analyze + Summarize” from the
                  toolbar to generate one; the pipeline, relations and metrics below are
                  built from the graph and are already complete.
                </Empty>
              )}
            </Section>

            {/* How it runs: narrative + the ordered pipeline */}
            {(calls.length > 0 || technical) && (
              <Section title="How it works">
                {technical && (
                  <div
                    className="summary-html"
                    style={{ color: UI.textSub, marginBottom: calls.length > 0 ? 14 : 0 }}
                    dangerouslySetInnerHTML={{ __html: summaryToHtml(technical) }}
                  />
                )}
                {calls.length > 0 && (
                  <>
                    <div style={{ ...tinyLabel, marginBottom: 8 }}>Execution pipeline</div>
                    <div className="flex flex-col">
                      {calls.slice(0, 7).map((call, i) => (
                        <PipeStep
                          key={`${call.nodeId}-${call.firstOrder}`}
                          call={call}
                          index={i + 1}
                          last={i === Math.min(calls.length, 7) - 1}
                          target={nodesById[call.nodeId]}
                          onFocus={onNodeFocus}
                          onOpen={onOpenCode}
                        />
                      ))}
                    </div>
                    {calls.length > 7 && (
                      <button onClick={() => setTab("flow")} style={{ ...linkBtn, marginTop: 8 }}>
                        Show all {calls.length} steps in the Flow tab →
                      </button>
                    )}
                  </>
                )}
              </Section>
            )}

            {/* Shape */}
            <Section title="Shape">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Stat label="Span" value={`${node.startLine}–${node.endLine}`} hint="Source line range this node occupies" />
                <Stat label="Callees" value={String(calls.length || callees.length)} hint="Nodes this one invokes" />
                <Stat label="Callers" value={String(callers.length)} hint="Nodes that invoke this one" />
                <Stat label="Relations" value={String(relationCount)} hint="Non-call edges — props, state, routes, implementations" />
              </div>
            </Section>

            {/* Blast radius / k-hop — the exploration controls */}
            {onExplore && (
              <Section title="Explore from here">
                <div
                  style={{
                    border: `1px solid ${UI.border}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: UI.bg,
                  }}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 12.5, color: UI.textSub }}>Hops</span>
                    <div className="flex items-center" style={{ gap: 4 }}>
                      {[1, 2, 3, 4].map((d) => (
                        <button
                          key={d}
                          onClick={() => setHopDepth(d)}
                          style={{
                            width: 26,
                            height: 24,
                            borderRadius: 6,
                            fontSize: 12,
                            fontFamily: "'Fira Code', monospace",
                            border: `1px solid ${hopDepth === d ? UI.accentBorder : UI.border}`,
                            background: hopDepth === d ? UI.accentSoft : UI.surface,
                            color: hopDepth === d ? UI.accent : UI.textDim,
                            fontWeight: hopDepth === d ? 600 : 400,
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <Hint label="How many edges away from this node the subgraph should reach.">
                      <span style={{ ...tinyLabel, cursor: "help" }}>depth</span>
                    </Hint>
                  </div>

                  <ExploreRow
                    title="Blast radius"
                    hint="Everything that depends on this node — reverse traversal. Change here and these are the surfaces at risk."
                    count={`${blastCount} node${blastCount === 1 ? "" : "s"}`}
                    onClick={() => onExplore("blast", hopDepth)}
                    tone={UI.danger}
                  />
                  <ExploreRow
                    title="K-hop neighbourhood"
                    hint="Everything this node reaches forward, up to the hop depth."
                    count={`${hopCount} node${hopCount === 1 ? "" : "s"}`}
                    onClick={() => onExplore("khop", hopDepth)}
                    tone={UI.accent}
                  />
                </div>
              </Section>
            )}

            {/* Who calls this node */}
            <Section
              title="Called by"
              right={<span style={sectionMeta}>{callers.length}</span>}
            >
              <Note>
                {callers.length > 0
                  ? "Every node that invokes this one. Open either destination from each row."
                  : "Nothing in this graph calls this node — it is an entry point, or its callers live outside the analysed code."}
              </Note>
              {callers.length > 0 && (
                <div className="flex flex-col" style={{ gap: 2 }}>
                  {callers.map((c) => (
                    <NodeRow
                      key={`caller-${c.node.id}`}
                      node={c.node}
                      meta={`${EDGE_VERB[c.type] ?? "links"} this`}
                      onFocus={() => onNodeFocus(c.node.id)}
                      onOpen={() => onOpenCode(c.node.id)}
                    />
                  ))}
                </div>
              )}
              {incomingRelations.length > 0 && (
                <div style={{ marginTop: callers.length > 0 ? 12 : 8 }}>
                  <div style={{ ...tinyLabel, marginBottom: 8 }}>Other incoming</div>
                  <div className="flex flex-wrap" style={{ gap: 6 }}>
                    {incomingRelations.map((g) =>
                      g.nodes.map((n) => (
                        <NodeChip
                          key={`in-${g.type}-${n.id}`}
                          node={n}
                          label={`${EDGE_VERB[g.type] ?? g.type.toLowerCase()}: ${n.name}`}
                          hint={EDGE_INFO[g.type] ?? EDGE_LABEL[g.type] ?? g.type}
                          onFocus={() => onNodeFocus(n.id)}
                          onOpen={() => onOpenCode(n.id)}
                        />
                      )),
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* What this node calls, in order */}
            <Section
              title="Calls"
              right={<span style={sectionMeta}>{calls.length || callees.length}</span>}
            >
              {calls.length > 0 ? (
                <>
                  <Note>Numbered in execution order — 1 is the first call the body makes.</Note>
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    {calls.slice(0, 12).map((call, i) => {
                      const target = nodesById[call.nodeId];
                      return (
                        <div
                          key={`ov-call-${call.nodeId}-${call.firstOrder}`}
                          className="flex items-center"
                          style={{ gap: 9, padding: "5px 6px", borderRadius: 7, background: "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = UI.elevated)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span style={indexBadge}>{i + 1}</span>
                          <button
                            onClick={() => onNodeFocus(call.nodeId)}
                            style={{
                              ...nameBtn,
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            className="hover:underline"
                            title={`Open ${call.name} in the graph`}
                          >
                            {call.name}
                          </button>
                          {markerList(call).slice(0, 2).map((m) => (
                            <Badge
                              key={m.label}
                              label={m.label}
                              hint={m.info}
                              text={MARKER_TONES[m.tone].text}
                              bg={MARKER_TONES[m.tone].bg}
                              border={MARKER_TONES[m.tone].border}
                            />
                          ))}
                          <span style={lineMeta}>{call.line != null ? `:${call.line}` : `#${call.firstOrder}`}</span>
                          <button
                            onClick={() => onOpenCode(call.nodeId)}
                            title={`Open ${call.name} in the code view`}
                            style={microBtn}
                            className="hover:bg-[#f4f2ec]"
                          >
                            <HiOutlineCodeBracket size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {calls.length > 12 && (
                    <button onClick={() => setTab("flow")} style={{ ...linkBtn, marginTop: 8 }}>
                      {calls.length - 12} more calls in the Flow tab →
                    </button>
                  )}
                </>
              ) : callees.length > 0 ? (
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {callees.map((n) => (
                    <NodeChip
                      key={`callee-${n.id}`}
                      node={n}
                      label={`calls ${n.name}`}
                      hint="Calls"
                      onFocus={() => onNodeFocus(n.id)}
                      onOpen={() => onOpenCode(n.id)}
                    />
                  ))}
                </div>
              ) : (
                <Empty>
                  This node does not call anything the engine could resolve. Leaves like this usually wrap
                  a platform API or only touch module-level constants.
                </Empty>
              )}
            </Section>

            {/* Non-call relations */}
            {relations.length > 0 && (
              <Section title="Relations" right={<span style={sectionMeta}>{relationCount}</span>}>
                <div className="flex flex-col" style={{ gap: 10 }}>
                  {relations.map((g) => (
                    <div key={g.type}>
                      <Hint label={EDGE_INFO[g.type] ?? g.type}>
                        <span style={{ ...tinyLabel, cursor: "help", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          {EDGE_LABEL[g.type] ?? g.type}
                          <span style={{ color: UI.textGhost }}>{g.nodes.length}</span>
                        </span>
                      </Hint>
                      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                        {g.nodes.map((n) => (
                          <NodeChip
                            key={`${g.type}-${n.id}`}
                            node={n}
                            label={`${EDGE_VERB[g.type] ?? g.type.toLowerCase()} ${n.name}`}
                            hint={EDGE_INFO[g.type] ?? g.type}
                            onFocus={() => onNodeFocus(n.id)}
                            onOpen={() => onOpenCode(n.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Security */}
            {node.security && node.security.severity !== "none" && (
              <Section title="Security">
                <div
                  style={{
                    border: `1px solid ${sevTone(node.security.severity).border}`,
                    background: sevTone(node.security.severity).bg,
                    borderRadius: 10,
                    padding: "11px 13px",
                  }}
                >
                  <div
                    className="flex items-center gap-2"
                    style={{ marginBottom: 6, color: sevTone(node.security.severity).text }}
                  >
                    <HiOutlineShieldExclamation size={14} />
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {node.security.severity} risk
                    </span>
                  </div>
                  <div
                    className="summary-html"
                    style={{ color: UI.textSub }}
                    dangerouslySetInnerHTML={{ __html: summaryToHtml(node.security.summary) }}
                  />
                </div>
              </Section>
            )}

            {/* Details */}
            <Section title="Details">
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 14px", alignItems: "baseline" }}>
                <Meta k="Type" v={node.type.replace(/_/g, " ").toLowerCase()} />
                <Meta k="File" v={node.filePath} mono />
                <Meta k="Language" v={graphLanguage ?? inferLang(node.filePath)} />
                {boundary && <Meta k="Rendering" v={boundary} />}
                {hooks.length > 0 && <Meta k="Hooks" v={hooks.join(", ")} mono />}
                {!!node.metadata?.hasState && <Meta k="State" v="holds local state" />}
                {node.summaryModel && <Meta k="Summarised by" v={node.summaryModel} />}
              </dl>
            </Section>
          </div>
        )}

        {tab === "flow" && (
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div className="flex items-center" style={{ gap: 6 }}>
              <SegBtn active={flowDir === "callees"} onClick={() => setFlowDir("callees")}>
                Downstream · {calls.length}
              </SegBtn>
              <SegBtn active={flowDir === "callers"} onClick={() => setFlowDir("callers")}>
                Upstream · {(parentsOf.get(node.id) ?? []).length}
              </SegBtn>
            </div>

            {flowDir === "callees" ? (
              <>
                <Note>
                  Every resolved call in the order the body makes it. <b>#n</b> is the raw call-site
                  position, which also counts builtins the engine did not resolve.
                </Note>

                {calls.length > 8 && (
                  <input
                    value={flowQuery}
                    onChange={(e) => setFlowQuery(e.target.value)}
                    placeholder="Filter callees…"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      background: UI.bg,
                      color: UI.text,
                      fontSize: 13,
                      outline: "none",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = UI.accentBorder)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = UI.border)}
                  />
                )}

                {calls.length === 0 && (
                  <Empty>
                    No ordering data for this node. Either the graph predates call-order analysis, or
                    nothing this node calls resolved to another node.
                  </Empty>
                )}

                <div className="flex flex-col">
                  {filteredCalls.map((call, i) => (
                    <FlowStep
                      key={`${call.nodeId}-${call.firstOrder}`}
                      call={call}
                      index={calls.indexOf(call) + 1}
                      last={i === filteredCalls.length - 1}
                      graphId={graphId}
                      commitHash={commitHash}
                      graphLanguage={graphLanguage}
                      target={nodesById[call.nodeId]}
                      onFocus={onNodeFocus}
                      onOpen={onOpenCode}
                    />
                  ))}
                </div>

                {relations.length > 0 && (
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${UI.borderSubtle}` }}>
                    <div style={{ ...tinyLabel, marginBottom: 6 }}>Not ordered</div>
                    <Note>
                      These edges carry no call ordinal — props, state, routing and implementations
                      rather than execution steps.
                    </Note>
                    <div className="flex flex-col" style={{ gap: 8 }}>
                      {relations.map((g) => (
                        <div key={`uo-${g.type}`} className="flex items-start" style={{ gap: 8 }}>
                          <Hint label={EDGE_INFO[g.type] ?? g.type}>
                            <span style={{ ...tinyLabel, width: 62, paddingTop: 5, cursor: "help" }}>
                              {EDGE_LABEL[g.type] ?? g.type}
                            </span>
                          </Hint>
                          <div className="flex flex-wrap" style={{ gap: 6 }}>
                            {g.nodes.map((n) => (
                              <NodeChip
                                key={`uo-${g.type}-${n.id}`}
                                node={n}
                                label={`${EDGE_VERB[g.type] ?? g.type.toLowerCase()} ${n.name}`}
                                hint={EDGE_INFO[g.type] ?? g.type}
                                onFocus={() => onNodeFocus(n.id)}
                                onOpen={() => onOpenCode(n.id)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Note>
                  Who reaches this node, walking backwards through incoming edges. Expand a row to keep
                  going up the call chain.
                </Note>
                <div style={{ border: `1px solid ${UI.border}`, borderRadius: 10, padding: "10px 8px", background: UI.bg }}>
                  <CallerBranch
                    id={node.id}
                    nodesById={nodesById}
                    parentsOf={parentsOf}
                    level={0}
                    visited={new Set([node.id])}
                    onFocus={onNodeFocus}
                    onOpen={onOpenCode}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {tab === "code" && (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <div
              style={{
                border: `1px solid ${UI.border}`,
                borderRadius: 10,
                padding: "14px 16px",
                background: UI.bg,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: UI.text, marginBottom: 6 }}>
                {file}
              </div>
              <div style={{ fontFamily: "'Fira Code', monospace", fontSize: 12.5, color: UI.textDim }}>
                lines {node.startLine}–{node.endLine} · {(graphLanguage ?? inferLang(node.filePath)) || "unknown language"}
              </div>
            </div>
            <button onClick={() => onOpenCode(node.id)} style={primaryBtnWide}>
              <HiOutlineCodeBracket size={15} />
              Open in code view
            </button>
            <button onClick={() => onNodeFocus(node.id)} style={secondaryBtnWide}>
              <HiOutlineCubeTransparent size={15} />
              Show in graph
            </button>
            <Note>
              The code view opens this node as a card with syntax highlighting. Its callees sit in the
              right gutter — click one to open it beside this card, and use <b>Called by</b> on the head
              card to walk back up. Drag cards to arrange them; <b>Auto-arrange</b> lays them out as a tree.
            </Note>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sections and atoms ───────────────────────────────────────────────────────

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center" style={{ marginBottom: 10, gap: 8 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: UI.textSub,
          }}
        >
          {title}
        </h3>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.6, color: UI.textDim }}>{children}</p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${UI.border}`,
        padding: "2px 0 2px 12px",
        fontSize: 13,
        lineHeight: 1.6,
        color: UI.textDim,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Hint label={hint}>
      <div
        style={{
          width: "100%",
          border: `1px solid ${UI.border}`,
          borderRadius: 9,
          padding: "9px 11px",
          background: UI.surface,
          cursor: "help",
        }}
      >
        <div style={{ fontSize: 11.5, color: UI.textDim, marginBottom: 3 }}>{label}</div>
        <div
          style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 17,
            fontWeight: 600,
            color: UI.text,
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
      </div>
    </Hint>
  );
}

function ExploreRow({
  title,
  hint,
  count,
  onClick,
  tone,
}: {
  title: string;
  hint: string;
  count: string;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 9px",
        marginTop: 6,
        borderRadius: 8,
        border: `1px solid ${UI.border}`,
        background: UI.surface,
        textAlign: "left",
        transition: "border-color 120ms, background 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${tone}55`;
        e.currentTarget.style.background = `${tone}08`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = UI.border;
        e.currentTarget.style.background = UI.surface;
      }}
    >
      <span style={{ color: tone, display: "inline-flex" }}>
        {tone === UI.danger ? <HiOutlineShieldExclamation size={14} /> : <HiOutlineBolt size={14} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: UI.text }}>{title}</span>
      <span style={{ fontFamily: "'Fira Code', monospace", fontSize: 11.5, color: UI.textDim }}>{count}</span>
      <span style={{ marginLeft: "auto", fontSize: 12, color: tone, fontWeight: 600 }}>Open →</span>
    </button>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt style={{ fontSize: 12, color: UI.textGhost, whiteSpace: "nowrap" }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: 12.5,
          color: UI.textSub,
          fontFamily: mono ? "'Fira Code', monospace" : undefined,
          wordBreak: "break-word",
        }}
      >
        {v}
      </dd>
    </>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "7px 10px",
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        color: active ? UI.text : UI.textDim,
        background: active ? UI.surface : "transparent",
        border: `1px solid ${active ? UI.border : "transparent"}`,
        boxShadow: active ? "0 1px 2px rgba(28,25,23,0.06)" : "none",
      }}
    >
      {children}
    </button>
  );
}

/** A node with both destinations on it: name → graph, icon → code view. */
function NodeChip({
  node,
  label,
  hint,
  onFocus,
  onOpen,
}: {
  node: CodeNode;
  label: string;
  hint: string;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const color = NODE_COLORS[node.type] ?? UI.textDim;
  return (
    <Hint label={`${hint} — click the name for the graph, the icon for the code view`}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "stretch",
          border: `1px solid ${UI.border}`,
          borderRadius: 7,
          overflow: "hidden",
          background: UI.surface,
          maxWidth: 260,
        }}
      >
        <button
          onClick={onFocus}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 7px",
            border: "none",
            background: "transparent",
            maxWidth: 210,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = UI.elevated)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ width: 6, height: 6, borderRadius: 99, background: color, flexShrink: 0 }} />
          <span
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: 11.5,
              color: UI.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.name}
          </span>
        </button>
        <button
          onClick={onOpen}
          title={`Open ${node.name} in the code view`}
          style={{
            border: "none",
            borderLeft: `1px solid ${UI.border}`,
            background: "transparent",
            padding: "0 5px",
            color: UI.textDim,
            display: "inline-flex",
            alignItems: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = UI.accentSoft;
            e.currentTarget.style.color = UI.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = UI.textDim;
          }}
        >
          <HiOutlineCodeBracket size={11} />
        </button>
      </span>
    </Hint>
  );
}

/** Full-width row for a related node: name, meta, both destinations. */
function NodeRow({
  node,
  meta,
  onFocus,
  onOpen,
}: {
  node: CodeNode;
  meta: string;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const color = NODE_COLORS[node.type] ?? UI.textDim;
  return (
    <div
      className="flex items-center"
      style={{ gap: 8, padding: "5px 6px", borderRadius: 7 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = UI.elevated)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: color, flexShrink: 0 }} />
      <button
        onClick={onFocus}
        style={{ ...nameBtn, flex: 1, minWidth: 0, textAlign: "left" }}
        className="hover:underline"
        title={`Open ${node.name} in the graph`}
      >
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </span>
      </button>
      <span style={{ fontSize: 11.5, color: UI.textGhost, flexShrink: 0 }}>{meta}</span>
      <MicroCodeBtn name={node.name} onClick={onOpen} />
    </div>
  );
}

function MicroCodeBtn({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Open ${name} in the code view`}
      style={microBtn}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = UI.accent;
        e.currentTarget.style.borderColor = UI.accentBorder;
        e.currentTarget.style.background = UI.accentSoft;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = UI.textSub;
        e.currentTarget.style.borderColor = "#d5cec1";
        e.currentTarget.style.background = UI.surface;
      }}
    >
      <HiOutlineCodeBracket size={13} />
    </button>
  );
}

/** Compact pipeline row: number, name, markers, next-step arrow. */
function PipeStep({
  call,
  index,
  last,
  target,
  onFocus,
  onOpen,
}: {
  call: ResolvedCall;
  index: number;
  last: boolean;
  target?: CodeNode;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const markers = markerList(call);
  return (
    <div style={{ position: "relative", paddingBottom: last ? 0 : 18 }}>
      {!last && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 11,
              top: 25,
              bottom: 6,
              width: 2,
              borderRadius: 2,
              background: "#d9d2c5",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 6,
              bottom: 2,
              color: "#a9a196",
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            ▼
          </span>
        </>
      )}
      <div className="flex items-center" style={{ gap: 8 }}>
        <span style={{ ...indexBadge, width: 23, height: 23, borderRadius: 99, zIndex: 1 }}>{index}</span>
        <button
          onClick={() => onFocus(call.nodeId)}
          style={{ ...nameBtn, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          className="hover:underline"
          title={target ? `${target.filePath}:${target.startLine}` : call.name}
        >
          {call.name}
        </button>
        {markers.map((m) => (
          <Badge
            key={m.label}
            label={m.label}
            hint={m.info}
            text={MARKER_TONES[m.tone].text}
            bg={MARKER_TONES[m.tone].bg}
            border={MARKER_TONES[m.tone].border}
          />
        ))}
        <MicroCodeBtn name={call.name} onClick={() => onOpen(call.nodeId)} />
      </div>
    </div>
  );
}

/** Expandable flow row: summary + wrapped code preview. */
function FlowStep({
  call,
  index,
  last,
  graphId,
  commitHash,
  graphLanguage,
  target,
  onFocus,
  onOpen,
}: {
  call: ResolvedCall;
  index: number;
  last: boolean;
  graphId: string;
  commitHash: string;
  graphLanguage?: string;
  target?: CodeNode;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useNodeCode(graphId, commitHash, open ? call.nodeId : null);

  const code: string = (data as any)?.code ?? (data as any)?.rawCode ?? "";
  const preview = useMemo(() => (code ? code.split("\n").slice(0, 16).join("\n") : ""), [code]);
  const highlighted = useMemo(
    () => (preview ? highlightToHtml(preview, graphLanguage, target?.filePath) : ""),
    [preview, graphLanguage, target?.filePath],
  );
  const summary = (target?.technicalSummary || target?.businessSummary || "").trim();
  const markers = markerList(call);

  return (
    <div
      style={{
        position: "relative",
        borderTop: index === 1 ? "none" : `1px solid ${UI.borderSubtle}`,
        background: open ? UI.bg : "transparent",
        borderRadius: open ? 9 : 0,
        paddingBottom: last ? 0 : 8,
      }}
    >
      <div className="flex items-center" style={{ gap: 9, padding: "8px 6px" }}>
        <span style={{ ...indexBadge }}>{index}</span>
        <button
          onClick={() => onFocus(call.nodeId)}
          style={{ ...nameBtn, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          className="hover:underline"
          title={`Open ${call.name} in the graph`}
        >
          {call.name}
        </button>
        {markers.map((m) => (
          <Badge
            key={m.label}
            label={m.label}
            hint={m.info}
            text={MARKER_TONES[m.tone].text}
            bg={MARKER_TONES[m.tone].bg}
            border={MARKER_TONES[m.tone].border}
          />
        ))}
        <span style={{ ...lineMeta, flexShrink: 0 }}>
          {call.firstOrder != null ? `#${call.firstOrder}` : ""}
          {call.line != null ? ` :${call.line}` : ""}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          title={open ? "Hide details" : "Show summary and code"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "0 7px",
            height: 26,
            borderRadius: 6,
            border: `1px solid #d5cec1`,
            background: open ? UI.elevated : UI.surface,
            color: UI.textSub,
            fontSize: 11.5,
            flexShrink: 0,
          }}
        >
          {open ? <HiOutlineChevronDown size={12} /> : <HiOutlineChevronRight size={12} />}
          details
        </button>
        <MicroCodeBtn name={call.name} onClick={() => onOpen(call.nodeId)} />
      </div>

      {/* Sequence cue: the next call runs after this one. */}
      {!last && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 15,
              top: 34,
              bottom: 4,
              width: 1,
              background: UI.border,
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 10,
              bottom: 2,
              color: UI.textGhost,
              fontSize: 9,
              lineHeight: 1,
            }}
          >
            ▼
          </span>
        </>
      )}

      {open && (
        <div style={{ padding: "0 8px 12px 43px" }}>
          {isLoading && <div style={{ fontSize: 12.5, color: UI.textDim }}>Loading…</div>}
          {!isLoading && summary && (
            <div
              className="summary-html"
              style={{ color: UI.textSub, marginBottom: 8 }}
              dangerouslySetInnerHTML={{ __html: summaryToHtml(summary) }}
            />
          )}
          {!isLoading && !summary && (
            <div style={{ fontSize: 12.5, color: UI.textDim, marginBottom: 8 }}>
              No summary for this node.
            </div>
          )}
          {preview && (
            <pre
              className="hljs code-wrap"
              style={{
                background: CODE.bg,
                border: `1px solid ${CODE.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                margin: 0,
                fontSize: 12,
                lineHeight: 1.72,
                letterSpacing: 0,
                maxHeight: 260,
                overflowY: "auto",
                color: CODE.text,
              }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          )}
          <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
            <button onClick={() => onOpen(call.nodeId)} style={chipPrimary}>
              Open in code view
            </button>
            <button onClick={() => onFocus(call.nodeId)} style={chipSecondary}>
              Show in graph
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One row of the upstream call tree. */
function CallerBranch({
  id,
  nodesById,
  parentsOf,
  level,
  visited,
  onFocus,
  onOpen,
}: {
  id: string;
  nodesById: Record<string, CodeNode>;
  parentsOf: Map<string, { id: string; type: string }[]>;
  level: number;
  visited: Set<string>;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(level < 2);
  const node = nodesById[id];
  const parents = (parentsOf.get(id) ?? []).filter((p) => !visited.has(p.id));
  const color = node ? NODE_COLORS[node.type] ?? UI.textDim : UI.textDim;

  if (!node) return null;

  return (
    <div style={{ marginLeft: level === 0 ? 0 : 14 }}>
      <div
        className="flex items-center"
        style={{
          gap: 6,
          padding: "4px 6px",
          borderRadius: 6,
          background: level === 0 ? `${UI.accent}0d` : "transparent",
          border: level === 0 ? `1px solid ${UI.accentBorder}` : "1px solid transparent",
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={parents.length === 0}
          style={{
            width: 18,
            height: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: parents.length === 0 ? "transparent" : UI.textGhost,
            flexShrink: 0,
          }}
        >
          {open ? <HiOutlineChevronDown size={12} /> : <HiOutlineChevronRight size={12} />}
        </button>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: color, flexShrink: 0 }} />
        <button
          onClick={() => onFocus(id)}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            border: "none",
            background: "transparent",
            fontFamily: "'Fira Code', monospace",
            fontSize: 12.5,
            color: UI.text,
            fontWeight: level === 0 ? 600 : 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          className="hover:underline"
          title={node.filePath}
        >
          {node.name}
        </button>
        <span style={{ fontSize: 11, color: UI.textGhost, flexShrink: 0 }}>
          {node.type.replace(/_/g, " ").toLowerCase()}
        </span>
        <MicroCodeBtn name={node.name} onClick={() => onOpen(id)} />
      </div>

      {open && parents.length > 0 && (
        <div style={{ borderLeft: `1px solid ${UI.borderSubtle}`, marginLeft: 8, paddingLeft: 2, marginTop: 2 }}>
          {parents.map((p) => (
            <div key={`${id}-${p.id}`}>
              <CallerBranch
                id={p.id}
                nodesById={nodesById}
                parentsOf={parentsOf}
                level={level + 1}
                visited={new Set([...visited, id])}
                onFocus={onFocus}
                onOpen={onOpen}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupeNodes(edges: CodeEdge[], nodesById: Record<string, CodeNode>): CodeNode[] {
  const seen = new Set<string>();
  const out: CodeNode[] = [];
  for (const e of edges) {
    if (seen.has(e.to)) continue;
    const n = nodesById[e.to];
    if (!n) continue;
    seen.add(e.to);
    out.push(n);
  }
  return out;
}

function inferLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
  };
  return map[ext] ?? ext;
}

function sevTone(sev: string) {
  if (sev === "high") return { text: UI.danger, bg: "rgba(185,28,28,0.06)", border: "rgba(185,28,28,0.22)" };
  if (sev === "medium") return { text: UI.warning, bg: "rgba(180,83,9,0.06)", border: "rgba(180,83,9,0.22)" };
  return { text: "#a16207", bg: "rgba(161,98,7,0.06)", border: "rgba(161,98,7,0.22)" };
}

// ─── Style atoms ──────────────────────────────────────────────────────────────

const sectionMeta: CSSProperties = {
  fontSize: 11.5,
  color: UI.textGhost,
  fontFamily: "'Fira Code', monospace",
};

const tinyLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: UI.textGhost,
};

const ghostBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 8px",
  borderRadius: 6,
  border: `1px solid ${UI.border}`,
  background: UI.surface,
  fontSize: 12,
  color: UI.textSub,
};

const iconBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  border: `1px solid transparent`,
  background: "transparent",
  color: UI.textDim,
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  flex: "1 1 0",
  minWidth: 0,
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${UI.accent}`,
  background: UI.accent,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 120ms",
};

const secondaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  flex: "1 1 0",
  minWidth: 0,
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: UI.surface,
  color: UI.textSub,
  fontSize: 13,
  fontWeight: 600,
  transition: "background 120ms, border-color 120ms",
};

const primaryBtnWide: CSSProperties = { ...primaryBtn, flex: "none", width: "100%", padding: "10px 12px" };
const secondaryBtnWide: CSSProperties = { ...secondaryBtn, flex: "none", width: "100%", padding: "10px 12px" };

const chipPrimary: CSSProperties = {
  padding: "4px 9px",
  borderRadius: 6,
  border: `1px solid ${UI.accentBorder}`,
  background: UI.accentSoft,
  color: UI.accent,
  fontSize: 12,
  fontWeight: 600,
};

const chipSecondary: CSSProperties = {
  padding: "4px 9px",
  borderRadius: 6,
  border: `1px solid ${UI.border}`,
  background: UI.surface,
  color: UI.textSub,
  fontSize: 12,
  fontWeight: 500,
};

const linkBtn: CSSProperties = {
  marginTop: 6,
  padding: 0,
  border: "none",
  background: "none",
  color: UI.accent,
  fontSize: 12.5,
  fontWeight: 500,
};

const indexBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 6,
  background: UI.elevated,
  border: `1px solid ${UI.border}`,
  fontFamily: "'Fira Code', monospace",
  fontSize: 11.5,
  fontWeight: 600,
  color: UI.textSub,
  flexShrink: 0,
};

const nameBtn: CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  fontFamily: "'Fira Code', monospace",
  fontSize: 12.5,
  color: UI.text,
  textAlign: "left",
};

const lineMeta: CSSProperties = {
  fontFamily: "'Fira Code', monospace",
  fontSize: 11.5,
  color: UI.textDim,
};

const microBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 26,
  borderRadius: 6,
  border: `1px solid #d5cec1`,
  background: UI.surface,
  color: UI.textSub,
  flexShrink: 0,
  transition: "color 120ms, border-color 120ms, background 120ms",
};