"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { CodeNode, GraphResponse, GraphMeta, NodeDiff, NodeType } from "@/lib/types";
import { useCommitDiff } from "@/lib/hooks";
import {
  HiOutlineInformationCircle,
  HiOutlineCircleStack,
  HiOutlineMagnifyingGlass,
  HiOutlineBolt,
  HiOutlineFolder,
  HiOutlineArrowsRightLeft,
  HiOutlineShieldExclamation,
  HiOutlineChevronRight,
  HiOutlineChevronDown,
  HiOutlineXMark,
} from "react-icons/hi2";
import { NODE_COLORS, NODE_TYPES } from "./cytoscapeConfig";

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
  rail:      "#090c10",
};


const TYPE_COLORS_FULL: Record<string, { bg: string; text: string; border: string }> = {
  COMPONENT:   { bg: "#2dd4bf18", text: "#2dd4bf", border: "#2dd4bf30" },
  HOOK:        { bg: "#c084fc18", text: "#c084fc", border: "#c084fc30" },
  FUNCTION:    { bg: "#60a5fa18", text: "#60a5fa", border: "#60a5fa30" },
  STATE_STORE: { bg: "#a5314118", text: "#a53141", border: "#a5314130" },
  UTILITY:     { bg: "#94a3b818", text: "#94a3b8", border: "#94a3b830" },
  FILE:        { bg: "#f472b618", text: "#f472b6", border: "#f472b630" },
  GHOST:       { bg: "#6b728018", text: "#6b7280", border: "#6b728030" },
  ROUTE:       { bg: "#818cf818", text: "#818cf8", border: "#818cf830" },
  TEST:        { bg: "#f9731618", text: "#f97316", border: "#f9731630" },
  STORY:       { bg: "#f472b618", text: "#f472b6", border: "#f472b630" },
};



const DIFF_COLORS = {
  added:        { text: "#3fb950", bg: "#3fb95015", border: "#3fb95030" },
  removed:      { text: "#f85149", bg: "#f8514915", border: "#f8514930" },
  codeChanged:  { text: "#f59e0b", bg: "#f59e0b15", border: "#f59e0b30" },
  scoreChanged: { text: "#d29922", bg: "#d2992215", border: "#d2992230" },
  moved:        { text: "#818cf8", bg: "#818cf815", border: "#818cf830" },
};

const SEV_COLORS_PANEL = {
  high:   { text: "#f85149", bg: "#f8514912", border: "#f8514930", label: "High"   },
  medium: { text: "#f0883e", bg: "#f0883e12", border: "#f0883e30", label: "Medium" },
  low:    { text: "#d29922", bg: "#d2992212", border: "#d2992230", label: "Low"    },
};

const SEV_ORDER = ["high", "medium", "low"] as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const RAIL_W    = 48;
const MIN_PANEL = 280;
const MAX_PANEL = 520;
const DEF_PANEL = 300;

