"use client";

import { useEffect, useRef, useState } from "react";
import type { CodeNode, CodeEdge, NodeType, OverlayGraph } from "@/lib/types";
import { useNodeCode } from "@/lib/hooks";
import { bfsReachable, blastRadius, buildAdjacency } from "@/lib/graphAlgo";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/github-dark.css";
import {
  HiOutlineXMark,
  HiOutlineCodeBracket,
  HiOutlineArrowRight,
  HiOutlineArrowLeft,
  HiOutlineEye,
  HiOutlinePencilSquare,
  HiOutlineShare,
  HiOutlineArrowDownTray,
  HiOutlineShieldExclamation,
  HiOutlineBolt,
  HiOutlineArrowsRightLeft,
  HiOutlineCircleStack,
  HiOutlineGlobeAlt,
  HiOutlineArrowPath,
  HiOutlineCommandLine,
  HiOutlineRectangleStack,
  HiOutlineCpuChip,
  HiOutlineChevronDown,
  HiOutlineBeaker,
  HiOutlineBookOpen,
} from "react-icons/hi2";
import { GrDocumentTest } from "react-icons/gr";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: "#0d1117",
  surface: "#161b22",
  elevated: "#21262d",
  border: "#30363d",
  borderSub: "#21262d",
  text: "#e6edf3",
  textSub: "#8b949e",
  textDim: "#6e7681",
  textGhost: "#484f58",
  teal: "#2dd4bf",
  blue: "#60a5fa",
  indigo: "#818cf8",
};

// ─── Type colours ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<NodeType, { bg: string; text: string; border: string }> = {
  COMPONENT:   { bg: "#2dd4bf18", text: "#2dd4bf", border: "#2dd4bf30" },
  HOOK:        { bg: "#c084fc18", text: "#c084fc", border: "#c084fc30" },
  FUNCTION:    { bg: "#60a5fa18", text: "#60a5fa", border: "#60a5fa30" },
  STATE_STORE: { bg: "#fb923c18", text: "#fb923c", border: "#fb923c30" },  // ← orange
  UTILITY:     { bg: "#94a3b818", text: "#94a3b8", border: "#94a3b830" },
  FILE:        { bg: "#f472b618", text: "#f472b6", border: "#f472b630" },
  GHOST:       { bg: "#6b728018", text: "#6b7280", border: "#6b728030" },
  ROUTE:       { bg: "#818cf818", text: "#818cf8", border: "#818cf830" },
  TEST:        { bg: "#f9731618", text: "#f97316", border: "#f9731630" },
  STORY:       { bg: "#a78bfa18", text: "#a78bfa", border: "#a78bfa30" },  // ← violet
};

const TYPE_DOT: Record<string, string> = {
  COMPONENT:   "#2dd4bf",
  HOOK:        "#c084fc",
  FUNCTION:    "#60a5fa",
  STATE_STORE: "#fb923c",  // ← orange
  UTILITY:     "#94a3b8",
  FILE:        "#f472b6",
  GHOST:       "#6b7280",
  ROUTE:       "#818cf8",
  TEST:        "#f97316",
  STORY:       "#a78bfa",  // ← violet
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  COMPONENT:   <HiOutlineRectangleStack size={16} />,
  HOOK:        <HiOutlineArrowPath size={16} />,
  FUNCTION:    <HiOutlineCommandLine size={16} />,
  STATE_STORE: <HiOutlineCircleStack size={16} />,
  UTILITY:     <HiOutlineCpuChip size={16} />,
  FILE:        <HiOutlineCodeBracket size={16} />,
  GHOST:       <HiOutlineBolt size={16} />,
  ROUTE:       <HiOutlineGlobeAlt size={16} />,
  TEST:        <HiOutlineBeaker size={16} />,      // ← add
  STORY:       <HiOutlineBookOpen size={16} />,    // ← add
};

const SEV_COLORS: Record<string, { bg: string; text: string; border: string }> =
  {
    low: { bg: "#9e6a0318", text: "#d29922", border: "#9e6a0340" },
    medium: { bg: "#bd561d18", text: "#f0883e", border: "#bd561d40" },
    high: { bg: "#da363318", text: "#f85149", border: "#da363340" },
  };

const EDGE_COLORS: Record<string, string> = {
  CALLS: "#3b82f6",
  IMPORTS: "#94a3b8",
  READS_FROM: "#f59e0b",
  WRITES_TO: "#f85149",
  PROP_PASS: "#2dd4bf",
  EMITS: "#c084fc",
  LISTENS: "#a78bfa",
  WRAPPED_BY: "#3fb950",
  GUARDS: "#d29922",
  HANDLES: "#8286bb",
  TESTS: "#f97316",
  USES: "#a78bfa",
};

