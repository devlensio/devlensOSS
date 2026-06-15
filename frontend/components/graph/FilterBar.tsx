"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeType, EdgeType, CommitSummary, RenderingBoundary } from "@/lib/types";
import {
  HiOutlineChevronDown,
  HiOutlineInformationCircle,
  HiOutlineGlobeAlt,
  HiOutlineCheck,
  HiOutlineArrowPath,
  HiOutlineAdjustmentsHorizontal,
} from "react-icons/hi2";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { EDGE_COLORS, EDGE_TYPES, NODE_COLORS, NODE_TYPES } from "./cytoscapeConfig";

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  COMPONENT:   "Component",
  HOOK:        "Hook",
  FUNCTION:    "Function",
  STATE_STORE: "Store",
  UTILITY:     "Utility",
  FILE:        "File",
  GHOST:       "Ghost",
  ROUTE:       "Route",
  TEST:        "Test",
  STORY:       "Storybook",
  THIRD_PARTY: "Library",
};

const EDGE_LABELS: Record<EdgeType, string> = {
  CALLS:      "Calls",
  IMPORTS:    "Imports",
  READS_FROM: "Reads From",
  WRITES_TO:  "Writes To",
  PROP_PASS:  "Prop Pass",
  EMITS:      "Emits",
  LISTENS:    "Listens",
  WRAPPED_BY: "Wrapped By",
  GUARDS:     "Guards",
  HANDLES:    "Handles",
  TESTS:      "Tests",
  USES:       "Uses",
};

