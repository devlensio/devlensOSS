"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useGraph, useJob, useGraphMeta, useAnalyze } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/lib/hooks";
import GraphCanvas, { GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import NodeDetailPanel, { DiffInfo } from "@/components/graph/NodeDetailPanel";
import Sidebar from "@/components/graph/Sidebar";
import { EdgeType, NodeType, NodeDiff } from "@/lib/types";
import FilterBar, {
  DEFAULT_EDGE_TYPES,
  DEFAULT_NODE_TYPES,
} from "@/components/graph/FilterBar";
import { buildAdjacency, bfsReachable } from "@/lib/graphAlgo";
import { HiOutlineArrowPath, HiOutlineChevronDown } from "react-icons/hi2";
import { IoArrowBack } from "react-icons/io5";

interface Props {
  params: Promise<{ graphId: string }>;
}

export default function GraphPage({ params }: Props) {
  const { graphId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const analyze = useAnalyze();
  const canvasRef = useRef<GraphCanvasHandle>(null);

  const commitHash = searchParams.get("commit") ?? undefined;
  const jobId = searchParams.get("jobId") ?? undefined;
  const skippedSummarization =
    searchParams.get("pSkippedSummarization") ?? undefined;

  const { data: job } = useJob(jobId ?? "");
  const {
    data: graph,
    isLoading: graphLoading,
    isFetching: graphFetching,
  } = useGraph(graphId, commitHash);
  const { data: meta } = useGraphMeta(graphId);

  const isAnalyzing =
    !!jobId &&
    (job?.status === "queued" ||
      (job?.status === "running" && job?.phase === "analysis"));
  const isSummarizing =
    !!jobId && job?.status === "running" && job?.phase === "summarization";
  const isPaused = !!jobId && job?.status === "paused";

  // summaryDone — only when summarization actually ran (not skip-summarization jobs)
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const summaryDone =
    !!jobId && job?.status === "completed" && !summaryDismissed;

  // Reset dismissed when jobId changes (new job submitted)
  useEffect(() => {
    setSummaryDismissed(false);
  }, [jobId]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [activeNodeTypes, setActiveNodeTypes] =
    useState<NodeType[]>(DEFAULT_NODE_TYPES);
  const [activeEdgeTypes, setActiveEdgeTypes] =
    useState<EdgeType[]>(DEFAULT_EDGE_TYPES);
  const [scoreThreshold, setScoreThreshold] = useState(1);
  const [showRouteNodes, setShowRouteNodes] = useState(false);
  const [routeHopDepth, setRouteHopDepth] = useState(2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [diffMode, setDiffMode] = useState(false);
  const [diffData, setDiffData] = useState<NodeDiff | null>(null);
  const [diffFromHash, setDiffFromHash] = useState<string>("");
  const [diffToHash, setDiffToHash] = useState<string>("");

  // ── Highlight helpers ─────────────────────────────────────────────────────

  function highlight(ids: string[]) {
    setHighlightedIds(ids);
    canvasRef.current?.highlightNodes(ids);
  }

  function clearHighlight() {
    setHighlightedIds([]);
    canvasRef.current?.clearHighlight();
  }

  // ── Reload — clear pending when refetch completes ─────────────────────────

  useEffect(() => {
    if (!graphFetching && reloadPending) {
      setReloadPending(false);
    }
  }, [graphFetching, reloadPending]);

  // ── Diff handlers ─────────────────────────────────────────────────────────

  function handleDiffActivate(
    diff: NodeDiff,
    fromHash: string,
    toHash: string,
  ) {
    setDiffData(diff);
    setDiffFromHash(fromHash);
    setDiffToHash(toHash);
    setDiffMode(true);
  }

  function handleDiffClear() {
    setDiffMode(false);
    setDiffData(null);
    setDiffFromHash("");
    setDiffToHash("");
    canvasRef.current?.clearDiffColors();
  }

  // ── Diff node lookup maps ─────────────────────────────────────────────────

  const diffNodeMap = useMemo(() => {
    if (!diffData) return null;
    const added        = new Set(diffData.added.map((n) => n.nodeId));
    const removed      = new Set(diffData.removed.map((n) => n.nodeId));
    const scoreChanged = new Map(diffData.scoreChanged.map((n) => [n.nodeId, n]));
    const moved        = new Map(diffData.moved.map((n) => [n.nodeId, n]));
    const codeChanged  = new Map((diffData.codeChanged ?? []).map((n) => [n.nodeId, n]));
    return { added, removed, scoreChanged, moved, codeChanged };
  }, [diffData]);

  // ── Diff color overrides ──────────────────────────────────────────────────

  const diffColorOverrides = useMemo((): Record<string, string> => {
    if (!diffNodeMap) return {};
    const overrides: Record<string, string> = {};
    for (const id of diffNodeMap.added)               overrides[id] = "#3fb950";
    for (const id of diffNodeMap.scoreChanged.keys())  overrides[id] = "#d29922";
    for (const id of diffNodeMap.moved.keys())         overrides[id] = "#818cf8";
    for (const id of diffNodeMap.codeChanged.keys())   overrides[id] = "#f59e0b";
    return overrides;
  }, [diffNodeMap]);

  useEffect(() => {
    if (!diffMode || Object.keys(diffColorOverrides).length === 0) {
      canvasRef.current?.clearDiffColors();
      return;
    }
    const timer = setTimeout(() => {
      canvasRef.current?.applyDiffColors(diffColorOverrides);
    }, 600);
    return () => clearTimeout(timer);
  }, [diffMode, diffColorOverrides]);

  // ── Route reachable set ───────────────────────────────────────────────────

  const routeReachableIds = useMemo(() => {
    if (!showRouteNodes || !graph) return new Set<string>();
    const { adj } = buildAdjacency(graph.edges);
    const reachable = new Set<string>();
    for (const node of graph.nodes) {
      if (node.type !== "ROUTE") continue;
      reachable.add(node.id);
      const reached = bfsReachable(node.id, adj, routeHopDepth);
      for (const r of reached) reachable.add(r.nodeId);
    }
    return reachable;
  }, [showRouteNodes, routeHopDepth, graph]);

  useEffect(() => {
    if (!showRouteNodes || routeReachableIds.size === 0) {
      clearHighlight();
      return;
    }
    const timer = setTimeout(() => {
      highlight([...routeReachableIds]);
    }, 500);
    return () => clearTimeout(timer);
  }, [showRouteNodes, routeReachableIds]);

  // ── Visible nodes ─────────────────────────────────────────────────────────

  const visibleNodes = useMemo(() => {
    if (!graph) return [];

    const seen = new Set<string>();

    const base = graph.nodes.filter((n) => {
      if (seen.has(n.id)) return false; // ← deduplicate
      seen.add(n.id);

      if (routeReachableIds.has(n.id)) return true;
      return (
        activeNodeTypes.includes(n.type) && (n.score ?? 0) >= scoreThreshold
      );
    });

    if (diffMode && diffData && diffNodeMap) {
      const removedNodes = diffData.removed
        .filter((n) => !seen.has(n.nodeId)) // ← also check against seen
        .map((n) => ({
          id: n.nodeId,
          name: n.name,
          type: n.type as any,
          filePath: n.filePath,
          startLine: 0,
          endLine: 0,
          score: n.score,
          metadata: { diffStatus: "removed" },
        }));
      return [...base, ...removedNodes];
    }

    return base;
  }, [
    graph,
    activeNodeTypes,
    scoreThreshold,
    routeReachableIds,
    diffMode,
    diffData,
    diffNodeMap,
  ]);

  // ── Visible edges ─────────────────────────────────────────────────────────

  const visibleEdges = useMemo(() => {
    if (!graph) return [];
    const nodeIds = new Set(visibleNodes.map((n) => n.id));
    return graph.edges.filter(
      (e) =>
        activeEdgeTypes.includes(e.type) &&
        nodeIds.has(e.from) &&
        nodeIds.has(e.to),
    );
  }, [graph, visibleNodes, activeEdgeTypes]);

  // ── Update canvas when filters change ────────────────────────────────────

  useEffect(() => {
    if (!graph) return;
    canvasRef.current?.updateElements(visibleNodes, visibleEdges);
  }, [visibleNodes, visibleEdges]);

  // ── Diff info for focused node ────────────────────────────────────────────

  const focusedNodeDiffInfo = useMemo((): DiffInfo | undefined => {
    if (!diffMode || !diffNodeMap || !focusedNodeId) return undefined;
    if (diffNodeMap.added.has(focusedNodeId))   return { status: "added" };
    if (diffNodeMap.removed.has(focusedNodeId)) return { status: "removed" };
    const sc = diffNodeMap.scoreChanged.get(focusedNodeId);
    if (sc)
      return {
        status:      "scoreChanged",
        scoreBefore: sc.scoreBefore,
        scoreAfter:  sc.scoreAfter,
        delta:       sc.delta,
      };
    const mv = diffNodeMap.moved.get(focusedNodeId);
    if (mv)
      return {
        status:   "moved",
        fromFile: mv.fromFile,
        toFile:   mv.toFile,
      };
    const cc = diffNodeMap.codeChanged.get(focusedNodeId);
    if (cc)
      return {
        status:      "codeChanged",
        scoreBefore: cc.scoreBefore,
        scoreAfter:  cc.scoreAfter,
        delta:       parseFloat((cc.scoreAfter - cc.scoreBefore).toFixed(2)),
      };
    return undefined;
  }, [diffMode, diffNodeMap, focusedNodeId]);

  // ── Fullscreen ────────────────────────────────────────────────────────────

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function handleFullscreen() {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }

  // ── Route toggle ──────────────────────────────────────────────────────────

  function handleRouteToggle() {
    if (showRouteNodes) {
      setShowRouteNodes(false);
      clearHighlight();
    } else setShowRouteNodes(true);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    setActiveNodeTypes(DEFAULT_NODE_TYPES);
    setActiveEdgeTypes(DEFAULT_EDGE_TYPES);
    setScoreThreshold(0);
    setShowRouteNodes(false);
    setRouteHopDepth(2);
    clearHighlight();
  }

  // ── Reload ────────────────────────────────────────────────────────────────

  function handleReload() {
    setReloadPending(true);
    setSummaryDismissed(true);
    queryClient.invalidateQueries({
      queryKey: keys.graph(graphId, commitHash),
    });
  }

  // ── Re-analyze ────────────────────────────────────────────────────────────

  async function handleReanalyze(skipSummarization = false) {
    const repoPath = graph?.repoPath ?? meta?.repoPath;
    if (!repoPath) return;
    setReanalyzing(true);
    try {
      const job = await analyze.mutateAsync({ repoPath, skipSummarization });
      setReanalyzing(false);
      router.replace(
        `/graph/${graphId}?jobId=${job.jobId}&pSkippedSummarization=${skipSummarization}`,
      );
    } catch {
      setReanalyzing(false);
    }
  }

  // ── Node focus ────────────────────────────────────────────────────────────

  function handleNodeFocus(id: string) {
    setFocusedNodeId(id);
    canvasRef.current?.focusNode(id);
  }

  const repoName =
    graph?.repoPath.split(/[\\/]/).pop() ??
    meta?.repoPath.split(/[\\/]/).pop() ??
    graphId;

  const hasRoutes = useMemo(
    () => (graph?.nodes ?? []).some((n) => n.type === "ROUTE"),
    [graph],
  );

  return (
    <div className="h-screen flex flex-col bg-base text-primary overflow-hidden">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav
        className="border-b border-border px-5 py-2 flex items-center gap-3
                      shrink-0 bg-base/95 backdrop-blur-sm z-10"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-primary
                     transition-colors shrink-0"
        >
          <IoArrowBack/>
          Back
        </button>

        <div className="h-4 w-px bg-border shrink-0" />

        <span className="font-medium text-primary text-sm truncate shrink-0 max-w-32">
          {repoName}
        </span>

        {graph?.gitInfo && (
          <span
            className="text-xs font-mono text-dim bg-elevated border border-border
                           px-2 py-1 rounded-lg shrink-0"
          >
            {graph.gitInfo.commitHash.slice(0, 7)}
          </span>
        )}

        {/* Re-analyze button */}
        {(graph || meta) && (
          <ReanalyzeButton
            repoPath={graph?.repoPath ?? meta?.repoPath ?? ""}
            disabled={reanalyzing || isAnalyzing}
            onReanalyze={handleReanalyze}
          />
        )}

        <div className="h-4 w-px bg-border shrink-0" />

        {/* FilterBar */}
        {graph && meta && (
          <FilterBar
            activeNodeTypes={activeNodeTypes}
            activeEdgeTypes={activeEdgeTypes}
            scoreThreshold={scoreThreshold}
            onApply={(nodes, edges, score) => {
              setActiveNodeTypes(nodes);
              setActiveEdgeTypes(edges);
              setScoreThreshold(score);
            }}
            showRouteNodes={showRouteNodes}
            onRouteToggle={handleRouteToggle}
            hasRoutes={hasRoutes}
            routeHopDepth={routeHopDepth}
            onHopDepthChange={setRouteHopDepth}
            commits={meta.commits}
            activeCommit={commitHash ?? meta.commits[0]?.commitHash ?? ""}
            onCommitChange={(hash) =>
              router.push(`/graph/${graphId}?commit=${hash}`)
            }
            isFullscreen={isFullscreen}
            onFullscreen={handleFullscreen}
            onReset={handleReset}
          />
        )}
      </nav>

      {/* ── Banners ─────────────────────────────────────────────────────── */}

      {/* Submitting re-analysis */}
      {reanalyzing && (
        <div
          className="flex items-center gap-3 px-5 py-2.5 bg-accent/10
                        border-b border-accent/20 text-sm text-accent shrink-0"
        >
          <div
            className="w-3.5 h-3.5 border-2 border-accent border-t-transparent
                          rounded-full animate-spin shrink-0"
          />
          Submitting re-analysis job...
        </div>
      )}

      {/* Analysis phase 1 */}
      {isAnalyzing && (
        <div
          className="flex items-center gap-3 px-5 py-2.5 bg-warning/10
                        border-b border-warning/20 text-sm text-warning shrink-0"
        >
          <div
            className="w-3.5 h-3.5 border-2 border-warning border-t-transparent
                          rounded-full animate-spin shrink-0"
          />
          Analyzing repository — building dependency graph...
        </div>
      )}

      {/* Summarization running / paused */}
      {(isSummarizing || isPaused) && (
        <div
          className="flex items-center justify-between px-5 py-2.5 bg-accent/10
                        border-b border-accent/20 shrink-0"
        >
          <div className="flex items-center gap-3 text-sm text-accent">
            <div
              className="w-3.5 h-3.5 border-2 border-accent border-t-transparent
                            rounded-full animate-spin shrink-0"
            />
            {isPaused
              ? "Summarization paused — open Jobs panel to resume"
              : "Summarization running in background..."}
          </div>
          <span className="text-xs text-muted">
            {job?.summarizationCompleted ?? 0} /{" "}
            {job?.summarizationTotal ?? "?"} nodes
          </span>
        </div>
      )}

      {/* Summaries ready */}
      {summaryDone && (
        <div
          className={`flex items-center justify-between px-5 py-2.5 shrink-0 border-b
                   ${
                     skippedSummarization
                       ? "bg-accent/10 border-accent/20"
                       : "bg-success/10 border-success/20"
                   }`}
        >
          <span
            className={`text-sm ${skippedSummarization ? "text-accent" : "text-success"}`}
          >
            {skippedSummarization
              ? "Analysis complete — no summaries generated (Previous Summaries used if any)"
              : "Summaries ready"}
          </span>
          <button
            onClick={handleReload}
            disabled={reloadPending}
            className={`flex items-center gap-2 text-xs px-3 py-1 rounded-lg border
                  transition-colors disabled:opacity-60
                  ${
                    skippedSummarization
                      ? "border-accent/30 text-accent hover:bg-accent/10"
                      : "border-success/30 text-success hover:bg-success/10"
                  }`}
          >
            {reloadPending && (
              <div
                className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin
                         ${skippedSummarization ? "border-accent" : "border-success"}`}
              />
            )}
            {reloadPending ? "Reloading..." : "Reload Graph"}
          </button>
        </div>
      )}

      {/* ── Canvas area ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {isAnalyzing && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div
                className="w-10 h-10 border-2 border-accent border-t-transparent
                              rounded-full animate-spin mx-auto mb-4"
              />
              <p className="text-sm text-muted">
                Waiting for analysis to complete...
              </p>
            </div>
          </div>
        )}

        {!isAnalyzing && graphLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div
                className="w-10 h-10 border-2 border-accent border-t-transparent
                              rounded-full animate-spin mx-auto mb-4"
              />
              <p className="text-sm text-muted">Loading graph...</p>
            </div>
          </div>
        )}

        {/* Canvas — hidden while reanalyzing to avoid showing stale graph */}
        {!isAnalyzing && !graphLoading && !reanalyzing && graph && (
          <div className="absolute inset-0">
            <GraphCanvas
              ref={canvasRef}
              nodes={visibleNodes}
              edges={visibleEdges}
              onNodeClick={(id) => {
                if (id) handleNodeFocus(id);
                else setFocusedNodeId(null);
              }}
            />

            {/* Sidebar */}
            <Sidebar
              graph={graph}
              meta={meta}
              graphId={graphId}
              visibleNodes={visibleNodes}
              highlightedIds={highlightedIds}
              onNodeFocus={handleNodeFocus}
              onDiffActivate={handleDiffActivate}
              onDiffClear={handleDiffClear}
            />

            {/* NodeDetailPanel */}
            {focusedNodeId && (
              <NodeDetailPanel
                nodeId={focusedNodeId}
                graphId={graphId}
                commitHash={graph.gitInfo.commitHash}
                nodesById={graph.nodesById}
                edges={graph.edges}
                onClose={() => {
                  setFocusedNodeId(null);
                  clearHighlight();
                }}
                onNodeFocus={handleNodeFocus}
                onHighlight={highlight}
                onClearHighlight={clearHighlight}
                diffInfo={focusedNodeDiffInfo}
                diffFromHash={diffMode ? diffFromHash : undefined}
              />
            )}
          </div>
        )}

        {!isAnalyzing && !graphLoading && !graph && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted text-sm">Graph not found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ReanalyzeButton ──────────────────────────────────────────────────────────

function ReanalyzeButton({
  repoPath,
  disabled,
  onReanalyze,
}: {
  repoPath: string;
  disabled: boolean;
  onReanalyze: (skipSummarization: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center shrink-0">
      {/* Main button */}
      <button
        onClick={() => onReanalyze(false)}
        disabled={disabled}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-l-lg
                   border-y border-l border-border text-xs font-medium
                   text-muted hover:text-primary hover:border-accent/40
                   hover:bg-accent/5 transition-all disabled:opacity-40"
        title={`Re-analyze ${repoPath}`}
      >
        <HiOutlineArrowPath size={11} />
        Re-analyze
      </button>

      {/* Chevron */}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center justify-center px-1.5 py-1.5 rounded-r-lg
                   border border-l-border/20 border-border text-xs
                   text-muted hover:text-primary hover:border-accent/40
                   hover:bg-accent/5 transition-all disabled:opacity-40"
      >
        <HiOutlineChevronDown
          size={10}
          className={`transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 rounded-xl py-1 w-52
                        bg-surface border border-border shadow-xl z-50"
        >
          <button
            onClick={() => {
              onReanalyze(false);
              setOpen(false);
            }}
            className="w-full flex flex-col gap-0.5 px-3 py-2.5 text-left
                       hover:bg-elevated transition-colors"
          >
            <span className="text-xs font-medium text-primary">
              Re-analyze + Summarize
            </span>
            <span className="text-xs text-dim">
              Full analysis with LLM summaries
            </span>
          </button>

          <button
            onClick={() => {
              onReanalyze(true);
              setOpen(false);
            }}
            className="w-full flex flex-col gap-0.5 px-3 py-2.5 text-left
                       hover:bg-elevated transition-colors"
          >
            <span className="text-xs font-medium text-primary">
              Re-analyze only
            </span>
            <span className="text-xs text-dim">
              Skip summarization, graph only
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