const METHOD_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  GET: { bg: "#3fb95018", text: "#3fb950", border: "#3fb95040" },
  POST: { bg: "#60a5fa18", text: "#60a5fa", border: "#60a5fa40" },
  PUT: { bg: "#f59e0b18", text: "#f59e0b", border: "#f59e0b40" },
  PATCH: { bg: "#f0883e18", text: "#f0883e", border: "#f0883e40" },
  DELETE: { bg: "#f8514918", text: "#f85149", border: "#f8514940" },
  HEAD: { bg: "#94a3b818", text: "#94a3b8", border: "#94a3b840" },
  OPTIONS: { bg: "#c084fc18", text: "#c084fc", border: "#c084fc40" },
};

const DIFF_STATUS_COLORS = {
  added: { bg: "#3fb95018", text: "#3fb950", border: "#3fb95030" },
  removed: { bg: "#f8514918", text: "#f85149", border: "#f8514930" },
  scoreChanged: { bg: "#d2992218", text: "#d29922", border: "#d2992230" },
  moved: { bg: "#818cf818", text: "#818cf8", border: "#818cf830" },
  codeChanged: { bg: "#f59e0b18", text: "#f59e0b", border: "#f59e0b30" },
};

const DIFF_STATUS_LABELS = {
  added: "Added",
  codeChanged: "Code Changed",
  removed: "Removed",
  scoreChanged: "Score Changed",
  moved: "Moved",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_W = 320;
const MAX_W = 700;
const DEFAULT_W = 440;
const MIN_CODE_H = 120;
const MAX_CODE_H = 800;
const DEF_CODE_H = 300;
const SHOW_N = 6;

// ─── DiffInfo type ────────────────────────────────────────────────────────────

export interface DiffInfo {
  status: "added" | "removed" | "codeChanged" | "scoreChanged" | "moved";
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  fromFile?: string;
  toFile?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Label({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      {icon && <span style={{ color: C.textGhost }}>{icon}</span>}
      <p
        className="text-sm font-semibold uppercase tracking-widest"
        style={{ color: C.textGhost }}
      >
        {children}
      </p>
    </div>
  );
}

function EdgeIcon({ type, color }: { type: string; color: string }) {
  const size = 11;
  switch (type) {
    case "CALLS":
      return <HiOutlineArrowRight size={size} color={color} />;
    case "IMPORTS":
      return <HiOutlineArrowDownTray size={size} color={color} />;
    case "READS_FROM":
      return <HiOutlineEye size={size} color={color} />;
    case "WRITES_TO":
      return <HiOutlinePencilSquare size={size} color={color} />;
    case "PROP_PASS":
      return <HiOutlineShare size={size} color={color} />;
    case "EMITS":
      return <HiOutlineBolt size={size} color={color} />;
    case "LISTENS":
      return <HiOutlineArrowsRightLeft size={size} color={color} />;
    case "WRAPPED_BY":
      return <HiOutlineRectangleStack size={size} color={color} />;
    case "GUARDS":
      return <HiOutlineShieldExclamation size={size} color={color} />;
    case "HANDLES":
      return <HiOutlineGlobeAlt size={size} color={color} />;
    case "TESTS":
      return <GrDocumentTest size={size} color={color} />;
    case "USES":
      return <HiOutlineCommandLine size={size} color={color} />;
    default:
      return <HiOutlineBolt size={size} color={color} />;
  }
}

function ExpandableText({
  text,
  threshold = 180,
}: {
  text: string;
  threshold?: number;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;
  const displayed =
    long && !open ? `${text.slice(0, threshold).trimEnd()}…` : text;

  return (
    <div>
      <p
        className="text-sm leading-7 text-gray-300 tracking-wider!"
        style={{ letterSpacing: "0.01em" }}
      >
        {displayed}
      </p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2 cursor-pointer flex items-center gap-1 text-sm font-medium
                     transition-colors"
          style={{ color: C.teal }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.opacity = "0.7")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.opacity = "1")
          }
        >
          {open ? "↑ Show less" : "↓ Read more"}
        </button>
      )}
    </div>
  );
}

// ─── Route metadata section ───────────────────────────────────────────────────

