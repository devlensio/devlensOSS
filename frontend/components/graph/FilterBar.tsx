"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeType, EdgeType, CommitSummary } from "@/lib/types";
import {
  HiOutlineChevronDown,
  HiOutlineInformationCircle,
  HiOutlineGlobeAlt,
  HiOutlineCheck,
  HiOutlineArrowPath,
} from "react-icons/hi2";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_TYPE_COLORS: Record<NodeType, string> = {
  COMPONENT:   "#2dd4bf",
  HOOK:        "#c084fc",
  FUNCTION:    "#60a5fa",
  STATE_STORE: "#a53141",
  UTILITY:     "#94a3b8",
  FILE:        "#f472b6",
  GHOST:       "#6b7280",
  ROUTE:       "#818cf8",
  TEST:        "#f97316",
  STORY:       "#f472b6",
};

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
  STORY:       "Storybook"
};

const BASE_NODE_TYPES: NodeType[] = [
  "COMPONENT", "HOOK", "FUNCTION", "STATE_STORE", "UTILITY", "ROUTE", "FILE", "GHOST", "TEST", "STORY"
];

const EDGE_TYPES: EdgeType[] = [
  "CALLS", "PROP_PASS", "IMPORTS", "READS_FROM",
  "WRITES_TO", "EMITS", "LISTENS", "WRAPPED_BY", "GUARDS", "HANDLES", "TESTS"
];

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
  TESTS:      "Tests"
};

const EDGE_COLORS: Record<EdgeType, string> = {
  CALLS:      "#3b82f6",
  IMPORTS:    "#94a3b8",
  READS_FROM: "#f59e0b",
  WRITES_TO:  "#f85149",
  PROP_PASS:  "#2dd4bf",
  EMITS:      "#c084fc",
  LISTENS:    "#242ecd",
  WRAPPED_BY: "#3fb950",
  GUARDS:     "#d29922",
  HANDLES:    "#8286bb",
  TESTS:      "#f97316"
};

export const DEFAULT_NODE_TYPES: NodeType[] = [
  "COMPONENT", "HOOK", "FUNCTION", "STATE_STORE", "UTILITY",
];

export const DEFAULT_EDGE_TYPES: EdgeType[] = [
  "CALLS", "PROP_PASS", "READS_FROM", "WRITES_TO",
  "EMITS", "LISTENS", "WRAPPED_BY", "GUARDS"
];

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

// ─── Props ────────────────────────────────────────────────────────────────────
//
// FilterBar owns local draft state for nodes/edges/score.
// Parent state is only updated when the user clicks Apply.
// Entry Points and commit switcher still apply immediately.

interface FilterBarProps {
  // Committed values — drive visibleNodes in page.tsx
  activeNodeTypes: NodeType[];
  activeEdgeTypes: EdgeType[];
  scoreThreshold:  number;

  // Single apply callback — called when user commits changes
  onApply: (nodeTypes: NodeType[], edgeTypes: EdgeType[], score: number) => void;

  // Entry Points — applies immediately (triggers BFS)
  showRouteNodes:   boolean;
  onRouteToggle:    () => void;
  hasRoutes:        boolean;
  routeHopDepth:    number;
  onHopDepthChange: (depth: number) => void;

  // Commit switcher — applies immediately (navigation)
  commits:       CommitSummary[];
  activeCommit:  string;
  onCommitChange:(hash: string) => void;

  // Fullscreen
  isFullscreen:  boolean;
  onFullscreen:  () => void;