type PanelId = "project" | "nodes" | "search" | "highlighted" | "files" | "diff" | "security";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  graph:          GraphResponse | undefined;
  meta:           GraphMeta    | undefined;
  graphId:        string;
  visibleNodes:   CodeNode[];
  highlightedIds: string[];
  onNodeFocus:    (nodeId: string) => void;
  onDiffActivate: (diff: NodeDiff, fromHash: string, toHash: string) => void;
  onDiffClear:    () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Sidebar({
  graph, meta, graphId,
  visibleNodes, highlightedIds,
  onNodeFocus, onDiffActivate, onDiffClear,
}: SidebarProps) {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [panelWidth,  setPanelWidth]  = useState(DEF_PANEL);
  const isDragging  = useRef(false);
  const dragStartX  = useRef(0);
  const dragStartW  = useRef(0);

  function togglePanel(id: PanelId) {
    setActivePanel(prev => prev === id ? null : id);
  }

  function onDragStart(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = panelWidth;
    const move = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setPanelWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL,
        dragStartW.current + (e.clientX - dragStartX.current)
      )));
    };
    const up = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // Security badge — count of high + medium nodes
  const securityBadge = useMemo(() => {
    if (!graph) return undefined;
    const count = graph.nodes.filter(
      n => n.security?.severity === "high" || n.security?.severity === "medium"
    ).length;
    return count > 0 ? count : undefined;
  }, [graph]);

  const ICONS: {
    id:     PanelId;
    icon:   React.ReactNode;
    title:  string;
    badge?: number;
  }[] = [
    { id: "project",     icon: <HiOutlineInformationCircle size={20} />, title: "Project Info"      },
    { id: "nodes",       icon: <HiOutlineCircleStack       size={20} />, title: "Visible Nodes"     },
    { id: "search",      icon: <HiOutlineMagnifyingGlass   size={20} />, title: "Search All Nodes"  },
    { id: "highlighted", icon: <HiOutlineBolt              size={20} />, title: "Highlighted Nodes",
      badge: highlightedIds.length > 0 ? highlightedIds.length : undefined },
    { id: "files",       icon: <HiOutlineFolder            size={20} />, title: "File Explorer"     },
    { id: "diff",        icon: <HiOutlineArrowsRightLeft   size={20} />, title: "Commit Diff"       },
    { id: "security",    icon: <HiOutlineShieldExclamation size={20} />, title: "Security Issues",
      badge: securityBadge },
  ];

  return (
    <div className="absolute top-0 left-0 h-full z-20 flex pointer-events-none">

      {/* ── Icon rail ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center py-3 gap-1 shrink-0 pointer-events-auto"
        style={{
          width:       RAIL_W,
          background:  C.rail,
          borderRight: `1px solid ${C.borderSub}`,
        }}
      >
        {ICONS.map(({ id, icon, title, badge }) => {
          const active = activePanel === id;
          return (
            <div key={id} className="relative">
              <button
                onClick={() => togglePanel(id)}
                title={title}
                className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                style={{
                  background:  active ? `${C.teal}15` : "transparent",
                  color:       active ? C.teal        : C.textGhost,
                  borderLeft:  active ? `2px solid ${C.teal}` : "2px solid transparent",
                }}
                onMouseEnter={e => {
                  if (active) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.color      = C.textSub;
                  el.style.background = C.elevated;
                }}
                onMouseLeave={e => {
                  if (active) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.color      = C.textGhost;
                  el.style.background = "transparent";
                }}
              >
                {icon}
              </button>

              {badge !== undefined && (
                <span
                  className="absolute -top-1 -right-1 text-xs font-bold rounded-full
                             w-4 h-4 flex items-center justify-center pointer-events-none"
                  style={{ background: C.teal, color: C.bg, fontSize: "9px" }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Panel ─────────────────────────────────────────────────── */}
      {activePanel && (
        <div className="flex pointer-events-auto" style={{ width: panelWidth }}>

          {/* Panel body */}
          <div
            className="flex-1 flex flex-col overflow-hidden"
            style={{
              background:     "rgba(13,17,23,0.95)",
              borderRight:    `1px solid ${C.borderSub}`,
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: `1px solid ${C.borderSub}` }}
            >
              <span className="text-sm font-semibold" style={{ color: C.text }}>
                {ICONS.find(i => i.id === activePanel)?.title}
              </span>
              <button
                onClick={() => setActivePanel(null)}
                className="p-1 rounded transition-colors"
                style={{ color: C.textGhost }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.text)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textGhost)}
              >
                <HiOutlineXMark size={14} />
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {activePanel === "project"  && (
                <ProjectPanel graph={graph} />
              )}
              {activePanel === "nodes"    && (
                <NodesPanel
                  nodes={visibleNodes}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                />
              )}
              {activePanel === "search"   && (
                <SearchPanel
                  nodes={graph?.nodes ?? []}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                />
              )}
              {activePanel === "highlighted" && (
                <HighlightedPanel
                  ids={highlightedIds}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                />
              )}
              {activePanel === "files"    && (
                <FilesPanel
                  nodes={graph?.nodes ?? []}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                />
              )}
              {activePanel === "diff"     && (
                <DiffPanel
                  meta={meta}
                  graphId={graphId}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                  onDiffActivate={onDiffActivate}
                  onDiffClear={onDiffClear}
                />
              )}
              {activePanel === "security" && (
                <SecurityPanel
                  nodes={graph?.nodes ?? []}
                  onNodeFocus={onNodeFocus}
                />
              )}
            </div>
          </div>

          {/* Resize grip */}
          <div
            onMouseDown={onDragStart}
            className="w-1 h-full cursor-col-resize shrink-0 hover:bg-accent/30 transition-colors"
            style={{ background: C.borderSub }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Shared: SearchInput ──────────────────────────────────────────────────────

function SearchInput({ value, onChange, placeholder }: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <HiOutlineMagnifyingGlass
        size={12}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: C.textGhost }}
      />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs py-2 pl-8 pr-8 rounded-lg outline-none transition-colors"
        style={{
          background: C.elevated,
          border:     `1px solid ${C.borderSub}`,
          color:      C.text,
        }}
        onFocus={e => (e.currentTarget.style.borderColor = C.teal)}
        onBlur={e  => (e.currentTarget.style.borderColor = C.borderSub)}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2"
          style={{ color: C.textGhost }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.text)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textGhost)}
        >
          <HiOutlineXMark size={11} />
        </button>
      )}
    </div>
  );
}

