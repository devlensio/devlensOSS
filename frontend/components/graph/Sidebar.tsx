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
} from "@/components/icons";
import { NODE_COLORS, NODE_TYPES } from "./cytoscapeConfig";
import { UI } from "@/lib/theme";
import { HiOutlineCodeBracket } from "@/components/icons";
import { sanitizeSummary } from "@/lib/sanitize";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:        UI.bg,
  surface:   UI.surface,
  elevated:  UI.elevated,
  border:    UI.border,
  borderSub: UI.borderSubtle,
  text:      UI.text,
  textSub:   UI.textSub,
  textDim:   UI.textDim,
  textGhost: UI.textGhost,
  teal:      UI.accent,
  rail:      UI.elevated,
};


// Node type colour is carried by a dot, never by the text: twenty neon text
// colours on a white panel read as noise, and the label has to stay readable.
const typeTint = (type: string) => NODE_COLORS[type] ?? UI.textDim;
const TYPE_COLORS_FULL: Record<string, { bg: string; text: string; border: string }> =
  Object.fromEntries(
    Object.keys(NODE_COLORS).map((t) => [
      t,
      { bg: UI.elevated, text: UI.textSub, border: UI.border },
    ]),
  );

const DIFF_COLORS = {
  added:        { text: "#15803d", bg: "rgba(21,128,61,0.07)",  border: "rgba(21,128,61,0.22)" },
  removed:      { text: "#b91c1c", bg: "rgba(185,28,28,0.07)",  border: "rgba(185,28,28,0.22)" },
  codeChanged:  { text: "#b45309", bg: "rgba(180,83,9,0.07)",   border: "rgba(180,83,9,0.22)" },
  scoreChanged: { text: "#a16207", bg: "rgba(161,98,7,0.07)",   border: "rgba(161,98,7,0.22)" },
  moved:        { text: "#4f46e5", bg: "rgba(79,70,229,0.07)",  border: "rgba(79,70,229,0.22)" },
};

