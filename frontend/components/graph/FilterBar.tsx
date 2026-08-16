"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  NodeType,
  EdgeType,
  CommitSummary,
  RenderingBoundary,
  GraphResponse,
} from "@/lib/types";
import {
  HiOutlineChevronDown,
  HiOutlineCheck,
  HiOutlineArrowPath,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineGlobeAlt,
  HiOutlineCubeTransparent,
  HiOutlineCodeBracket,
} from "react-icons/hi2";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { EDGE_COLORS, EDGE_TYPES, NODE_COLORS, NODE_TYPES } from "./cytoscapeConfig";
import { TypeGlyph } from "./TypeGlyph";
import {
  NODE_TYPE_DEFS,
  EDGE_TYPE_DEFS,
  NODE_GROUPS,
  EDGE_GROUPS,
} from "./componentRegistry";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:        "#0d1117",
  surface:   "#161b22",
  elevated:  "#21262d",
  border:    "#30363d",
  borderSub: "#21262d",
  text:      "#e6edf3",
  textSub:   "#8b949e",
  textDim:   "#6e7681",
  textGhost: "#484f58",
  teal:      "#2dd4bf",
  indigo:    "#818cf8",
};

const BOUNDARY_OPTIONS: Array<{ value: RenderingBoundary | "unset"; label: string; color: string }> = [
  { value: "client", label: "Client", color: "#06b6d4" },
  { value: "server", label: "Server", color: "#f59e0b" },
  { value: "unset",  label: "Unset",  color: C.textDim },
];

const HOP_OPTIONS = [1, 2, 3, 4, 5, Infinity];

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: C.textSub,
  letterSpacing: "0.03em",
};

type TabId = "nodes" | "edges" | "langs";

// ─── Props ────────────────────────────────────────────────────────────────────