function RouteMetaSection({
  node,
  score,
  scoreW,
  scoreGrad,
}: {
  node: CodeNode;
  score: number;
  scoreW: string;
  scoreGrad: string;
}) {
  const meta = node.metadata;
  const method = meta.httpMethod as string | null;
  const methodC = method
    ? (METHOD_COLORS[method] ?? METHOD_COLORS["GET"])
    : null;
  const urlPath = meta.urlPath as string;
  const isDynamic = meta.isDynamic as boolean;
  const isCatchAll = meta.isCatchAll as boolean;
  const params = meta.params as string[] | undefined;
  const routeType = meta.routeNodeType as string | undefined;
  const framework = meta.framework as string;

  return (
    <div
      className="px-5 py-4"
      style={{ borderBottom: `1px solid ${C.borderSub}` }}
    >
      {/* URL path */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
        style={{ background: "#818cf810", border: "1px solid #818cf825" }}
      >
        <HiOutlineGlobeAlt size={14} color={C.indigo} className="shrink-0" />
        <span
          className="text-sm font-mono font-medium truncate flex-1"
          style={{ color: C.text }}
          title={urlPath}
        >
          {urlPath}
        </span>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {method && methodC && (
          <span
            className="text-sm font-mono font-bold px-2.5 py-0.5 rounded-lg border tracking-wider"
            style={{
              background: methodC.bg,
              color: methodC.text,
              borderColor: methodC.border,
            }}
          >
            {method}
          </span>
        )}
        {routeType && (
          <span
            className="text-sm px-2 py-0.5 rounded-lg border font-medium"
            style={{
              background: "#818cf810",
              color: C.indigo,
              borderColor: "#818cf825",
            }}
          >
            {routeType.replace(/_/g, " ")}
          </span>
        )}
        <span
          className="text-sm px-2 py-0.5 rounded-lg border font-medium"
          style={{
            background: C.elevated,
            color: C.textSub,
            borderColor: C.borderSub,
          }}
        >
          {framework}
        </span>
        {isDynamic && (
          <span
            className="text-sm px-2 py-0.5 rounded-lg border font-medium"
            style={{
              background: "#f59e0b10",
              color: "#f59e0b",
              borderColor: "#f59e0b25",
            }}
          >
            dynamic
          </span>
        )}
        {isCatchAll && (
          <span
            className="text-sm px-2 py-0.5 rounded-lg border font-medium"
            style={{
              background: "#f59e0b10",
              color: "#f59e0b",
              borderColor: "#f59e0b25",
            }}
          >
            catch-all
          </span>
        )}
      </div>

      {/* Params */}
      {params && params.length > 0 && (
        <div className="mb-3">
          <div
            className="text-sm uppercase tracking-wider mb-1.5"
            style={{ color: C.textGhost }}
          >
            Params
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {params.map((param) => (
              <span
                key={param}
                className="text-sm font-mono px-2 py-0.5 rounded-lg border"
                style={{
                  background: "#f59e0b10",
                  color: "#f59e0b",
                  borderColor: "#f59e0b30",
                }}
              >
                :{param}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Score */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div
            className="text-sm uppercase tracking-wider"
            style={{ color: C.textGhost }}
          >
            Score
          </div>
          <span
            className="text-sm font-mono font-semibold"
            style={{ color: C.teal }}
          >
            {score.toFixed(1)}
            <span style={{ color: C.textGhost }}> / 10</span>
          </span>
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: C.elevated }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: scoreW, background: scoreGrad }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Code version block ───────────────────────────────────────────────────────

function CodeVersion({
  label,
  color,
  highlighted,
  loading,
  open,
  onToggle,
}: {
  label: string;
  color: string;
  highlighted: string | null;
  loading: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${color}30`, background: C.bg }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{
          background: `${color}10`,
          borderBottom: open ? `1px solid ${color}20` : "none",
        }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
        <span className="text-sm font-semibold" style={{ color }}>
          {label}
        </span>
        <HiOutlineChevronDown
          size={10}
          style={{
            marginLeft: "auto",
            color,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
          }}
        />
      </button>

      {open &&
        (loading ? (
          <div className="flex items-center gap-2 p-4">
            <div
              className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: `${color} transparent transparent transparent`,
              }}
            />
            <span className="text-sm" style={{ color: C.textDim }}>
              Loading…
            </span>
          </div>
        ) : highlighted ? (
          <pre
            className="p-4 overflow-x-auto leading-7 text-sm"
            style={{ maxHeight: 300 }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <p className="p-4 text-sm" style={{ color: C.textDim }}>
            Code not available for this version.
          </p>
        ))}
    </div>
  );
}

// ─── Code comparison (diff mode) ─────────────────────────────────────────────

function CodeComparison({
  graphId,
  currentHash,
  previousHash,
  nodeId,
  diffStatus,
}: {
  graphId: string;
  currentHash: string;
  previousHash: string;
  nodeId: string;
  diffStatus?: string;
}) {
  const [showCurrent, setShowCurrent] = useState(true);
  const [showPrevious, setShowPrevious] = useState(true);

  const { data: currentNode, isLoading: currentLoading } = useNodeCode(
    graphId,
    currentHash,
    diffStatus !== "removed" ? nodeId : null,
  );
  const { data: previousNode, isLoading: previousLoading } = useNodeCode(
    graphId,
    previousHash,
    diffStatus !== "added" ? nodeId : null,
  );

  const currentHighlighted = currentNode?.rawCode
    ? hljs.highlightAuto(currentNode.rawCode, ["typescript", "javascript"])
        .value
    : null;
  const previousHighlighted = previousNode?.rawCode
    ? hljs.highlightAuto(previousNode.rawCode, ["typescript", "javascript"])
        .value
    : null;

  return (
    <div className="space-y-2">
      {diffStatus !== "removed" && (
        <CodeVersion
          label="Current version"
          color="#3fb950"
          highlighted={currentHighlighted}
          loading={currentLoading}
          open={showCurrent}
          onToggle={() => setShowCurrent((o) => !o)}
        />
      )}
      {diffStatus !== "added" && (
        <CodeVersion
          label="Previous version"
          color="#f85149"
          highlighted={previousHighlighted}
          loading={previousLoading}
          open={showPrevious}
          onToggle={() => setShowPrevious((o) => !o)}
        />
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  nodeId: string | null;
  graphId: string;
  commitHash: string;
  nodesById: Record<string, CodeNode>;
  edges: CodeEdge[];
  onClose: () => void;
  onNodeFocus: (nodeId: string) => void;
  onHighlight: (nodeIds: string[]) => void;
  onClearHighlight: () => void;
  onUpdateOverlay?: (overlay: Partial<OverlayGraph>) => void;
  diffInfo?: DiffInfo;
  diffFromHash?: string;
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function NodeDetailPanel({
  nodeId,
  graphId,
  commitHash,
  nodesById,
  edges,
  onClose,
  onNodeFocus,
  onHighlight,
  onClearHighlight,
  onUpdateOverlay,
  diffInfo,
  diffFromHash,
}: NodeDetailPanelProps) {
  const [width, setWidth] = useState(DEFAULT_W);
  const [showCode, setShowCode] = useState(false);
  const [kHop, setKHop] = useState(1);
  const [blastK, setBlastK] = useState<number>(1);
  const [codeHeight, setCodeHeight] = useState(DEF_CODE_H);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);
  const isCodeDragging = useRef(false);
  const codeDragY = useRef(0);
  const codeDragH = useRef(0);

  // Reset code view when node changes
  useEffect(() => {
    setShowCode(false);
  }, [nodeId]);

  const { data: nodeWithCode, isLoading: codeLoading } = useNodeCode(
    graphId,
    commitHash,
    showCode && !diffFromHash ? nodeId : null,
  );

  function onPanelDragStart(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = width;
    const move = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setWidth(
        Math.min(
          MAX_W,
          Math.max(
            MIN_W,
            dragStartW.current + (dragStartX.current - e.clientX),
          ),
        ),
      );
    };
    const up = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function onCodeDragStart(e: React.MouseEvent) {
    e.preventDefault();
    isCodeDragging.current = true;
    codeDragY.current = e.clientY;
    codeDragH.current = codeHeight;
    const move = (e: MouseEvent) => {
      if (!isCodeDragging.current) return;
      setCodeHeight(
        Math.min(
          MAX_CODE_H,
          Math.max(
            MIN_CODE_H,
            codeDragH.current + (e.clientY - codeDragY.current),
          ),
        ),
      );
    };
    const up = () => {
      isCodeDragging.current = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  const node = nodeId ? nodesById[nodeId] : null;

  const outgoing = edges
    .filter((e) => e.from === nodeId)
    .reduce<Record<string, string[]>>((acc, e) => {
      if (!acc[e.type]) acc[e.type] = [];
      if (nodesById[e.to]) acc[e.type].push(e.to);
      return acc;
    }, {});

  const incoming = edges
    .filter((e) => e.to === nodeId)
    .reduce<Record<string, string[]>>((acc, e) => {
      if (!acc[e.type]) acc[e.type] = [];
      if (nodesById[e.from]) acc[e.type].push(e.from);
      return acc;
    }, {});

  function handleKHop() {
    onUpdateOverlay?.({mode: "khop", hopDepth: kHop});
    // if (!nodeId) return;
    // const { adj } = buildAdjacency(edges);
    // onHighlight([
    //   nodeId,
    //   ...Array.from(bfsReachable(nodeId, adj, kHop)).map((r) => r.nodeId),
    // ]);
  }

  function handleBlastRadius() {
    onUpdateOverlay?.({mode: "blast", hopDepth: blastK});
    // if (!nodeId) return;
    // const { radj } = buildAdjacency(edges);
    // onHighlight([nodeId, ...Array.from(blastRadius(nodeId, radj, blastK))]);
  }

  const highlighted = nodeWithCode?.rawCode
    ? hljs.highlightAuto(nodeWithCode.rawCode, ["typescript", "javascript"])
        .value
    : null;

  if (!node) return null;

  const score = node.score ?? 0;
  const scoreW = `${Math.min(100, (score / 10) * 100)}%`;
  const scoreGrad =
    score >= 7
      ? "linear-gradient(90deg, #3fb950, #2dd4bf)"
      : score >= 4
        ? "linear-gradient(90deg, #d29922, #f0883e)"
        : "linear-gradient(90deg, #f85149, #d29922)";

  const sev = node.security?.severity;
  const sevC = sev && sev !== "none" ? SEV_COLORS[sev] : null;
  const typeC = TYPE_COLORS[node.type];
  const isRoute = node.type === "ROUTE";

  // Diff status colors
  const diffC = diffInfo ? DIFF_STATUS_COLORS[diffInfo.status] : null;

  return (
    <div className="absolute top-0 right-0 h-full z-30 flex" style={{ width }}>
      {/* Resize grip */}
      <div
        onMouseDown={onPanelDragStart}
        className="w-1 h-full cursor-col-resize shrink-0 transition-colors hover:bg-accent/30"
        style={{ background: C.borderSub }}
      />

      {/* Panel */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: "rgba(13,17,23,0.92)",
          borderLeft: `1px solid ${C.borderSub}`,
          backdropFilter: "blur(16px)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          className="px-5 pt-4 pb-4 shrink-0"
          style={{ borderBottom: `1px solid ${C.borderSub}` }}
        >
          {/* Badges row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Type badge */}
              <span
                className="flex items-center gap-1.5 text-sm px-2.5 py-0.5
                           rounded-full border font-medium"
                style={{
                  background: typeC.bg,
                  color: typeC.text,
                  borderColor: typeC.border,
                }}
              >
                {TYPE_ICON[node.type]}
                {node.type.replace(/_/g, " ")}
              </span>

              {/* Diff status badge */}
              {diffC && diffInfo && (
                <span
                  className="flex items-center gap-1 text-sm px-2.5 py-0.5
                             rounded-full border font-medium"
                  style={{
                    background: diffC.bg,
                    color: diffC.text,
                    borderColor: diffC.border,
                  }}
                >
                  {DIFF_STATUS_LABELS[diffInfo.status]}
                </span>
              )}

              {/* Security badge */}
              {sevC && (
                <span
                  className="flex items-center gap-1 text-sm px-2.5 py-0.5
                             rounded-full border font-medium"
                  style={{
                    background: sevC.bg,
                    color: sevC.text,
                    borderColor: sevC.border,
                  }}
                >
                  <HiOutlineShieldExclamation size={10} />
                  {sev}
                </span>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => {
                onClearHighlight();
                onClose();
              }}
              className="shrink-0 p-1.5 rounded-lg transition-colors"
              style={{ color: C.textDim }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.color = C.text)
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.color = C.textDim)
              }
            >
              <HiOutlineXMark size={14} />
            </button>
          </div>

          {/* Name */}
          <h3
            className="font-semibold leading-snug mb-1.5 font-mono"
            style={{ fontSize: "1rem", color: C.text }}
          >
            {node.name}
          </h3>

          {/* File path */}
          <div className="flex items-center gap-1.5">
            <HiOutlineCodeBracket
              size={16}
              color={C.textGhost}
              className="shrink-0"
            />
            <p
              className="text-sm font-mono truncate"
              style={{ color: C.teal }}
              title={node.filePath}
            >
              {node.filePath}
            </p>
          </div>

          {/* Moved file path change */}
          {diffInfo?.status === "moved" && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span
                className="text-sm font-mono truncate"
                style={{ color: "#f85149" }}
              >
                {diffInfo.fromFile?.split("/").slice(-2).join("/")}
              </span>
              <span className="text-sm" style={{ color: C.textGhost }}>
                →
              </span>
              <span
                className="text-sm font-mono truncate"
                style={{ color: "#3fb950" }}
              >
                {diffInfo.toFile?.split("/").slice(-2).join("/")}
              </span>
            </div>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: `${C.elevated} ${C.bg}`,
          }}
        >
          {/* Route metadata OR standard score block */}
          {isRoute ? (
            <RouteMetaSection
              node={node}
              score={score}
              scoreW={scoreW}
              scoreGrad={scoreGrad}
            />
          ) : (
            <div
              className="px-5 py-4"
              style={{ borderBottom: `1px solid ${C.borderSub}` }}
            >
              <div className="flex items-start gap-6 mb-3">
                <div>
                  <div
                    className="text-sm uppercase tracking-wider mb-1"
                    style={{ color: C.textGhost }}
                  >
                    Lines
                  </div>
                  <div
                    className="text-sm font-mono"
                    style={{ color: C.textSub }}
                  >
                    {node.startLine}
                    <span style={{ color: C.textGhost }}>–</span>
                    {node.endLine}
                  </div>
                </div>

                <div
                  className="w-px self-stretch"
                  style={{ background: C.borderSub }}
                />

                <div>
                  <div
                    className="text-sm uppercase tracking-wider mb-1"
                    style={{ color: C.textGhost }}
                  >
                    Score
                  </div>
                  <div className="text-sm font-mono font-semibold">
                    <span style={{ color: C.teal }}>{score.toFixed(1)}</span>
                    <span style={{ color: C.textGhost }}> / 10</span>
                  </div>

                  {/* Score change in diff mode */}
                  {diffInfo?.status === "scoreChanged" &&
                    diffInfo.scoreBefore !== undefined && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="text-sm font-mono"
                          style={{ color: C.textGhost }}
                        >
                          {diffInfo.scoreBefore.toFixed(1)}
                        </span>
                        <span
                          className="text-sm"
                          style={{ color: C.textGhost }}
                        >
                          →
                        </span>
                        <span
                          className="text-sm font-mono"
                          style={{ color: C.teal }}
                        >
                          {diffInfo.scoreAfter?.toFixed(1)}
                        </span>
                        <span
                          className="text-sm font-mono px-1.5 py-0.5 rounded-lg"
                          style={{
                            background:
                              (diffInfo.delta ?? 0) > 0
                                ? "#3fb95020"
                                : "#f8514920",
                            color:
                              (diffInfo.delta ?? 0) > 0 ? "#3fb950" : "#f85149",
                          }}
                        >
                          {(diffInfo.delta ?? 0) > 0 ? "+" : ""}
                          {diffInfo.delta?.toFixed(1)}
                        </span>
                      </div>
                    )}
                </div>

                {node.summarizedAt && (
                  <div className="ml-auto text-right">
                    <div
                      className="text-sm uppercase tracking-wider mb-1"
                      style={{ color: C.textGhost }}
                    >
                      Analyzed
                    </div>
                    <div className="text-sm" style={{ color: C.textDim }}>
                      {new Date(node.summarizedAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Score bar */}
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: C.elevated }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: scoreW, background: scoreGrad }}
                />
              </div>
            </div>
          )}

          {/* Security alert */}
          {sevC && (
            <div
              className="mx-5 my-4 px-4 py-3 rounded-xl"
              style={{
                background: sevC.bg,
                border: `1px solid ${sevC.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <HiOutlineShieldExclamation size={12} color={sevC.text} />
                <span
                  className="text-sm font-semibold uppercase tracking-wider"
                  style={{ color: sevC.text }}
                >
                  {sev} risk
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: `${sevC.text}cc` }}
              >
                {node.security!.summary}
              </p>
            </div>
          )}
          {console.log("Summaries for the nodes are : ", node) as any}
          {/* Summaries */}
          {(node.businessSummary || node.technicalSummary) && (
            <div
              className="px-5 py-4 my-8 space-y-6"
              style={{ borderBottom: `1px solid ${C.borderSub}` }}
            >
              {node.businessSummary && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: `${C.teal}50`,
                    border: `1px solid ${C.teal}15`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <HiOutlineRectangleStack size={16} color={C.teal} />
                    <span
                      className="text-base font-semibold uppercase tracking-widest"
                      style={{ color: C.teal }}
                    >
                      What it does
                    </span>
                  </div>
                  <ExpandableText text={node.businessSummary} />
                </div>
              )}

              {node.technicalSummary && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: `${C.blue}50`,
                    border: `1px solid ${C.blue}15`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <HiOutlineCommandLine size={16} color={C.blue} />
                    <span
                      className="text-base font-semibold uppercase tracking-widest"
                      style={{ color: C.blue }}
                    >
                      Technical
                    </span>
                  </div>
                  <ExpandableText text={node.technicalSummary} />
                </div>
              )}
            </div>
          )}

          {/* Test cases — shown for TEST and STORY nodes */}
          {(node.type === "TEST" || node.type === "STORY") &&
            (() => {
              const testCases = node.metadata?.testCases as
                | string[]
                | undefined;
              if (!testCases?.length) return null;
              return (
                <div
                  className="px-5 py-4"
                  style={{ borderBottom: `1px solid ${C.borderSub}` }}
                >
                  <Label>
                    {(node.type === "TEST" ? "Test Cases " : "Stories ") + "/ Functions"}
                  </Label>
                  <div className="flex flex-col gap-1">
                    {testCases.map((name, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: C.elevated, color: C.textSub }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            background:
                              node.type === "TEST" ? "#f97316" : "#f472b6",
                          }}
                        />
                        {name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {/* Connections */}
          {(Object.keys(outgoing).length > 0 ||
            Object.keys(incoming).length > 0) && (
            <div
              className="px-5 py-4 space-y-4"
              style={{ borderBottom: `1px solid ${C.borderSub}` }}
            >
              {Object.keys(outgoing).length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <HiOutlineArrowRight size={16} color={C.blue} />
                    <span
                      className="text-sm font-semibold uppercase tracking-widest"
                      style={{ color: C.textGhost }}
                    >
                      {isRoute ? "Handles" : "Calls / Uses"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(outgoing).map(([type, ids]) => (
                      <ConnectionGroup
                        key={type}
                        type={type}
                        ids={ids}
                        nodesById={nodesById}
                        color={EDGE_COLORS[type] ?? C.textSub}
                        onNodeFocus={onNodeFocus}
                      />
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(incoming).length > 0 && (
                <div className="my-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <HiOutlineArrowLeft size={16} color={C.textSub} />
                    <span
                      className="text-sm font-semibold uppercase tracking-widest"
                      style={{ color: C.textGhost }}
                    >
                      Used By
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(incoming).map(([type, ids]) => (
                      <ConnectionGroup
                        key={type}
                        type={type}
                        ids={ids}
                        nodesById={nodesById}
                        color={EDGE_COLORS[type] ?? C.textSub}
                        onNodeFocus={onNodeFocus}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Graph tools */}
          <div
            className="px-5 py-4 my-8 flex flex-col gap-3"
            style={{ borderBottom: `1px solid ${C.borderSub}` }}
          >
            <Label icon={<HiOutlineCpuChip size={16} />}>Graph Tools</Label>

            {/* K-Hops */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: C.textDim }}>
                  K-Hops depth
                </span>
                <select
                  value={kHop}
                  onChange={(e) => setKHop(Number(e.target.value))}
                  className="text-sm font-mono rounded-lg px-2 py-1
                             focus:outline-none transition-colors"
                  style={{
                    background: C.elevated,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.teal)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option
                      key={n}
                      value={n}
                      style={{ background: C.elevated }}
                    >
                      {n} hops
                    </option>
                  ))}
                </select>
              </div>
              <ToolBtn
                onClick={handleKHop}
                accent="#60a5fa"
                label="Show K-Hops"
                full
              />
            </div>

            {/* Blast Radius */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: C.textDim }}>
                  Blast radius depth
                </span>
                <select
                  value={blastK}
                  onChange={(e) =>
                    setBlastK(
                      e.target.value === "∞"
                        ? Infinity
                        : Number(e.target.value),
                    )
                  }
                  className="text-sm font-mono rounded-lg px-2 py-1
                             focus:outline-none transition-colors"
                  style={{
                    background: C.elevated,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.teal)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, Infinity].map((n) => (
                    <option
                      key={n}
                      value={n}
                      style={{ background: C.elevated }}
                    >
                      {n} hops
                    </option>
                  ))}
                </select>
              </div>
              <ToolBtn
                onClick={handleBlastRadius}
                accent="#f85149"
                label="Blast Radius"
                full
              />
            </div>

            <ToolBtn
              onClick={onClearHighlight}
              accent={C.textSub}
              label="Clear Highlight"
              full
            />
          </div>

          {/* Source code — hidden for ROUTE nodes */}
          {!isRoute && (
            <div className="px-5 py-4 pb-8">
              <Label icon={<HiOutlineCodeBracket size={16} />}>
                {diffFromHash ? "Code Comparison" : "Source Code"}
              </Label>

              {/* Diff mode — show both code versions */}
              {diffFromHash && nodeId ? (
                <CodeComparison
                  graphId={graphId}
                  currentHash={commitHash}
                  previousHash={diffFromHash}
                  nodeId={nodeId}
                  diffStatus={diffInfo?.status}
                />
              ) : /* Normal single-version code view */
              !showCode ? (
                <button
                  onClick={() => setShowCode(true)}
                  className="w-full cursor-pointer text-sm py-2.5 rounded-xl
                               transition-all flex items-center justify-center gap-2"
                  style={{
                    border: `1px solid ${C.border}`,
                    color: C.textDim,
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = C.text;
                    el.style.borderColor = C.teal + "60";
                    el.style.background = `${C.teal}08`;
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = C.textDim;
                    el.style.borderColor = C.border;
                    el.style.background = "transparent";
                  }}
                >
                  <HiOutlineCodeBracket size={13} />
                  Load Source Code
                </button>
              ) : codeLoading ? (
                <div className="flex items-center gap-3 py-5">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                    style={{
                      borderColor: `${C.teal} transparent transparent transparent`,
                    }}
                  />
                  <span className="text-sm" style={{ color: C.textDim }}>
                    Loading…
                  </span>
                </div>
              ) : highlighted ? (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${C.border}`, background: C.bg }}
                >
                  {/* Toolbar */}
                  <div
                    className="flex items-center justify-between px-4 py-2"
                    style={{
                      borderBottom: `1px solid ${C.borderSub}`,
                      background: C.surface,
                    }}
                  >
                    <span
                      className="text-sm font-mono"
                      style={{ color: C.textDim }}
                    >
                      {node.filePath.split("/").pop()}
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm font-mono tabular-nums"
                        style={{ color: C.textGhost }}
                      >
                        {node.endLine - node.startLine + 1} lines
                      </span>
                      <div
                        className="flex items-center gap-px rounded px-0.5 py-0.5"
                        style={{
                          background: C.elevated,
                          border: `1px solid ${C.borderSub}`,
                        }}
                      >
                        {(
                          [
                            ["S", MIN_CODE_H],
                            ["M", DEF_CODE_H],
                            ["L", MAX_CODE_H],
                          ] as [string, number][]
                        ).map(([lbl, h]) => (
                          <button
                            key={lbl}
                            onClick={() => setCodeHeight(h)}
                            className="text-sm w-6 h-5 rounded-sm transition-colors font-medium"
                            style={{
                              background:
                                codeHeight === h ? C.border : "transparent",
                              color: codeHeight === h ? C.text : C.textGhost,
                            }}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Code body */}
                  <pre
                    className="p-4 overflow-x-auto overflow-y-auto leading-7 text-sm"
                    style={{ height: codeHeight }}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />

                  {/* Vertical resize handle */}
                  <div
                    onMouseDown={onCodeDragStart}
                    className="h-3 cursor-row-resize flex items-center justify-center"
                    style={{
                      borderTop: `1px solid ${C.borderSub}`,
                      background: C.surface,
                    }}
                    title="Drag to resize"
                  >
                    <div
                      className="w-8 rounded-full transition-colors"
                      style={{ height: 2, background: C.border }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          C.textGhost)
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          C.border)
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: C.textDim }}>
                  No source code available.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ToolBtn ──────────────────────────────────────────────────────────────────

function ToolBtn({
  onClick,
  label,
  accent,
  full,
}: {
  onClick: () => void;
  label: string;
  accent: string;
  full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-sm cursor-pointer py-2.5 rounded-xl transition-all
                  font-medium ${full ? "w-full" : ""}`}
      style={{
        border: `1px solid ${accent}35`,
        color: accent,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = `${accent}12`;
        el.style.borderColor = `${accent}70`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "transparent";
        el.style.borderColor = `${accent}35`;
      }}
    >
      {label}
    </button>
  );
}

// ─── ConnectionGroup ──────────────────────────────────────────────────────────

function ConnectionGroup({
  type,
  ids,
  nodesById,
  color,
  onNodeFocus,
}: {
  type: string;
  ids: string[];
  nodesById: Record<string, CodeNode>;
  color: string;
  onNodeFocus: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = ids.length - SHOW_N;
  const visible = expanded ? ids : ids.slice(0, SHOW_N);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: `${color}0a`, border: `1px solid ${color}25` }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${color}20` }}
      >
        <EdgeIcon type={type} color={color} />
        <span
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {type.replace(/_/g, " ")}
        </span>
        <span
          className="ml-auto text-sm tabular-nums font-mono"
          style={{ color: C.textGhost }}
        >
          {ids.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 p-2.5">
        {visible.map((id) => {
          const n = nodesById[id];
          const dotColor = n ? (TYPE_DOT[n.type] ?? C.textSub) : C.textSub;
          return (
            <NodeChip
              key={id}
              name={n?.name ?? id}
              dotColor={dotColor}
              hoverColor={color}
              onNodeFocus={() => onNodeFocus(id)}
            />
          );
        })}
        {!expanded && overflow > 0 && (
          <OverflowBtn
            color={color}
            label={`+${overflow} more`}
            onClick={() => setExpanded(true)}
          />
        )}
        {expanded && overflow > 0 && (
          <OverflowBtn
            color={color}
            label="show less"
            onClick={() => setExpanded(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── NodeChip ─────────────────────────────────────────────────────────────────

function NodeChip({
  name,
  dotColor,
  hoverColor,
  onNodeFocus,
}: {
  name: string;
  dotColor: string;
  hoverColor: string;
  onNodeFocus: () => void;
}) {
  return (
    <button
      onClick={onNodeFocus}
      className="flex cursor-pointer items-center gap-1.5 text-sm px-2.5 py-1.5
                 rounded-lg border transition-all"
      style={{ background: C.bg, borderColor: C.border, color: C.textSub }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = hoverColor;
        el.style.color = hoverColor;
        el.style.background = `${hoverColor}10`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = C.border;
        el.style.color = C.textSub;
        el.style.background = C.bg;
      }}
      title={name}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: dotColor }}
      />
      <span className="truncate" style={{ maxWidth: 148 }}>
        {name}
      </span>
    </button>
  );
}

// ─── OverflowBtn ──────────────────────────────────────────────────────────────

function OverflowBtn({
  color,
  label,
  onClick,
}: {
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-sm px-2.5 py-1.5 rounded-lg border border-dashed transition-all"
      style={{ borderColor: `${color}40`, color: `${color}80` }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = color;
        el.style.color = color;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${color}40`;
        el.style.color = `${color}80`;
      }}
    >
      {label}
    </button>
  );
}