const SEV_COLORS_PANEL = {
  high:   { text: "#b91c1c", bg: "rgba(185,28,28,0.07)", border: "rgba(185,28,28,0.22)", label: "High"   },
  medium: { text: "#b45309", bg: "rgba(180,83,9,0.07)",  border: "rgba(180,83,9,0.22)",  label: "Medium" },
  low:    { text: "#a16207", bg: "rgba(161,98,7,0.07)",  border: "rgba(161,98,7,0.22)",  label: "Low"    },
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
  onOpenCode:     (nodeId: string) => void;
  onDiffActivate: (diff: NodeDiff, fromHash: string, toHash: string) => void;
  onDiffClear:    () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Sidebar({
  graph, meta, graphId,
  visibleNodes, highlightedIds,
  onNodeFocus, onOpenCode, onDiffActivate, onDiffClear,
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
                  className="absolute -top-1 -right-1 text-[13px] font-bold rounded-full
                             w-4 h-4 flex items-center justify-center pointer-events-none"
                  style={{ background: C.teal, color: "#ffffff", fontSize: "9.5px" }}
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
              background:  C.surface,
              borderRight: `1px solid ${C.border}`,
              boxShadow:   "8px 0 24px rgba(28,25,23,0.05)",
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: `1px solid ${C.borderSub}` }}
            >
              <span className="font-semibold" style={{ color: C.text, fontSize: 14.5 }}>
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
                <ProjectPanel graph={graph} meta={meta} graphId={graphId} />
              )}
              {activePanel === "nodes"    && (
                <NodesPanel
                  nodes={visibleNodes}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                  onOpenCode={onOpenCode}
                />
              )}
              {activePanel === "search"   && (
                <SearchPanel
                  nodes={graph?.nodes ?? []}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                  onOpenCode={onOpenCode}
                />
              )}
              {activePanel === "highlighted" && (
                <HighlightedPanel
                  ids={highlightedIds}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                  onOpenCode={onOpenCode}
                />
              )}
              {activePanel === "files"    && (
                <FilesPanel
                  nodes={graph?.nodes ?? []}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                  onOpenCode={onOpenCode}
                />
              )}
              {activePanel === "diff"     && (
                <DiffPanel
                  meta={meta}
                  graphId={graphId}
                  nodesById={graph?.nodesById ?? {}}
                  onNodeFocus={onNodeFocus}
                  onOpenCode={onOpenCode}
                  onDiffActivate={onDiffActivate}
                  onDiffClear={onDiffClear}
                />
              )}
              {activePanel === "security" && (
                <SecurityPanel
                  nodes={graph?.nodes ?? []}
                  onNodeFocus={onNodeFocus}
                  onOpenCode={onOpenCode}
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
        className="w-full py-2 pl-8 pr-8 rounded-lg outline-none transition-colors"
        style={{
          background: C.surface,
          border:     `1px solid ${C.border}`,
          color:      C.text,
          fontSize:   13,
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
            title={on ? `Hide ${type.replace(/_/g, " ").toLowerCase()} nodes` : `Show ${type.replace(/_/g, " ").toLowerCase()} nodes`}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all"
            style={{
              background:  on ? C.elevated : "transparent",
              borderColor: on ? C.border : "transparent",
              color:       on ? C.text : C.textGhost,
              fontWeight:  on ? 600 : 400,
              fontSize:    11.5,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: on ? color : "transparent",
                border: on ? "none" : `1px solid ${C.textGhost}`,
              }}
            />
            {type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared: NodeRow ──────────────────────────────────────────────────────────

function NodeRow({ node, onFocus, onOpenCode }: {
  node: CodeNode;
  onFocus: () => void;
  onOpenCode: () => void;
}) {
  const color = typeTint(node.type);
  return (
    <div
      className="group w-full flex items-center gap-2.5 px-4 py-2 transition-colors"
      style={{ borderBottom: `1px solid transparent` }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <button
        onClick={onFocus}
        className="flex-1 min-w-0 text-left"
        title={`Open ${node.name} in the graph`}
      >
        <span className="font-mono font-medium truncate block" style={{ color: C.text, fontSize: 13 }}>
          {node.name}
        </span>
        <span className="truncate block" style={{ color: C.textDim, fontSize: 11.5 }}>
          {node.filePath.split("/").slice(-2).join("/")}
        </span>
      </button>
      <span className="font-mono shrink-0 tabular-nums" style={{ color: C.textDim, fontSize: 11.5 }}>
        {(node.score ?? 0).toFixed(1)}
      </span>
      <button
        onClick={onOpenCode}
        title={`Open ${node.name} in the code view`}
        className="shrink-0 flex items-center justify-center rounded"
        style={{
          width: 24, height: 24,
          border: `1px solid ${C.border}`,
          background: C.surface,
          color: C.textDim,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = C.teal;
          e.currentTarget.style.borderColor = `${C.teal}55`;
          e.currentTarget.style.background = `${C.teal}0d`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = C.textDim;
          e.currentTarget.style.borderColor = C.border;
          e.currentTarget.style.background = C.surface;
        }}
      >
        <HiOutlineCodeBracket size={12} />
      </button>
    </div>
  );
}

// ─── Shared: Section ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
      <p className="font-semibold uppercase mb-3"
         style={{ color: C.textDim, fontSize: 11, letterSpacing: "0.08em" }}>
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
      <p className="font-medium mb-1" style={{ color: C.textSub, fontSize: 14 }}>{message}</p>
      {sub && <p className="leading-relaxed" style={{ color: C.textGhost, fontSize: 12.5 }}>{sub}</p>}
    </div>
  );
}

// ─── Panel: Project ───────────────────────────────────────────────────────────

function ProjectPanel({ graph, meta, graphId }: { graph: GraphResponse | undefined; meta: GraphMeta | undefined; graphId: string }) {
  const [indexBusy, setIndexBusy] = useState(false);
  const [indexed, setIndexed] = useState<boolean | null>(null);

  if (!graph) return <EmptyState message="No graph loaded" />;

  const currentCommit = graph.gitInfo.commitHash;
  const commitEntry = meta?.commits.find((c) => c.commitHash === currentCommit);
  const isIndexed = indexed ?? commitEntry?.isIndexed ?? false;

  async function reindex() {
    if (!graphId || indexBusy) return;
    setIndexBusy(true);
    try {
      const { api } = await import("@/lib/api");
      await api.reindexGraph(graphId, currentCommit, true);
      setIndexed(true);
    } catch {
      setIndexed(false);
    } finally {
      setIndexBusy(false);
    }
  }

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
              <span className="text-[13px]" style={{ color: C.textGhost }}>{label}</span>
              <span
                className="text-[13px] font-mono font-medium px-2 py-0.5 rounded-lg"
                style={{ background: C.elevated, color: C.teal }}
              >
                {value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: C.textGhost }}>State</span>
            <span className="text-[13px] font-mono" style={{ color: C.textSub }}>{stateLibs}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: C.textGhost }}>Databases</span>
            <span className="text-[13px] font-mono" style={{ color: C.textSub }}>{databases}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: C.textGhost }}>Data fetching</span>
            <span className="text-[13px] font-mono" style={{ color: C.textSub }}>{dataFetch}</span>
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
              <span className="text-[13px]" style={{ color: C.textGhost }}>{label}</span>
              <span className="text-[14.5px] font-mono font-semibold" style={{ color: C.teal }}>
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
                <span className="text-[13px] flex-1" style={{ color: C.textSub }}>
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
                <span className="text-[13px] font-mono w-6 text-right" style={{ color: C.textGhost }}>
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
          className="px-3 py-2.5 rounded-xl text-[13px] font-mono"
          style={{ background: C.elevated, border: `1px solid ${C.borderSub}`, color: C.textSub }}
        >
          {graph.gitInfo.message || "No message"}
        </div>
      </Section>

      {/* Search index */}
      <Section title="Search Index">
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-xl"
          style={{ background: C.elevated, border: `1px solid ${C.borderSub}` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: isIndexed ? C.teal : "#b45309" }}
            />
            <span className="text-[13px]" style={{ color: C.textSub }}>
              {isIndexed ? "indexed" : "not indexed"}
            </span>
          </div>
          <button
            onClick={reindex}
            disabled={indexBusy}
            className="text-[13px] font-mono px-2.5 py-1 rounded-lg disabled:opacity-50"
            style={{ background: C.teal + "1a", color: C.teal, border: `1px solid ${C.teal}33` }}
          >
            {indexBusy ? "indexing..." : "reindex"}
          </button>
        </div>
        {!isIndexed && (
          <p className="text-[13px] mt-2" style={{ color: C.textGhost }}>
            BM25F symbol search needs an index. Queries still work via fallback, or run
            devlens reindex for all graphs.
          </p>
        )}
      </Section>
    </div>
  );
}