interface FilterBarProps {
  graph:            GraphResponse | undefined;
  activeNodeTypes:  NodeType[];
  activeEdgeTypes:  EdgeType[];
  scoreThreshold:   number;
  onApply:          (nodeTypes: NodeType[], edgeTypes: EdgeType[], score: number) => void;
  showRouteNodes:   boolean;
  onRouteToggle:    () => void;
  hasRoutes:        boolean;
  routeHopDepth:    number;
  onHopDepthChange: (depth: number) => void;
  commits:          CommitSummary[];
  activeCommit:     string;
  onCommitChange:   (hash: string) => void;
  isFullscreen:     boolean;
  onFullscreen:     () => void;
  activeBoundaries: Array<RenderingBoundary | "unset">;
  onBoundaryChange: (boundaries: Array<RenderingBoundary | "unset">) => void;
  onReset:          () => void;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function FilterBar({
  graph, activeNodeTypes, activeEdgeTypes, scoreThreshold,
  onApply,
  showRouteNodes, onRouteToggle, hasRoutes, routeHopDepth, onHopDepthChange,
  activeBoundaries, onBoundaryChange,
  commits, activeCommit, onCommitChange,
  isFullscreen, onFullscreen,
  onReset,
}: FilterBarProps) {

  const [draftNodes, setDraftNodes] = useState<NodeType[]>(activeNodeTypes);
  const [draftEdges, setDraftEdges] = useState<EdgeType[]>(activeEdgeTypes);
  const [draftScore, setDraftScore] = useState<number>(scoreThreshold);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraftNodes([...activeNodeTypes]); }, [activeNodeTypes]);
  useEffect(() => { setDraftEdges([...activeEdgeTypes]); }, [activeEdgeTypes]);
  useEffect(() => { setDraftScore(scoreThreshold);       }, [scoreThreshold]);

  // Close panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setPanelOpen(false);
    }
    if (panelOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  const isDirty =
    draftScore !== scoreThreshold ||
    draftNodes.length !== activeNodeTypes.length ||
    draftNodes.some(t => !activeNodeTypes.includes(t)) ||
    draftEdges.length !== activeEdgeTypes.length ||
    draftEdges.some(t => !activeEdgeTypes.includes(t));

  const nodeCount = NODE_TYPES.length;
  const activeNodeCount = draftNodes.length;
  const edgeCount = EDGE_TYPES.length;
  const activeEdgeCount = draftEdges.length;

  function handleApply() {
    onApply(draftNodes, draftEdges, draftScore);
    setPanelOpen(false);
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0" ref={panelRef}>

      {/* ── Control Center trigger ─────────────────────────────────── */}
      <div className="relative shrink-0">
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg border
                     text-xs font-semibold transition-all"
          style={{
            background:  panelOpen ? C.surface   : C.elevated,
            borderColor: panelOpen ? C.teal+"60" : C.borderSub,
            color:       panelOpen ? C.text      : C.textSub,
          }}
          onMouseEnter={e => {
            if (panelOpen) return;
            const el = e.currentTarget as HTMLElement;
            el.style.color = C.text;
            el.style.borderColor = C.teal + "40";
          }}
          onMouseLeave={e => {
            if (panelOpen) return;
            const el = e.currentTarget as HTMLElement;
            el.style.color = C.textSub;
            el.style.borderColor = C.borderSub;
          }}
        >
          <HiOutlineAdjustmentsHorizontal size={13} />
          <span>Filters</span>
          <span className="flex items-center gap-1 font-mono">
            <span style={{ color: C.teal }}>{activeNodeCount}</span>
            <span style={{ color: C.textGhost }}>/</span>
            <span style={{ color: C.textGhost }}>{nodeCount}</span>
          </span>
          <HiOutlineChevronDown
            size={10}
            style={{
              transform: panelOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 150ms",
              color: C.textGhost,
            }}
          />
        </button>

        {panelOpen && (
          <ControlCenterPanel
            graph={graph}
            draftNodes={draftNodes}
            setDraftNodes={setDraftNodes}
            draftEdges={draftEdges}
            setDraftEdges={setDraftEdges}
            draftScore={draftScore}
            onScoreChange={setDraftScore}
            activeBoundaries={activeBoundaries}
            onBoundaryChange={onBoundaryChange}
            hasRoutes={hasRoutes}
            showRouteNodes={showRouteNodes}
            onRouteToggle={onRouteToggle}
            routeHopDepth={routeHopDepth}
            onHopDepthChange={onHopDepthChange}
            onApply={handleApply}
            isDirty={isDirty}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {/* ── Active summary chips ───────────────────────────────────── */}
      <div className="hidden lg:flex items-center gap-1 min-w-0">
        {draftNodes.slice(0, 6).map(t => (
          <span
            key={t}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px]
                       font-mono shrink-0"
            style={{
              background: (NODE_COLORS[t] ?? C.textDim) + "18",
              color: NODE_COLORS[t] ?? C.textDim,
              border: `1px solid ${(NODE_COLORS[t] ?? C.textDim)}33`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: NODE_COLORS[t] ?? C.textDim }} />
            {t}
          </span>
        ))}
        {draftNodes.length > 6 && (
          <span className="text-[10px] font-mono shrink-0" style={{ color: C.textGhost }}>
            +{draftNodes.length - 6}
          </span>
        )}
      </div>

      {/* ── Right side ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {commits.length > 1 && (
          <select
            value={activeCommit}
            onChange={e => onCommitChange(e.target.value)}
            className="text-xs font-mono rounded-lg px-2 py-1.5
                       focus:outline-none transition-colors max-w-40"
            style={{ background: C.elevated, border: `1px solid ${C.borderSub}`, color: C.textSub }}
            onFocus={e => (e.currentTarget.style.borderColor = C.teal)}
            onBlur={e  => (e.currentTarget.style.borderColor = C.borderSub)}
          >
            {commits.map(c => (
              <option key={c.commitHash} value={c.commitHash} style={{ background: C.elevated }}>
                {c.commitHash.slice(0, 7)} · {c.branch} · {c.message?.slice(0, 22) || "No message"}
                {c.isSummarized ? " ✦" : ""}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={onFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="w-7 h-7 flex items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: C.borderSub, color: C.textDim, background: C.elevated }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = C.text;
            el.style.borderColor = C.teal + "60";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = C.textDim;
            el.style.borderColor = C.borderSub;
          }}
        >
          {isFullscreen ? <MdFullscreenExit size={16} /> : <MdFullscreen size={16} />}
        </button>

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
                     text-xs font-medium transition-all shrink-0"
          style={{ background: C.elevated, borderColor: C.borderSub, color: C.textDim }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = C.text;
            el.style.borderColor = C.teal + "50";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = C.textDim;
            el.style.borderColor = C.borderSub;
          }}
          title="Reset all filters to defaults"
        >
          <HiOutlineArrowPath size={11} />
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Group row types ──────────────────────────────────────────────────────────

interface NodeGroupView {
  id: string;
  label: string;
  defs: { type: NodeType; label: string; description: string; languages: string[] }[];
}

interface EdgeGroupView {
  id: string;
  label: string;
  defs: { type: EdgeType; label: string; description: string; languages: string[]; icon?: string }[];
}

// ─── Control Center Panel ─────────────────────────────────────────────────────

function ControlCenterPanel({
  graph, draftNodes, setDraftNodes, draftEdges, setDraftEdges,
  draftScore, onScoreChange, activeBoundaries, onBoundaryChange,
  hasRoutes, showRouteNodes, onRouteToggle, routeHopDepth, onHopDepthChange,
  onApply, isDirty, onClose,
}: {
  graph: GraphResponse | undefined;
  draftNodes: NodeType[];
  setDraftNodes: (t: NodeType[]) => void;
  draftEdges: EdgeType[];
  setDraftEdges: (t: EdgeType[]) => void;
  draftScore: number;
  onScoreChange: (v: number) => void;
  activeBoundaries: Array<RenderingBoundary | "unset">;
  onBoundaryChange: (v: Array<RenderingBoundary | "unset">) => void;
  hasRoutes: boolean;
  showRouteNodes: boolean;
  onRouteToggle: () => void;
  routeHopDepth: number;
  onHopDepthChange: (d: number) => void;
  onApply: () => void;
  isDirty: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>("nodes");
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);

  // Live counts from the actual graph (0 count → dimmed, hidden unless showEmpty)
  const nodeCounts = useMemo(() => {
    const m = new Map<NodeType, number>();
    if (!graph) return m;
    for (const n of graph.nodes) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return m;
  }, [graph]);

  const edgeCounts = useMemo(() => {
    const m = new Map<EdgeType, number>();
    if (!graph) return m;
    for (const e of graph.edges) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [graph]);

  const q = query.trim().toLowerCase();

  // Filtered node defs (respect search + showEmpty)
  const visibleNodeGroups = useMemo(() => {
    return NODE_GROUPS
      .map(g => ({
        ...g,
        defs: NODE_TYPE_DEFS.filter(d => {
          if (d.group !== g.id) return false;
          if (q && !(d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q))) return false;
          if (!showEmpty && (nodeCounts.get(d.type) ?? 0) === 0) return false;
          return true;
        }),
      }))
      .filter(g => g.defs.length > 0);
  }, [q, showEmpty, nodeCounts]);

  // Filtered edge defs
  const visibleEdgeGroups = useMemo(() => {
    return EDGE_GROUPS
      .map(g => ({
        ...g,
        defs: EDGE_TYPE_DEFS.filter(d => {
          if (d.group !== g.id) return false;
          if (q && !(d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q))) return false;
          if (!showEmpty && (edgeCounts.get(d.type) ?? 0) === 0) return false;
          return true;
        }),
      }))
      .filter(g => g.defs.length > 0);
  }, [q, showEmpty, edgeCounts]);

  function toggleNode(t: NodeType) {
    const next = draftNodes.includes(t)
      ? (draftNodes.length === 1 ? draftNodes : draftNodes.filter(x => x !== t))
      : [...draftNodes, t];
    setDraftNodes(next);
  }

  function toggleEdge(t: EdgeType) {
    const next = draftEdges.includes(t)
      ? (draftEdges.length === 1 ? draftEdges : draftEdges.filter(x => x !== t))
      : [...draftEdges, t];
    setDraftEdges(next);
  }

  const allNodesOn = draftNodes.length === NODE_TYPES.length;
  const allEdgesOn = draftEdges.length === EDGE_TYPES.length;

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: C.textSub,
    letterSpacing: "0.03em",
  };

  return (
    <div
      className="absolute top-full left-0 mt-1.5 rounded-2xl shadow-2xl z-50
                 flex flex-col overflow-hidden"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        width: 580,
        maxHeight: "min(680px, calc(100vh - 120px))",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* Panel header */}
      <div className="shrink-0 px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {([
            { id: "nodes" as TabId, label: `Nodes`, icon: <HiOutlineCubeTransparent size={13} />, active: draftNodes.length, total: NODE_TYPES.length },
            { id: "edges" as TabId, label: `Edges`, icon: <HiOutlineCodeBracket size={13} />, active: draftEdges.length, total: EDGE_TYPES.length },
            { id: "langs" as TabId, label: `Languages`, icon: <HiOutlineGlobeAlt size={13} />, active: 0, total: 0 },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px]
                         font-semibold transition-colors"
              style={{
                background: tab === t.id ? `${C.teal}15` : "transparent",
                color: tab === t.id ? C.teal : C.textSub,
                border: `1px solid ${tab === t.id ? `${C.teal}40` : "transparent"}`,
              }}
            >
              {t.icon}
              {t.label}
              {t.total > 0 && (
                <span className="font-mono text-[11px]"
                      style={{ color: tab === t.id ? C.teal : C.textDim }}>
                  {t.active}/{t.total}
                </span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: C.textGhost }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.text)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textGhost)}
          >
            <HiOutlineXMark size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {tab === "nodes" && (
          <NodesTab
            visibleGroups={visibleNodeGroups}
            draftNodes={draftNodes}
            nodeCounts={nodeCounts}
            onToggle={toggleNode}
            allOn={allNodesOn}
            onAll={() => setDraftNodes(NODE_TYPES)}
            onNone={() => setDraftNodes([draftNodes[0]])}
            graphLanguage={(graph?.fingerprint?.language as string | undefined) ?? ""}
          />
        )}
        {tab === "edges" && (
          <EdgesTab
            visibleGroups={visibleEdgeGroups}
            draftEdges={draftEdges}
            edgeCounts={edgeCounts}
            onToggle={toggleEdge}
            allOn={allEdgesOn}
            onAll={() => setDraftEdges(EDGE_TYPES)}
            onNone={() => setDraftEdges([draftEdges[0]])}
            graphLanguage={(graph?.fingerprint?.language as string | undefined) ?? ""}
          />
        )}
        {tab === "langs" && (
          <LangsTab graph={graph} />
        )}

        {/* Search + show-empty (visible on nodes/edges tabs) */}
        {(tab === "nodes" || tab === "edges") && (
          <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.borderSub}` }}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <HiOutlineMagnifyingGlass size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: C.textGhost }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Search ${tab === "nodes" ? "node" : "edge"} types…`}
                  className="w-full text-xs py-1.5 pl-8 pr-7 rounded-lg outline-none transition-colors"
                  style={{ background: C.elevated, border: `1px solid ${C.borderSub}`, color: C.text }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.teal)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.borderSub)}
                />
                {query && (
                  <button onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: C.textGhost }}>
                    <HiOutlineXMark size={11} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowEmpty(v => !v)}
                className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md
                           transition-colors shrink-0"
                style={{
                  background: showEmpty ? `${C.teal}14` : "transparent",
                  border: `1px solid ${showEmpty ? `${C.teal}33` : C.borderSub}`,
                  color:      showEmpty ? C.teal : C.textSub,
                }}
              >
                {showEmpty ? "Showing empty" : "Hide empty"}
              </button>
            </div>
          </div>
        )}

        {/* Score + boundary + entry points (always available) */}
        <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.borderSub}` }}>
          <ScoreBoundaryRow
            draftScore={draftScore}
            onScoreChange={onScoreChange}
            activeBoundaries={activeBoundaries}
            onBoundaryChange={onBoundaryChange}
            hasRoutes={hasRoutes}
            showRouteNodes={showRouteNodes}
            onRouteToggle={onRouteToggle}
            routeHopDepth={routeHopDepth}
            onHopDepthChange={onHopDepthChange}
          />
        </div>
      </div>

      {/* Footer: status + apply (only shown when there are pending changes) */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between"
           style={{ borderTop: `1px solid ${C.borderSub}`, background: C.bg }}>
        <span className="text-[11px]" style={{ color: C.textGhost }}>
          {isDirty ? "Unapplied changes" : "All changes applied"}
        </span>
        {isDirty && (
          <button
            onClick={onApply}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px]
                       font-semibold transition-colors"
            style={{
              background: `${C.teal}20`,
              border: `1px solid ${C.teal}50`,
              color: C.teal,
              cursor: "pointer",
            }}
          >
            <HiOutlineCheck size={13} />
            Apply
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Nodes tab ────────────────────────────────────────────────────────────────

function NodesTab({
  visibleGroups, draftNodes, nodeCounts, onToggle, allOn, onAll, onNone,
  graphLanguage,
}: {
  visibleGroups: NodeGroupView[];
  draftNodes: NodeType[];
  nodeCounts: Map<NodeType, number>;
  onToggle: (t: NodeType) => void;
  allOn: boolean;
  onAll: () => void;
  onNone: () => void;
  graphLanguage: string;
}) {
  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <GroupQuickActions allOn={allOn} onAll={onAll} onNone={onNone} />
      </div>
      {visibleGroups.map(g => {
        const groupActive = g.defs.filter(d => draftNodes.includes(d.type)).length;
        return (
          <div key={g.id} className="py-2.5" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold" style={{ color: C.textSub }}>
                {g.label}
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-md"
                    style={{ background: C.elevated, color: C.textSub }}>
                {groupActive}/{g.defs.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {g.defs.map(d => {
                const active = draftNodes.includes(d.type);
                const count = nodeCounts.get(d.type) ?? 0;
                const color = NODE_COLORS[d.type] ?? C.textDim;
                // A type is "supported" by the current repo's language when its
                // languages list includes the detected language. When the
                // language is unknown we assume everything is supported.
                const supported =
                  !graphLanguage ||
                  d.languages.includes(graphLanguage) ||
                  d.languages.includes("*");
                return (
                  <button
                    key={d.type}
                    onClick={() => supported && onToggle(d.type)}
                    disabled={!supported}
                    title={
                      supported
                        ? d.description
                        : `${d.label} isn't produced by ${graphLanguage || "this language"}`
                    }
                    className={"flex items-center gap-1.5 px-2.5 py-2 rounded-md text-left "
                      + "transition-colors "
                      + (supported ? "cursor-pointer" : "cursor-not-allowed opacity-40")}
                    style={{
                      background:    active && supported ? `${color}12` : "transparent",
                      color:         active && supported ? C.text : C.textSub,
                    }}
                    onMouseEnter={e => {
                      if (active || !supported) return;
                      (e.currentTarget as HTMLElement).style.background = C.elevated;
                    }}
                    onMouseLeave={e => {
                      if (active || !supported) return;
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <TypeGlyph type={d.type} size={14} color={color} />
                    <span className="text-[13px] font-medium truncate">{d.label}</span>
                    {/* Language-specific indicator — show a tiny badge when this
                        type is only produced by a subset of languages. */}
                    {supported && d.languages.length > 0 && !d.languages.includes("*") && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded shrink-0"
                            style={{ background: C.elevated, color: C.textGhost }}
                            title={`Languages: ${d.languages.join(", ")}`}>
                        {d.languages.length <= 2
                          ? d.languages.map(l => l.slice(0, 2).toUpperCase()).join("/")
                          : `${d.languages.length} langs`}
                      </span>
                    )}
                    {count > 0 && (
                      <span className="ml-auto text-[11px] font-mono shrink-0"
                            style={{ color: active && supported ? color : C.textGhost }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Edges tab ────────────────────────────────────────────────────────────────

function EdgesTab({
  visibleGroups, draftEdges, edgeCounts, onToggle, allOn, onAll, onNone,
  graphLanguage,
}: {
  visibleGroups: EdgeGroupView[];
  draftEdges: EdgeType[];
  edgeCounts: Map<EdgeType, number>;
  onToggle: (t: EdgeType) => void;
  allOn: boolean;
  onAll: () => void;
  onNone: () => void;
  graphLanguage: string;
}) {
  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <GroupQuickActions allOn={allOn} onAll={onAll} onNone={onNone} />
      </div>
      {visibleGroups.map(g => {
        const groupActive = g.defs.filter(d => draftEdges.includes(d.type)).length;
        return (
          <div key={g.id} className="py-2.5" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold" style={{ color: C.textSub }}>
                {g.label}
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-md"
                    style={{ background: C.elevated, color: C.textSub }}>
                {groupActive}/{g.defs.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {g.defs.map(d => {
                const active = draftEdges.includes(d.type);
                const count = edgeCounts.get(d.type) ?? 0;
                const color = EDGE_COLORS[d.type] ?? C.textDim;
                const supported =
                  !graphLanguage ||
                  d.languages.includes(graphLanguage) ||
                  d.languages.includes("*");
                return (
                  <button
                    key={d.type}
                    onClick={() => supported && onToggle(d.type)}
                    disabled={!supported}
                    title={
                      supported
                        ? d.description
                        : `${d.label} isn't produced by ${graphLanguage || "this language"}`
                    }
                    className={"flex items-center gap-1.5 px-2.5 py-2 rounded-md text-left "
                      + "transition-colors "
                      + (supported ? "cursor-pointer" : "cursor-not-allowed opacity-40")}
                    style={{
                      background:    active && supported ? `${color}12` : "transparent",
                      color:         active && supported ? C.text : C.textSub,
                    }}
                    onMouseEnter={e => {
                      if (active || !supported) return;
                      (e.currentTarget as HTMLElement).style.background = C.elevated;
                    }}
                    onMouseLeave={e => {
                      if (active || !supported) return;
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="text-[13px]" style={{ color }}>{d.icon ?? "→"}</span>
                    <span className="text-[13px] font-medium truncate">{d.label}</span>
                    {supported && d.languages.length > 0 && !d.languages.includes("*") && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded shrink-0"
                            style={{ background: C.elevated, color: C.textGhost }}
                            title={`Languages: ${d.languages.join(", ")}`}>
                        {d.languages.length <= 2
                          ? d.languages.map(l => l.slice(0, 2).toUpperCase()).join("/")
                          : `${d.languages.length} langs`}
                      </span>
                    )}
                    {count > 0 && (
                      <span className="ml-auto text-[11px] font-mono shrink-0"
                            style={{ color: active && supported ? color : C.textGhost }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Languages tab ────────────────────────────────────────────────────────────

function LangsTab({ graph }: { graph: GraphResponse | undefined }) {
  const defs = useMemo(() => {
    const langs = ["TypeScript/JavaScript", "Python", "Java", "Go", "Rust"];
    return langs.map(l => {
      const lower = (graph?.fingerprint?.language as string) ?? "";
      const active = lower.toLowerCase().includes(l.toLowerCase().split("/")[0]);
      return { label: l, active };
    });
  }, [graph]);
  return (
    <div className="px-4 py-3">
      <p className="text-xs mb-3" style={{ color: C.textDim }}>
        Languages the engine can analyze. Each drives which node/edge types
        appear in the Nodes and Edges tabs above.
      </p>
      <div className="flex flex-col gap-1.5">
        {defs.map(d => (
          <div key={d.label}
               className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
               style={{
                 background: d.active ? `${C.teal}12` : C.elevated,
                 border: `1px solid ${d.active ? `${C.teal}35` : C.borderSub}`,
               }}>
            <HiOutlineCodeBracket size={14}
              style={{ color: d.active ? C.teal : C.textDim }} />
            <span className="text-xs font-medium" style={{ color: d.active ? C.teal : C.textSub }}>
              {d.label}
            </span>
            <span className="ml-auto text-[10px]" style={{ color: C.textGhost }}>
              {d.active ? "Detected" : "Available"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Group quick actions ──────────────────────────────────────────────────────

function GroupQuickActions({ allOn, onAll, onNone }: {
  allOn: boolean;
  onAll: () => void;
  onNone: () => void;
}) {
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.04em" };
  return (
    <div className="flex items-center gap-3">
      <button onClick={onAll} className="text-[12px] font-medium transition-colors"
              style={{ color: C.teal }} onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#5eead4")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.teal)}>
        Select All
      </button>
      <span style={{ color: C.border }}>·</span>
      <button onClick={onNone} className="text-[12px] font-medium transition-colors"
              style={{ color: C.textDim }} onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textSub)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textDim)}>
        None
      </button>
    </div>
  );
}

// ─── Score + Boundary + Entry rows ────────────────────────────────────────────

function ScoreBoundaryRow({
  draftScore, onScoreChange, activeBoundaries, onBoundaryChange,
  hasRoutes, showRouteNodes, onRouteToggle, routeHopDepth, onHopDepthChange,
}: {
  draftScore: number;
  onScoreChange: (v: number) => void;
  activeBoundaries: Array<RenderingBoundary | "unset">;
  onBoundaryChange: (v: Array<RenderingBoundary | "unset">) => void;
  hasRoutes: boolean;
  showRouteNodes: boolean;
  onRouteToggle: () => void;
  routeHopDepth: number;
  onHopDepthChange: (d: number) => void;
}) {
  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: C.textSub, letterSpacing: "0.03em",
  };

  function toggleBoundary(value: RenderingBoundary | "unset") {
    if (activeBoundaries.includes(value)) {
      if (activeBoundaries.length === 1) return;
      onBoundaryChange(activeBoundaries.filter(v => v !== value));
    } else {
      onBoundaryChange([...activeBoundaries, value]);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Score */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span style={sectionLabel}>Score</span>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: C.teal }}>
            {draftScore === 0 ? "all" : `≥ ${draftScore.toFixed(1)}`}
          </span>
        </div>
        <input type="range" min={0} max={10} step={0.2}
               value={draftScore} onChange={e => onScoreChange(Number(e.target.value))}
               style={{ width: "100%", accentColor: C.teal, cursor: "pointer" }} />
      </div>

      {/* Boundary */}
      <div>
        <div style={{ ...sectionLabel, marginBottom: 6 }}>Boundary</div>
        <div style={{ display: "flex", gap: 6 }}>
          {BOUNDARY_OPTIONS.map(({ value, label, color }) => {
            const on = activeBoundaries.includes(value);
            return (
              <button key={String(value)} onClick={() => toggleBoundary(value)}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 500,
                  cursor: "pointer", transition: "all 0.15s",
                  background: on ? `${color}18` : C.elevated,
                  color: on ? color : C.textGhost,
                  border: `1px solid ${on ? `${color}45` : C.borderSub}`,
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entry points */}
      {hasRoutes && (
        <div>
          <div style={{ ...sectionLabel, marginBottom: 6 }}>Entry Points</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onRouteToggle}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                background: showRouteNodes ? "#818cf818" : C.elevated,
                border: `1px solid ${showRouteNodes ? "#818cf860" : C.borderSub}`,
                color: showRouteNodes ? "#818cf8" : C.textSub,
              }}>
              <HiOutlineGlobeAlt size={12} />
              {showRouteNodes ? "On" : "Off"}
            </button>
            <span style={{ fontSize: 11, color: C.textDim, lineHeight: 1.4 }}>
              Show routes and their connections
            </span>
          </div>
          {showRouteNodes && (
            <div className="mt-2">
              <div style={{ fontSize: 10, color: C.textGhost, marginBottom: 6 }}>Hop depth</div>
              <div style={{
                display: "flex", borderRadius: 7, overflow: "hidden",
                border: "1px solid #818cf830", background: "#818cf808",
              }}>
                {HOP_OPTIONS.map(n => (
                  <button key={n} onClick={() => onHopDepthChange(n)}
                    style={{
                      flex: 1, padding: "5px 0", fontSize: 11, fontFamily: "monospace",
                      fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                      background: routeHopDepth === n ? "#818cf8" : "transparent",
                      color: routeHopDepth === n ? C.bg : "#818cf870",
                      borderRight: n !== Infinity ? "1px solid #818cf820" : "none",
                    }}>
                    {n === Infinity ? "∞" : n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