  // Reset — resets both local draft and committed state
  onReset: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FilterBar({
  activeNodeTypes, activeEdgeTypes, scoreThreshold,
  onApply,
  showRouteNodes, onRouteToggle, hasRoutes, routeHopDepth, onHopDepthChange,
  commits, activeCommit, onCommitChange,
  isFullscreen, onFullscreen,
  onReset,
}: FilterBarProps) {

  // ── Local draft state — toggling never triggers graph re-render ───────────
  const [draftNodes, setDraftNodes] = useState<NodeType[]>(activeNodeTypes);
  const [draftEdges, setDraftEdges] = useState<EdgeType[]>(activeEdgeTypes);
  const [draftScore, setDraftScore] = useState<number>(scoreThreshold);

  // Sync draft when parent resets
  useEffect(() => { setDraftNodes([...activeNodeTypes]); }, [activeNodeTypes]);
  useEffect(() => { setDraftEdges([...activeEdgeTypes]); }, [activeEdgeTypes]);
  useEffect(() => { setDraftScore(scoreThreshold);       }, [scoreThreshold]);

  // ── Dirty check ───────────────────────────────────────────────────────────
  const isDirty =
    draftScore !== scoreThreshold ||
    draftNodes.length !== activeNodeTypes.length ||
    draftNodes.some(t => !activeNodeTypes.includes(t)) ||
    draftEdges.length !== activeEdgeTypes.length ||
    draftEdges.some(t => !activeEdgeTypes.includes(t));

  function handleApply() {
    onApply(draftNodes, draftEdges, draftScore);
  }

  // ── Draft helpers ─────────────────────────────────────────────────────────

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

      {/* ── Node type dropdown ───────────────────────────────────── */}
      <MultiSelectDropdown
        label="Nodes"
        allTypes={BASE_NODE_TYPES}
        activeTypes={draftNodes}
        colors={NODE_TYPE_COLORS}
        labels={NODE_TYPE_LABELS}
        onToggle={toggleDraftNode}
        onSetAll={setDraftNodes}
      />

      {/* ── Edge type dropdown ───────────────────────────────────── */}
      <MultiSelectDropdown
        label="Edges"
        allTypes={EDGE_TYPES}
        activeTypes={draftEdges}
        colors={EDGE_COLORS}
        labels={EDGE_LABELS}
        onToggle={toggleDraftEdge}
        onSetAll={setDraftEdges}
      />

      {/* ── Score slider ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-2.5 py-1 rounded-lg border"
        style={{ background: C.elevated, borderColor: C.borderSub }}
      >
        <span className="text-xs whitespace-nowrap" style={{ color: C.textDim }}>
          Score ≥
        </span>
        <input
          type="range"
          min={0} max={10} step={0.2}
          value={draftScore}
          onChange={e => setDraftScore(Number(e.target.value))}
          className="w-32"
          style={{ accentColor: C.teal }}
        />
        <span className="text-xs font-mono w-5 text-right" style={{ color: C.teal }}>
          {draftScore === 0 ? "all" : draftScore.toFixed(1)}
        </span>
      </div>

      {/* ── Apply button — visible only when draft differs from committed ─ */}
      {isDirty && (
        <button
          onClick={handleApply}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs
                     font-semibold transition-all shrink-0 animate-pulse"
          style={{
            background:  `${C.teal}20`,
            border:      `1px solid ${C.teal}50`,
            color:       C.teal,
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background   = `${C.teal}30`;
            el.style.borderColor  = C.teal;
            el.style.animationName = "none"; // stop pulse on hover
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background   = `${C.teal}20`;
            el.style.borderColor  = `${C.teal}50`;
            el.style.animationName = "";
          }}
        >
          Apply
        </button>
      )}

      {/* ── Entry Points — applies immediately ──────────────────── */}
      {hasRoutes && (
        <EntryPointsToggle
          active={showRouteNodes}
          onToggle={onRouteToggle}
          hopDepth={routeHopDepth}
          onHopDepthChange={onHopDepthChange}
        />
      )}

      {/* ── Right side ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 ml-auto shrink-0">

        {/* Commit switcher — applies immediately */}
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

        {/* Fullscreen */}
        <button
          onClick={onFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="w-7 h-7 flex items-center justify-center rounded-lg
                     border transition-colors"
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

        {/* Reset */}
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

// ─── EntryPointsToggle ────────────────────────────────────────────────────────

function EntryPointsToggle({
  active, onToggle, hopDepth, onHopDepthChange,
}: {
  active:           boolean;
  onToggle:         () => void;
  hopDepth:         number;
  onHopDepthChange: (depth: number) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex items-center gap-1 shrink-0">

      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
                   text-xs font-medium transition-all"
        style={{
          background:  active ? "#818cf818" : C.elevated,
          borderColor: active ? "#818cf860" : C.borderSub,
          color:       active ? "#818cf8"   : C.textSub,
        }}
        onMouseEnter={e => {
          if (active) return;
          const el = e.currentTarget as HTMLElement;
          el.style.color = C.text;
          el.style.borderColor = "#818cf840";
        }}
        onMouseLeave={e => {
          if (active) return;
          const el = e.currentTarget as HTMLElement;
          el.style.color = C.textSub;
          el.style.borderColor = C.borderSub;
        }}
      >
        <HiOutlineGlobeAlt size={12} />
        Entry Points
      </button>

      <div className="relative" ref={tooltipRef}>
        <button
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
          className="flex items-center justify-center w-5 h-5 rounded transition-colors"
          style={{ color: C.textGhost }}
        >
          <HiOutlineInformationCircle size={13} />
        </button>

        {showTooltip && (
          <div
            className="absolute top-full left-1/2 mt-2 w-56 rounded-xl px-3
                       py-2.5 text-xs leading-relaxed z-50 pointer-events-none"
            style={{
              background: C.surface,
              border:     `1px solid ${C.border}`,
              color:      C.textSub,
              transform:  "translateX(-50%)",
              boxShadow:  "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <p className="font-semibold mb-1" style={{ color: C.text }}>
              HTTP Route Entry Points
            </p>
            Shows all route nodes (API endpoints, pages) and their connected
            nodes up to <strong style={{ color: "#818cf8" }}>N hops</strong> away —
            regardless of your node type filters.
          </div>
        )}
      </div>

      {active && (
        <div
          className="flex items-center rounded-lg border overflow-hidden"
          style={{ borderColor: "#818cf840", background: "#818cf810" }}
        >
          {HOP_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => onHopDepthChange(n)}
              className="px-2 py-1 text-xs font-mono font-medium transition-colors"
              style={{
                background:  hopDepth === n ? "#818cf8"  : "transparent",
                color:       hopDepth === n ? C.bg       : "#818cf880",
                borderRight: n !== Infinity ? `1px solid #818cf825` : "none",
              }}
              onMouseEnter={e => {
                if (hopDepth === n) return;
                (e.currentTarget as HTMLElement).style.color = "#818cf8";
              }}
              onMouseLeave={e => {
                if (hopDepth === n) return;
                (e.currentTarget as HTMLElement).style.color = "#818cf880";
              }}
            >
              {n === Infinity ? "∞" : n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}