// ─── Panel: Nodes (visible only) ─────────────────────────────────────────────

function NodesPanel({ nodes, nodesById, onNodeFocus, onOpenCode }: {
  nodes:       CodeNode[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
  onOpenCode:  (id: string) => void;
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
        <span className="text-[13px]" style={{ color: C.textDim }}>
          {filtered.length} of {nodes.length} visible nodes
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filtered.length === 0
          ? <EmptyState message="No nodes match filters" />
          : filtered
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map(n => (
                <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} onOpenCode={() => onOpenCode(n.id)} />
              ))
        }
      </div>
    </div>
  );
}

// ─── Panel: Search (all nodes) ────────────────────────────────────────────────

function SearchPanel({ nodes, nodesById, onNodeFocus, onOpenCode }: {
  nodes:       CodeNode[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
  onOpenCode:  (id: string) => void;
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
        <span className="text-[13px]" style={{ color: C.textDim }}>
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
                  <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} onOpenCode={() => onOpenCode(n.id)} />
                ))
        }
      </div>
    </div>
  );
}

// ─── Panel: Highlighted ───────────────────────────────────────────────────────

function HighlightedPanel({ ids, nodesById, onNodeFocus, onOpenCode }: {
  ids:         string[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
  onOpenCode:  (id: string) => void;
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
        <span className="text-[13px]" style={{ color: C.textGhost }}>
          {filtered.length} highlighted nodes
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filtered.length === 0
          ? <EmptyState message="No matches" />
          : filtered
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map(n => (
                <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} onOpenCode={() => onOpenCode(n.id)} />
              ))
        }
      </div>
    </div>
  );
}

// ─── Panel: Files ─────────────────────────────────────────────────────────────