const HOP_OPTIONS = [1, 2, 3, 4, 5, Infinity];

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface FilterBarProps {
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function FilterBar({
  activeNodeTypes, activeEdgeTypes, scoreThreshold,
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

  useEffect(() => { setDraftNodes([...activeNodeTypes]); }, [activeNodeTypes]);
  useEffect(() => { setDraftEdges([...activeEdgeTypes]); }, [activeEdgeTypes]);
  useEffect(() => { setDraftScore(scoreThreshold);       }, [scoreThreshold]);

  const isDirty =
    draftScore !== scoreThreshold ||
    draftNodes.length !== activeNodeTypes.length ||
    draftNodes.some(t => !activeNodeTypes.includes(t)) ||
    draftEdges.length !== activeEdgeTypes.length ||
    draftEdges.some(t => !activeEdgeTypes.includes(t));

  function toggleDraftNode(type: NodeType) {
    setDraftNodes(prev =>
      prev.includes(type)
        ? prev.length === 1 ? prev : prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  function toggleDraftEdge(type: EdgeType) {
    setDraftEdges(prev =>
      prev.includes(type)
        ? prev.length === 1 ? prev : prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">

      {/* ── Node type dropdown ────────────────────────────────── */}
      <MultiSelectDropdown
        label="Nodes"
        allTypes={NODE_TYPES}
        activeTypes={draftNodes}
        colors={NODE_COLORS}
        labels={NODE_TYPE_LABELS}
        onToggle={toggleDraftNode}
        onSetAll={setDraftNodes}
      />

      {/* ── Edge type dropdown ────────────────────────────────── */}
      <MultiSelectDropdown
        label="Edges"
        allTypes={EDGE_TYPES}
        activeTypes={draftEdges}
        colors={EDGE_COLORS}
        labels={EDGE_LABELS}
        onToggle={toggleDraftEdge}
        onSetAll={setDraftEdges}
      />

      {/* ── More filters (Score · Boundary · Entry Points) ────── */}
      <MoreFilters
        draftScore={draftScore}
        onScoreChange={setDraftScore}
        activeBoundaries={activeBoundaries}
        onBoundaryChange={onBoundaryChange}
        hasRoutes={hasRoutes}
        showRouteNodes={showRouteNodes}
        onRouteToggle={onRouteToggle}
        routeHopDepth={routeHopDepth}
        onHopDepthChange={onHopDepthChange}
      />

      {/* ── Apply ─────────────────────────────────────────────── */}
      {isDirty && (
        <button
          onClick={() => onApply(draftNodes, draftEdges, draftScore)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs
                     font-semibold transition-all shrink-0 animate-pulse"
          style={{
            background:  `${C.teal}20`,
            border:      `1px solid ${C.teal}50`,
            color:       C.teal,
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background    = `${C.teal}30`;
            el.style.borderColor   = C.teal;
            el.style.animationName = "none";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background    = `${C.teal}20`;
            el.style.borderColor   = `${C.teal}50`;
            el.style.animationName = "";
          }}
        >
          Apply
        </button>
      )}

      {/* ── Right side ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 ml-auto shrink-0">

        {commits.length > 1 && (
          <select
            value={activeCommit}
            onChange={e => onCommitChange(e.target.value)}
            className="text-xs font-mono rounded-lg px-2 py-1.5
                       focus:outline-none transition-colors max-w-40"
            style={{
              background:  C.elevated,
              border:      `1px solid ${C.borderSub}`,
              color:       C.textSub,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = C.teal)}
            onBlur={e  => (e.currentTarget.style.borderColor = C.borderSub)}
          >
            {commits.map(c => (
              <option key={c.commitHash} value={c.commitHash}
                      style={{ background: C.elevated }}>
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

// ─── MoreFilters ──────────────────────────────────────────────────────────────

function MoreFilters({
  draftScore, onScoreChange,
  activeBoundaries, onBoundaryChange,
  hasRoutes, showRouteNodes, onRouteToggle, routeHopDepth, onHopDepthChange,
}: {
  draftScore:       number;
  onScoreChange:    (v: number) => void;
  activeBoundaries: Array<RenderingBoundary | "unset">;
  onBoundaryChange: (v: Array<RenderingBoundary | "unset">) => void;
  hasRoutes:        boolean;
  showRouteNodes:   boolean;
  onRouteToggle:    () => void;
  routeHopDepth:    number;
  onHopDepthChange: (depth: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hasActive =
    draftScore > 0 ||
    activeBoundaries.length < 3 ||
    showRouteNodes;

  function toggleBoundary(value: RenderingBoundary | "unset") {
    if (activeBoundaries.includes(value)) {
      if (activeBoundaries.length === 1) return;
      onBoundaryChange(activeBoundaries.filter(v => v !== value));
    } else {
      onBoundaryChange([...activeBoundaries, value]);
    }
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: C.textDim,
    marginBottom: 8, letterSpacing: "0.02em",
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all"
        style={{
          background:  open ? C.surface   : C.elevated,
          borderColor: open ? C.teal+"60" : C.borderSub,
          color:       open ? C.text      : C.textSub,
        }}
        onMouseEnter={e => {
          if (open) return;
          const el = e.currentTarget as HTMLElement;
          el.style.color = C.text;
          el.style.borderColor = C.teal + "40";
        }}
        onMouseLeave={e => {
          if (open) return;
          const el = e.currentTarget as HTMLElement;
          el.style.color = C.textSub;
          el.style.borderColor = C.borderSub;
        }}
      >
        <HiOutlineAdjustmentsHorizontal size={12} />
        Filters
        {hasActive && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: C.teal }}
          />
        )}
        <HiOutlineChevronDown
          size={10}
          style={{
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            color:      C.textGhost,
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl z-50"
          style={{
            background: C.surface,
            border:     `1px solid ${C.border}`,
            width:      272,
            boxShadow:  "0 16px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Score */}
          <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${C.borderSub}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={sectionLabel}>Score</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: C.teal }}>
                {draftScore === 0 ? "all" : `≥ ${draftScore.toFixed(1)}`}
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="range"
                min={0} max={10} step={0.2}
                value={draftScore}
                onChange={e => onScoreChange(Number(e.target.value))}
                style={{ width: "100%", accentColor: C.teal, cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span style={{ fontSize: 9, fontFamily: "monospace", color: C.textGhost }}>0</span>
                <span style={{ fontSize: 9, fontFamily: "monospace", color: C.textGhost }}>10</span>
              </div>
            </div>
          </div>

          {/* Boundary */}
          <div style={{ padding: "12px 16px", borderBottom: hasRoutes ? `1px solid ${C.borderSub}` : undefined }}>
            <div style={sectionLabel}>Boundary</div>
            <div style={{ display: "flex", gap: 6 }}>
              {BOUNDARY_OPTIONS.map(({ value, label, color }) => {
                const on = activeBoundaries.includes(value);
                return (
                  <button
                    key={String(value)}
                    onClick={() => toggleBoundary(value)}
                    style={{
                      flex:         1,
                      padding:      "5px 0",
                      borderRadius: 7,
                      fontSize:     11,
                      fontWeight:   500,
                      cursor:       "pointer",
                      transition:   "all 0.15s",
                      background:   on ? `${color}18` : C.elevated,
                      color:        on ? color        : C.textGhost,
                      border:       `1px solid ${on ? `${color}45` : C.borderSub}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entry Points */}
          {hasRoutes && (
            <div style={{ padding: "12px 16px" }}>
              <div style={sectionLabel}>Entry Points</div>
              <EntryPointsContent
                active={showRouteNodes}
                onToggle={onRouteToggle}
                hopDepth={routeHopDepth}
                onHopDepthChange={onHopDepthChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── EntryPointsContent ───────────────────────────────────────────────────────

function EntryPointsContent({
  active, onToggle, hopDepth, onHopDepthChange,
}: {
  active:           boolean;
  onToggle:         () => void;
  hopDepth:         number;
  onHopDepthChange: (depth: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Toggle row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onToggle}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            padding:      "5px 10px",
            borderRadius: 7,
            fontSize:     11,
            fontWeight:   500,
            cursor:       "pointer",
            transition:   "all 0.15s",
            background:   active ? "#818cf818" : C.elevated,
            borderColor:  active ? "#818cf860" : C.borderSub,
            border:       `1px solid ${active ? "#818cf860" : C.borderSub}`,
            color:        active ? "#818cf8"   : C.textSub,
          }}
        >
          <HiOutlineGlobeAlt size={12} />
          {active ? "On" : "Off"}
        </button>
        <span style={{ fontSize: 11, color: C.textDim, lineHeight: 1.4 }}>
          Show route nodes and their connections
        </span>
      </div>

      {/* Hop depth row — only when active */}
      {active && (
        <div>
          <div style={{ fontSize: 10, color: C.textGhost, marginBottom: 6 }}>Hop depth</div>
          <div
            style={{
              display:      "flex",
              borderRadius: 7,
              overflow:     "hidden",
              border:       "1px solid #818cf830",
              background:   "#818cf808",
            }}
          >
            {HOP_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => onHopDepthChange(n)}
                style={{
                  flex:        1,
                  padding:     "5px 0",
                  fontSize:    11,
                  fontFamily:  "monospace",
                  fontWeight:  500,
                  cursor:      "pointer",
                  transition:  "all 0.15s",
                  background:  hopDepth === n ? "#818cf8"   : "transparent",
                  color:       hopDepth === n ? C.bg        : "#818cf870",
                  borderRight: n !== Infinity ? "1px solid #818cf820" : "none",
                }}
                onMouseEnter={e => {
                  if (hopDepth === n) return;
                  (e.currentTarget as HTMLElement).style.color = "#818cf8";
                }}
                onMouseLeave={e => {
                  if (hopDepth === n) return;
                  (e.currentTarget as HTMLElement).style.color = "#818cf870";
                }}
              >
                {n === Infinity ? "∞" : n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MultiSelectDropdown ──────────────────────────────────────────────────────

function MultiSelectDropdown<T extends string>({
  label, allTypes, activeTypes, colors, labels, onToggle, onSetAll,
}: {
  label:       string;
  allTypes:    T[];
  activeTypes: T[];
  colors:      Record<string, string>;
  labels:      Record<string, string>;
  onToggle:    (type: T) => void;
  onSetAll:    (types: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const allActive       = allTypes.every(t => activeTypes.includes(t));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle(type: T) {
    if (activeTypes.includes(type) && activeTypes.length === 1) return;
    onToggle(type);
  }

  function handleSelectAll() {
    if (allActive) onSetAll([allTypes[0]]);
    else onSetAll([...allTypes]);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
                   text-xs font-medium transition-all"
        style={{
          background:  open ? C.surface   : C.elevated,
          borderColor: open ? C.teal+"60" : C.borderSub,
          color:       open ? C.text      : C.textSub,
        }}
        onMouseEnter={e => {
          if (open) return;
          const el = e.currentTarget as HTMLElement;
          el.style.color = C.text;
          el.style.borderColor = C.teal + "40";
        }}
        onMouseLeave={e => {
          if (open) return;
          const el = e.currentTarget as HTMLElement;
          el.style.color = C.textSub;
          el.style.borderColor = C.borderSub;
        }}
      >
        <div className="flex items-center gap-0.5">
          {activeTypes.slice(0, 4).map(t => (
            <span
              key={t}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: colors[t] ?? C.textDim }}
            />
          ))}
          {activeTypes.length > 4 && (
            <span className="text-xs" style={{ color: C.textGhost }}>
              +{activeTypes.length - 4}
            </span>
          )}
        </div>
        <span>{label}</span>
        <span style={{ color: C.textGhost }}>
          {activeTypes.length}/{allTypes.length}
        </span>
        <HiOutlineChevronDown
          size={10}
          style={{
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            color:      C.textGhost,
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl
                     z-50 py-1 min-w-44"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <button
            onClick={handleSelectAll}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs
                       transition-colors text-left"
            style={{ color: allActive ? C.teal : C.textDim }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <span
              className="w-3.5 h-3.5 rounded border flex items-center
                         justify-center shrink-0"
              style={{
                background:  allActive ? C.teal : "transparent",
                borderColor: allActive ? C.teal : C.border,
              }}
            >
              {allActive && <HiOutlineCheck size={9} color={C.bg} />}
            </span>
            <span className="font-medium">
              {allActive ? "Deselect All" : "Select All"}
            </span>
          </button>

          <div className="my-1 mx-3" style={{ height: 1, background: C.borderSub }} />

          {allTypes.map(type => {
            const active = activeTypes.includes(type);
            const color  = colors[type] ?? C.textDim;
            const isLast = active && activeTypes.length === 1;

            return (
              <button
                key={type}
                onClick={() => handleToggle(type)}
                disabled={isLast}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs
                           transition-colors text-left
                           disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: active ? color : C.textDim }}
                onMouseEnter={e => {
                  if (isLast) return;
                  (e.currentTarget as HTMLElement).style.background = C.elevated;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <span
                  className="w-3.5 h-3.5 rounded border flex items-center
                             justify-center shrink-0 transition-all"
                  style={{
                    background:  active ? color : "transparent",
                    borderColor: active ? color : C.border,
                  }}
                >
                  {active && <HiOutlineCheck size={9} color={C.bg} />}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span className="font-medium">{labels[type] ?? type}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