// ─── Shared: TypeFilterChips ──────────────────────────────────────────────────

function TypeFilterChips({ active, onToggle }: {
  active:   string[];
  onToggle: (type: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {NODE_TYPES.map(type => {
        const on    = active.includes(type);
        const color = NODE_COLORS[type];
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border
                       text-xs transition-all"
            style={{
              background:  on ? `${color}18` : "transparent",
              borderColor: on ? `${color}40` : C.borderSub,
              color:       on ? color        : C.textGhost,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: on ? color : C.textGhost }}
            />
            {type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared: NodeRow ──────────────────────────────────────────────────────────

function NodeRow({ node, onFocus }: { node: CodeNode; onFocus: () => void }) {
  const color = NODE_COLORS[node.type] ?? C.textSub;
  return (
    <button
      onClick={onFocus}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 min-w-0">
        <span className="text-xs font-mono font-medium truncate block" style={{ color: C.text }}>
          {node.name}
        </span>
        <span className="text-xs truncate block" style={{ color: C.textGhost }}>
          {node.filePath.split("/").slice(-2).join("/")}
        </span>
      </span>
      <span className="text-xs font-mono shrink-0" style={{ color: C.textGhost }}>
        {(node.score ?? 0).toFixed(1)}
      </span>
    </button>
  );
}

// ─── Shared: Section ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-3"
         style={{ color: C.textGhost }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Shared: EmptyState ───────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
      <p className="text-sm font-medium mb-1" style={{ color: C.textDim }}>{message}</p>
      {sub && <p className="text-xs leading-relaxed" style={{ color: C.textGhost }}>{sub}</p>}
    </div>
  );
}

// ─── Panel: Project ───────────────────────────────────────────────────────────

function ProjectPanel({ graph }: { graph: GraphResponse | undefined }) {
  if (!graph) return <EmptyState message="No graph loaded" />;

  const fp = graph.fingerprint as any;

  const items = [
    { label: "Framework",  value: fp.framework   ?? "—" },
    { label: "Language",   value: fp.language    ?? "—" },
    { label: "Type",       value: fp.projectType ?? "—" },
    { label: "Router",     value: fp.router      ?? "—" },
  ];

  const stateLibs = (fp.stateManagement as string[] | undefined)?.join(", ") ?? "—";
  const databases = (fp.databases       as string[] | undefined)?.join(", ") ?? "—";
  const dataFetch = (fp.dataFetching    as string[] | undefined)?.join(", ") ?? "—";

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>

      {/* Fingerprint */}
      <Section title="Fingerprint">
        <div className="space-y-2">
          {items.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: C.textGhost }}>{label}</span>
              <span
                className="text-xs font-mono font-medium px-2 py-0.5 rounded-lg"
                style={{ background: C.elevated, color: C.teal }}
              >
                {value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: C.textGhost }}>State</span>
            <span className="text-xs font-mono" style={{ color: C.textSub }}>{stateLibs}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: C.textGhost }}>Databases</span>
            <span className="text-xs font-mono" style={{ color: C.textSub }}>{databases}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: C.textGhost }}>Data fetching</span>
            <span className="text-xs font-mono" style={{ color: C.textSub }}>{dataFetch}</span>
          </div>
        </div>
      </Section>

      {/* Stats */}
      <Section title="Graph Stats">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Total Nodes", value: graph.nodes.length  },
            { label: "Total Edges", value: graph.edges.length  },
            { label: "Commit",      value: graph.gitInfo.commitHash.slice(0, 7) },
            { label: "Branch",      value: graph.gitInfo.branch },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl"
              style={{ background: C.elevated, border: `1px solid ${C.borderSub}` }}
            >
              <span className="text-xs" style={{ color: C.textGhost }}>{label}</span>
              <span className="text-sm font-mono font-semibold" style={{ color: C.teal }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Node breakdown */}
      <Section title="Node Breakdown">
        <div className="space-y-1.5">
          {NODE_TYPES.map(type => {
            const count = graph.nodes.filter(n => n.type === type).length;
            if (count === 0) return null;
            const color = NODE_COLORS[type];
            const pct   = Math.round((count / graph.nodes.length) * 100);
            return (
              <div key={type} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs flex-1" style={{ color: C.textSub }}>
                  {type.replace(/_/g, " ")}
                </span>
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ width: 60, background: C.elevated }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="text-xs font-mono w-6 text-right" style={{ color: C.textGhost }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Last commit */}
      <Section title="Last Commit">
        <div
          className="px-3 py-2.5 rounded-xl text-xs font-mono"
          style={{ background: C.elevated, border: `1px solid ${C.borderSub}`, color: C.textSub }}
        >
          {graph.gitInfo.message || "No message"}
        </div>
      </Section>
    </div>
  );
}

// ─── Panel: Nodes (visible only) ─────────────────────────────────────────────

function NodesPanel({ nodes, nodesById, onNodeFocus }: {
  nodes:       CodeNode[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
}) {
  const [search,      setSearch]      = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([...NODE_TYPES]);

  function toggleType(type: string) {
    setTypeFilters(prev =>
      prev.includes(type)
        ? prev.length === 1 ? prev : prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  const filtered = nodes.filter(n => {
    if (!typeFilters.includes(n.type)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 space-y-2 shrink-0"
           style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or ID…" />
        <TypeFilterChips active={typeFilters} onToggle={toggleType} />
      </div>
      <div className="px-4 py-2 shrink-0">
        <span className="text-xs" style={{ color: C.textGhost }}>
          {filtered.length} of {nodes.length} visible nodes
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filtered.length === 0
          ? <EmptyState message="No nodes match filters" />
          : filtered
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map(n => (
                <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} />
              ))
        }
      </div>
    </div>
  );
}

// ─── Panel: Search (all nodes) ────────────────────────────────────────────────

function SearchPanel({ nodes, nodesById, onNodeFocus }: {
  nodes:       CodeNode[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
}) {
  const [search,      setSearch]      = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([...NODE_TYPES]);

  function toggleType(type: string) {
    setTypeFilters(prev =>
      prev.includes(type)
        ? prev.length === 1 ? prev : prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  const filtered = nodes.filter(n => {
    if (!typeFilters.includes(n.type)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.name.toLowerCase().includes(q)     ||
      n.id.toLowerCase().includes(q)       ||
      n.filePath.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 space-y-2 shrink-0"
           style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID, file path…" />
        <TypeFilterChips active={typeFilters} onToggle={toggleType} />
      </div>
      <div className="px-4 py-2 shrink-0">
        <span className="text-xs" style={{ color: C.textGhost }}>
          {search ? `${filtered.length} results` : `${nodes.length} total nodes`}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {!search
          ? <EmptyState message="Type to search all nodes" />
          : filtered.length === 0
            ? <EmptyState message="No results found" />
            : filtered
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map(n => (
                  <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} />
                ))
        }
      </div>
    </div>
  );
}

// ─── Panel: Highlighted ───────────────────────────────────────────────────────

function HighlightedPanel({ ids, nodesById, onNodeFocus }: {
  ids:         string[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const nodes = ids.map(id => nodesById[id]).filter(Boolean) as CodeNode[];

  const filtered = nodes.filter(n => {
    if (!search) return true;
    const q = search.toLowerCase();
    return n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
  });

  if (ids.length === 0) {
    return (
      <EmptyState
        message="No nodes highlighted"
        sub="Use K-Hops or Blast Radius in the node detail panel to highlight nodes"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 shrink-0"
           style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search highlighted…" />
      </div>
      <div className="px-4 py-2 shrink-0">
        <span className="text-xs" style={{ color: C.textGhost }}>
          {filtered.length} highlighted nodes
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filtered.length === 0
          ? <EmptyState message="No matches" />
          : filtered
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map(n => (
                <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} />
              ))
        }
      </div>
    </div>
  );
}

// ─── Panel: Files ─────────────────────────────────────────────────────────────

function FilesPanel({ nodes, nodesById, onNodeFocus }: {
  nodes:       CodeNode[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
}) {
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const childrenByFile = new Map<string, CodeNode[]>();
  for (const node of nodes) {
    if (node.type === "FILE") continue;
    const key = node.filePath;
    if (!childrenByFile.has(key)) childrenByFile.set(key, []);
    childrenByFile.get(key)!.push(node);
  }

  const allFilePaths = [...new Set(nodes.map(n => n.filePath))].sort();

  const filteredPaths = allFilePaths.filter(fp => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (fp.toLowerCase().includes(q)) return true;
    const children = childrenByFile.get(fp) ?? [];
    return children.some(n => n.name.toLowerCase().includes(q));
  });

  function toggleExpand(fp: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(fp)) next.delete(fp);
      else next.add(fp);
      return next;
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 shrink-0"
           style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search files or nodes…" />
      </div>
      <div className="px-4 py-2 shrink-0">
        <span className="text-xs" style={{ color: C.textGhost }}>
          {filteredPaths.length} files
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filteredPaths.map(fp => {
          const children = childrenByFile.get(fp) ?? [];
          const isOpen   = expanded.has(fp);
          const fileName = fp.split("/").pop() ?? fp;
          const dirPath  = fp.split("/").slice(0, -1).join("/");

          return (
            <div key={fp}>
              <button
                onClick={() => toggleExpand(fp)}
                className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors"
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                {isOpen
                  ? <HiOutlineChevronDown  size={11} color={C.textGhost} />
                  : <HiOutlineChevronRight size={11} color={C.textGhost} />
                }
                <HiOutlineFolder size={12} color="#f472b6" />
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-mono font-medium truncate block"
                        style={{ color: C.text }}>
                    {fileName}
                  </span>
                  {dirPath && (
                    <span className="text-xs truncate block" style={{ color: C.textGhost }}>
                      {dirPath}
                    </span>
                  )}
                </span>
                <span className="text-xs font-mono shrink-0" style={{ color: C.textGhost }}>
                  {children.length}
                </span>
              </button>

              {isOpen && children.length > 0 && (
                <div style={{ borderLeft: `1px solid ${C.borderSub}`, marginLeft: 28 }}>
                  {children
                    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                    .map(n => (
                      <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} />
                    ))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel: Diff ──────────────────────────────────────────────────────────────

function DiffPanel({ meta, graphId, nodesById, onNodeFocus, onDiffActivate, onDiffClear }: {
  meta:           GraphMeta | undefined;
  graphId:        string;
  nodesById:      Record<string, CodeNode>;
  onNodeFocus:    (id: string) => void;
  onDiffActivate: (diff: NodeDiff, fromHash: string, toHash: string) => void;
  onDiffClear:    () => void;
}) {
  const [fromHash,  setFromHash]  = useState("");
  const [toHash,    setToHash]    = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const commits = meta?.commits ?? [];

  useEffect(() => {
    if (commits.length >= 2 && !fromHash && !toHash) {
      setFromHash(commits[1].commitHash);
      setToHash(commits[0].commitHash);
    }
  }, [commits]);

  const { data: diff, isLoading, isError } = useCommitDiff(
    graphId,
    confirmed ? fromHash : "",
    confirmed ? toHash   : "",
  );

  // Activate diff on canvas when data arrives
  useEffect(() => {
    if (confirmed && diff) {
      onDiffActivate(diff, fromHash, toHash);
    }
  }, [confirmed, diff]);

  function handleReset() {
    setConfirmed(false);
    onDiffClear();
  }

  if (!meta || commits.length < 2) {
    return <EmptyState message="Need at least 2 commits to compare" />;
  }

  return (
    <div className="h-full flex flex-col">

      {/* Commit selectors */}
      <div className="px-4 py-3 space-y-2 shrink-0"
           style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <div className="space-y-1.5">
          <label className="text-xs" style={{ color: C.textGhost }}>From</label>
          <CommitSelect
            commits={commits}
            value={fromHash}
            onChange={v => { setFromHash(v); setConfirmed(false); onDiffClear(); }}
            exclude={toHash}
            disabled={confirmed}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs" style={{ color: C.textGhost }}>To</label>
          <CommitSelect
            commits={commits}
            value={toHash}
            onChange={v => { setToHash(v); setConfirmed(false); onDiffClear(); }}
            exclude={fromHash}
            disabled={confirmed}
          />
        </div>

        {/* Compare / Reset */}
        {!confirmed ? (
          <button
            onClick={() => setConfirmed(true)}
            disabled={!fromHash || !toHash || fromHash === toHash}
            className="w-full py-2 rounded-xl text-xs font-semibold
                       transition-all disabled:opacity-40"
            style={{
              background:  `${C.teal}20`,
              color:       C.teal,
              border:      `1px solid ${C.teal}40`,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement;
              if (!el.disabled) el.style.background = `${C.teal}30`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = `${C.teal}20`;
            }}
          >
            Compare Commits
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background:  C.elevated,
              color:       C.textSub,
              border:      `1px solid ${C.borderSub}`,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color       = C.text;
              el.style.borderColor = C.teal + "50";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color       = C.textSub;
              el.style.borderColor = C.borderSub;
            }}
          >
            ← Change Commits
          </button>
        )}

        {isError && (
          <p className="text-xs" style={{ color: "#f85149" }}>Failed to load diff</p>
        )}
      </div>

      {/* Loading */}
      {confirmed && isLoading && (
        <div className="flex items-center gap-2 justify-center py-8">
          <div
            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${C.teal} transparent transparent transparent` }}
          />
          <span className="text-xs" style={{ color: C.textDim }}>Comparing commits…</span>
        </div>
      )}

      {/* Results */}
      {confirmed && diff && (
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>

          {/* Summary */}
          <div className="flex items-center gap-2 px-4 py-2 flex-wrap"
               style={{ borderBottom: `1px solid ${C.borderSub}` }}>
            {[
              { label: "Added",   count: diff.added.length,        color: DIFF_COLORS.added.text        },
              { label: "Removed", count: diff.removed.length,      color: DIFF_COLORS.removed.text      },
              { label: "Code Changes", count: diff.codeChanged.length, color: DIFF_COLORS.codeChanged.text },
              { label: "Score Changed", count: diff.scoreChanged.length, color: DIFF_COLORS.scoreChanged.text },
              { label: "Moved",   count: diff.moved.length,        color: DIFF_COLORS.moved.text        },
            ].map(({ label, count, color }) =>
              count > 0 ? (
                <span
                  key={label}
                  className="text-xs px-2 py-0.5 rounded-lg border font-medium"
                  style={{ color, background: `${color}15`, borderColor: `${color}30` }}
                >
                  {count} {label}
                </span>
              ) : null
            )}
            <span className="text-xs ml-auto" style={{ color: C.textGhost }}>
              {diff.unchanged} unchanged
            </span>
          </div>

          {diff.added.length > 0 && (
            <DiffSection title="Added" color={DIFF_COLORS.added.text}>
              {diff.added.map(n => (
                <DiffRow key={n.nodeId} label={n.name} sub={n.filePath}
                  score={n.score} color={DIFF_COLORS.added.text}
                  onFocus={() => onNodeFocus(n.nodeId)} />
              ))}
            </DiffSection>
          )}

          {diff.removed.length > 0 && (
            <DiffSection title="Removed" color={DIFF_COLORS.removed.text}>
              {diff.removed.map(n => (
                <DiffRow key={n.nodeId} label={n.name} sub={n.filePath}
                  score={n.score} color={DIFF_COLORS.removed.text}
                  onFocus={() => onNodeFocus(n.nodeId)} />
              ))}
            </DiffSection>
          )}

          {diff.codeChanged.length > 0 && (
            <DiffSection title="Code Changes" color={DIFF_COLORS.codeChanged.text}>
              {diff.codeChanged.map(n => (
                <DiffRow key={n.nodeId} label={n.name}
                  sub={`${n.scoreBefore.toFixed(1)} → ${n.scoreAfter.toFixed(1)}`}
                  score={n.scoreAfter}
                  badge={n.scoreAfter > n.scoreBefore
                    ? `+${(n.scoreAfter - n.scoreBefore).toFixed(1)}`
                    : n.scoreAfter < n.scoreBefore
                      ? (n.scoreAfter - n.scoreBefore).toFixed(1)
                      : "~"
                  }
                  badgeColor={n.scoreAfter > n.scoreBefore
                    ? "#3fb950"
                    : n.scoreAfter < n.scoreBefore
                      ? "#f85149"
                      : "#f59e0b"
                  }
                  color={DIFF_COLORS.codeChanged.text}
                  onFocus={() => onNodeFocus(n.nodeId)} />
              ))}
            </DiffSection>
          )}

          {diff.scoreChanged.length > 0 && (
            <DiffSection title="Score Changed" color={DIFF_COLORS.scoreChanged.text}>
              {diff.scoreChanged.map(n => (
                <DiffRow key={n.nodeId} label={n.name}
                  sub={`${n.scoreBefore.toFixed(1)} → ${n.scoreAfter.toFixed(1)}`}
                  score={n.scoreAfter}
                  badge={n.delta > 0 ? `+${n.delta.toFixed(1)}` : n.delta.toFixed(1)}
                  badgeColor={n.delta > 0 ? "#3fb950" : "#f85149"}
                  color={DIFF_COLORS.scoreChanged.text}
                  onFocus={() => onNodeFocus(n.nodeId)} />
              ))}
            </DiffSection>
          )}

          {diff.moved.length > 0 && (
            <DiffSection title="Moved" color={DIFF_COLORS.moved.text}>
              {diff.moved.map(n => (
                <DiffRow key={n.nodeId} label={n.name}
                  sub={`${n.fromFile.split("/").pop()} → ${n.toFile.split("/").pop()}`}
                  color={DIFF_COLORS.moved.text}
                  onFocus={() => onNodeFocus(n.nodeId)} />
              ))}
            </DiffSection>
          )}

          {diff.added.length === 0 && diff.removed.length === 0 &&
           diff.scoreChanged.length === 0 && diff.moved.length === 0 && (
            <EmptyState message="No differences found" />
          )}
        </div>
      )}

      {!confirmed && !isLoading && (
        <EmptyState message="Select two commits and compare" />
      )}
    </div>
  );
}

// ─── Panel: Security ──────────────────────────────────────────────────────────

function SecurityPanel({ nodes, onNodeFocus }: {
  nodes:       CodeNode[];
  onNodeFocus: (id: string) => void;
}) {
  const [search,     setSearch]     = useState("");
  const [activeSevs, setActiveSevs] = useState<string[]>(["high", "medium", "low"]);

  function toggleSev(sev: string) {
    setActiveSevs(prev =>
      prev.includes(sev)
        ? prev.length === 1 ? prev : prev.filter(s => s !== sev)
        : [...prev, sev]
    );
  }

  const secNodes = nodes.filter(
    n => n.security?.severity && n.security.severity !== "none"
  );

  const filtered = secNodes.filter(n => {
    if (!activeSevs.includes(n.security!.severity)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.name.toLowerCase().includes(q)              ||
      n.filePath.toLowerCase().includes(q)          ||
      (n.security!.summary ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = SEV_ORDER.reduce<Record<string, CodeNode[]>>((acc, sev) => {
    acc[sev] = filtered.filter(n => n.security!.severity === sev);
    return acc;
  }, {} as any);

  if (secNodes.length === 0) {
    return (
      <EmptyState
        message="No security issues found"
        sub="Run summarization to enable security analysis"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">

      {/* Controls */}
      <div className="px-4 py-3 space-y-2 shrink-0"
           style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search issues…" />
        <div className="flex items-center gap-1.5">
          {SEV_ORDER.map(sev => {
            const sc     = SEV_COLORS_PANEL[sev];
            const active = activeSevs.includes(sev);
            const count  = secNodes.filter(n => n.security!.severity === sev).length;
            if (count === 0) return null;
            return (
              <button
                key={sev}
                onClick={() => toggleSev(sev)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border
                           text-xs font-medium transition-all"
                style={{
                  background:  active ? sc.bg     : "transparent",
                  borderColor: active ? sc.border : C.borderSub,
                  color:       active ? sc.text   : C.textGhost,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: active ? sc.text : C.textGhost }}
                />
                {sc.label}
                <span
                  className="px-1 rounded font-mono text-xs"
                  style={{
                    background: active ? `${sc.text}20` : C.elevated,
                    color:      active ? sc.text        : C.textGhost,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2 shrink-0 flex items-center gap-3">
        {SEV_ORDER.map(sev => {
          const count = secNodes.filter(n => n.security!.severity === sev).length;
          if (count === 0) return null;
          const sc = SEV_COLORS_PANEL[sev];
          return (
            <span key={sev} className="text-xs font-medium" style={{ color: sc.text }}>
              {count} {sc.label.toLowerCase()}
            </span>
          );
        })}
        <span className="text-xs ml-auto" style={{ color: C.textGhost }}>
          {filtered.length} shown
        </span>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filtered.length === 0 ? (
          <EmptyState message="No issues match filters" />
        ) : (
          SEV_ORDER.map(sev => {
            const group = grouped[sev];
            if (!group || group.length === 0) return null;
            const sc = SEV_COLORS_PANEL[sev];
            return (
              <div key={sev}>
                {/* Severity header */}
                <div
                  className="flex items-center gap-2 px-4 py-1.5 sticky top-0"
                  style={{
                    background:   C.surface,
                    borderBottom: `1px solid ${sc.border}`,
                  }}
                >
                  <HiOutlineShieldExclamation size={11} color={sc.text} />
                  <span className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: sc.text }}>
                    {sc.label} Risk
                  </span>
                  <span
                    className="ml-auto text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ background: sc.bg, color: sc.text }}
                  >
                    {group.length}
                  </span>
                </div>

                {group.map(n => (
                  <SecurityRow
                    key={n.id}
                    node={n}
                    color={sc.text}
                    bg={sc.bg}
                    border={sc.border}
                    onFocus={() => onNodeFocus(n.id)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SecurityRow({ node, color, bg, border, onFocus }: {
  node:    CodeNode;
  color:   string;
  bg:      string;
  border:  string;
  onFocus: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeC = TYPE_COLORS_FULL[node.type] ?? { text: C.textSub, bg: C.elevated };

  return (
    <div style={{ borderBottom: `1px solid ${C.borderSub}` }}>
      <div
        onClick={onFocus}
        className="w-full flex items-start gap-2.5 px-4 py-3 text-left transition-colors"
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      >
        <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-mono font-semibold truncate" style={{ color: C.text }}>
              {node.name}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded shrink-0"
              style={{ background: typeC.bg, color: typeC.text }}
            >
              {node.type}
            </span>
          </div>
          <p className="text-xs truncate mb-1" style={{ color: C.textGhost }}>
            {node.filePath.split("/").slice(-2).join("/")}
          </p>
          {node.security?.summary && (
            <div>
              <p className="text-xs leading-relaxed" style={{ color: C.textSub }}>
                {expanded || node.security.summary.length <= 100
                  ? node.security.summary
                  : `${node.security.summary.slice(0, 100).trimEnd()}…`
                }
              </p>
              {node.security.summary.length > 100 && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
                  className="text-xs mt-0.5 transition-colors"
                  style={{ color: C.textGhost }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = color)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textGhost)}
                >
                  {expanded ? "↑ Less" : "↓ More"}
                </button>
              )}
            </div>
          )}
        </div>
        <span className="text-xs font-mono shrink-0" style={{ color: C.textGhost }}>
          {(node.score ?? 0).toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ─── Diff sub-components ──────────────────────────────────────────────────────

function CommitSelect({ commits, value, onChange, exclude, disabled }: {
  commits:  { commitHash: string; branch: string; message?: string }[];
  value:    string;
  onChange: (v: string) => void;
  exclude:  string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full text-xs font-mono py-1.5 px-2 rounded-lg outline-none transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: C.elevated,
        border:     `1px solid ${C.borderSub}`,
        color:      C.textSub,
      }}
      onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = C.teal; }}
      onBlur={e  => (e.currentTarget.style.borderColor = C.borderSub)}
    >
      <option value="" style={{ background: C.elevated }}>Select commit…</option>
      {commits
        .filter(c => c.commitHash !== exclude)
        .map(c => (
          <option key={c.commitHash} value={c.commitHash} style={{ background: C.elevated }}>
            {c.commitHash.slice(0, 7)} · {c.branch} · {c.message?.slice(0, 20) || "—"}
          </option>
        ))
      }
    </select>
  );
}

function DiffSection({ title, color, children }: {
  title:    string;
  color:    string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: `1px solid ${C.borderSub}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors"
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      >
        {open
          ? <HiOutlineChevronDown  size={11} color={color} />
          : <HiOutlineChevronRight size={11} color={color} />
        }
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {title}
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function DiffRow({ label, sub, score, badge, badgeColor, color, onFocus }: {
  label:       string;
  sub?:        string;
  score?:      number;
  badge?:      string;
  badgeColor?: string;
  color:       string;
  onFocus:     () => void;
}) {
  return (
    <button
      onClick={onFocus}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 min-w-0">
        <span className="text-xs font-mono font-medium truncate block" style={{ color: C.text }}>
          {label}
        </span>
        {sub && (
          <span className="text-xs truncate block" style={{ color: C.textGhost }}>{sub}</span>
        )}
      </span>
      {badge && (
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded-lg shrink-0"
          style={{ background: `${badgeColor}20`, color: badgeColor }}
        >
          {badge}
        </span>
      )}
      {score !== undefined && (
        <span className="text-xs font-mono shrink-0" style={{ color: C.textGhost }}>
          {score.toFixed(1)}
        </span>
      )}
    </button>
  );
}