function FilesPanel({ nodes, nodesById, onNodeFocus, onOpenCode }: {
  nodes:       CodeNode[];
  nodesById:   Record<string, CodeNode>;
  onNodeFocus: (id: string) => void;
  onOpenCode:  (id: string) => void;
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
        <span className="text-[13px]" style={{ color: C.textGhost }}>
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
                <HiOutlineFolder size={13} color={NODE_COLORS.FILE} />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-mono font-medium truncate block"
                        style={{ color: C.text }}>
                    {fileName}
                  </span>
                  {dirPath && (
                    <span className="text-[13px] truncate block" style={{ color: C.textGhost }}>
                      {dirPath}
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-mono shrink-0" style={{ color: C.textGhost }}>
                  {children.length}
                </span>
              </button>

              {isOpen && children.length > 0 && (
                <div style={{ borderLeft: `1px solid ${C.borderSub}`, marginLeft: 28 }}>
                  {children
                    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                    .map(n => (
                      <NodeRow key={n.id} node={n} onFocus={() => onNodeFocus(n.id)} onOpenCode={() => onOpenCode(n.id)} />
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

function DiffPanel({ meta, graphId, nodesById, onNodeFocus, onOpenCode, onDiffActivate, onDiffClear }: {
  meta:           GraphMeta | undefined;
  graphId:        string;
  nodesById:      Record<string, CodeNode>;
  onNodeFocus:    (id: string) => void;
  onOpenCode:     (id: string) => void;
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
          <label className="text-[13px]" style={{ color: C.textGhost }}>From</label>
          <CommitSelect
            commits={commits}
            value={fromHash}
            onChange={v => { setFromHash(v); setConfirmed(false); onDiffClear(); }}
            exclude={toHash}
            disabled={confirmed}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px]" style={{ color: C.textGhost }}>To</label>
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
            className="w-full py-2 rounded-xl text-[13px] font-semibold
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
            className="w-full py-2 rounded-xl text-[13px] font-semibold transition-all"
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
          <p className="text-[13px]" style={{ color: "#b91c1c" }}>Failed to load diff</p>
        )}
      </div>

      {/* Loading */}
      {confirmed && isLoading && (
        <div className="flex items-center gap-2 justify-center py-8">
          <div
            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${C.teal} transparent transparent transparent` }}
          />
          <span className="text-[13px]" style={{ color: C.textDim }}>Comparing commits…</span>
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
                  className="text-[13px] px-2 py-0.5 rounded-lg border font-medium"
                  style={{ color, background: `${color}15`, borderColor: `${color}30` }}
                >
                  {count} {label}
                </span>
              ) : null
            )}
            <span className="text-[13px] ml-auto" style={{ color: C.textGhost }}>
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
                    ? DIFF_COLORS.added.text
                    : n.scoreAfter < n.scoreBefore
                      ? DIFF_COLORS.removed.text
                      : DIFF_COLORS.codeChanged.text
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
                  badgeColor={n.delta > 0 ? DIFF_COLORS.added.text : DIFF_COLORS.removed.text}
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

function SecurityPanel({ nodes, onNodeFocus, onOpenCode }: {
  nodes:       CodeNode[];
  onNodeFocus: (id: string) => void;
  onOpenCode:  (id: string) => void;
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
                           text-[13px] font-medium transition-all"
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
                  className="px-1 rounded font-mono text-[13px]"
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
            <span key={sev} className="text-[13px] font-medium" style={{ color: sc.text }}>
              {count} {sc.label.toLowerCase()}
            </span>
          );
        })}
        <span className="text-[13px] ml-auto" style={{ color: C.textGhost }}>
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
                  <span className="text-[13px] font-semibold uppercase tracking-wider"
                        style={{ color: sc.text }}>
                    {sc.label} Risk
                  </span>
                  <span
                    className="ml-auto text-[13px] font-mono px-1.5 py-0.5 rounded"
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
            <span className="text-[13px] font-mono font-semibold truncate" style={{ color: C.text }}>
              {node.name}
            </span>
            <span
              className="text-[13px] px-1.5 py-0.5 rounded shrink-0"
              style={{ background: typeC.bg, color: typeC.text }}
            >
              {node.type}
            </span>
          </div>
          <p className="text-[13px] truncate mb-1" style={{ color: C.textGhost }}>
            {node.filePath.split("/").slice(-2).join("/")}
          </p>
          {node.security?.summary && (
            <div>
              {expanded ? (
                <div
                  className="summary-html text-[13px] leading-relaxed"
                  style={{ color: C.textSub }}
                  dangerouslySetInnerHTML={{ __html: sanitizeSummary(node.security.summary) }}
                />
              ) : (
                <p className="text-[13px] leading-relaxed" style={{ color: C.textSub }}>
                  {node.security.summary.replace(/<[^>]*>/g, "").length <= 100
                    ? node.security.summary.replace(/<[^>]*>/g, "")
                    : `${node.security.summary.replace(/<[^>]*>/g, "").slice(0, 100).trimEnd()}…`
                  }
                </p>
              )}
              {node.security.summary.replace(/<[^>]*>/g, "").length > 100 && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
                  className="text-[13px] mt-0.5 transition-colors"
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
        <span className="text-[13px] font-mono shrink-0" style={{ color: C.textGhost }}>
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
      className="w-full text-[13px] font-mono py-1.5 px-2 rounded-lg outline-none transition-colors
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
        <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color }}>
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
        <span className="text-[13px] font-mono font-medium truncate block" style={{ color: C.text }}>
          {label}
        </span>
        {sub && (
          <span className="text-[13px] truncate block" style={{ color: C.textGhost }}>{sub}</span>
        )}
      </span>
      {badge && (
        <span
          className="text-[13px] font-mono px-1.5 py-0.5 rounded-lg shrink-0"
          style={{ background: `${badgeColor}20`, color: badgeColor }}
        >
          {badge}
        </span>
      )}
      {score !== undefined && (
        <span className="text-[13px] font-mono shrink-0" style={{ color: C.textGhost }}>
          {score.toFixed(1)}
        </span>
      )}
    </button>
  );
}