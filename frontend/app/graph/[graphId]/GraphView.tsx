"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { useGraph, useJob, useGraphMeta, useAnalyze } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/lib/hooks";
import GraphCanvas, { GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import Sidebar from "@/components/graph/Sidebar";
import { EdgeType, NodeType, NodeDiff, RenderingBoundary } from "@/lib/types";
import FilterBar from "@/components/graph/FilterBar";
import { buildAdjacency, bfsReachable } from "@/lib/graphAlgo";
import { HiOutlineArrowPath, HiOutlineChevronDown, IoArrowBack } from "@/components/icons";
import { useOverlayGraph } from "@/lib/overlayGraph";
import {
  DEFAULT_EDGE_TYPES,
  DEFAULT_NODE_TYPES,
} from "@/components/graph/cytoscapeConfig";

// ── Code-split the optional surfaces ─────────────────────────────────────────
//
// Only the canvas is needed to open a graph. These three panels are opened on
// demand and each drags in a large dependency:
//
//   NodePanel       → highlight.js (11 grammars)
//   CodeFlow        → @xyflow/react + @xyflow/system + zustand + highlight.js
//   SubgraphOverlay → its own cytoscape instance + overlay filters
//
// Importing them statically made every cold open of /graph/<id> compile all of
// that (plus the old react-icons barrels) before the page could paint. Loading
// them lazily keeps the first compile small and defers the rest to first use.
const NodePanel = dynamic(() => import("@/components/graph/NodePanel"), {
  ssr: false,
});
const CodeFlow = dynamic(() => import("@/components/graph/CodeFlow"), {
  ssr: false,
});
const SubgraphOverlay = dynamic(
  () => import("@/components/graph/SubgraphOverlay"),
  { ssr: false },
);

interface Props {
  params: Promise<{ graphId: string }>;
}

export default function GraphView({ params }: Props) {
  const { graphId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const analyze = useAnalyze();
  const overlay = useOverlayGraph();
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

  //  State 
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [codeStack, setCodeStack] = useState<string[]>([]);
  const [activeNodeTypes, setActiveNodeTypes] =
    useState<NodeType[]>(DEFAULT_NODE_TYPES);
  const [activeEdgeTypes, setActiveEdgeTypes] =
    useState<EdgeType[]>(DEFAULT_EDGE_TYPES);
  const [userThreshold, setUserThreshold] = useState<number | null>(null);
  const [showRouteNodes, setShowRouteNodes] = useState(false);
  const [routeHopDepth, setRouteHopDepth] = useState(2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [activeBoundaries, setActiveBoundaries] = useState<Array<RenderingBoundary | "unset">>(["client", "server", "unset"]);
  const [diffMode, setDiffMode] = useState(false);
  const [diffData, setDiffData] = useState<NodeDiff | null>(null);
  const [diffFromHash, setDiffFromHash] = useState<string>("");
  const [diffToHash, setDiffToHash] = useState<string>("");

  // We will only be showing top 500 scoring nodes when the graph initially renders, to reduce clutteredness
  const autoThreshold = useMemo((): number => {
    if (!graph) return 0;
    if (graph.nodes.length <= 500) {
      return 0;
    }
    const start = new Date().getTime();
    const sorted = graph.nodes.map((n) => n.score ?? 0).sort((a, b) => b - a);
    const threshold = sorted[499] ?? 0;
    console.log("Setting score threshold as => ", threshold);
    const end = new Date().getTime();
    console.log("Total time taken for sorting => ", end - start);
    return threshold;
  }, [graph?.graphId]);

  const scoreThreshold = userThreshold !== null ? userThreshold : autoThreshold;

  //  Highlight helpers 

  function highlight(ids: string[]) {
    setHighlightedIds(ids);
    canvasRef.current?.highlightNodes(ids);
  }

  function clearHighlight() {
    setHighlightedIds([]);
    canvasRef.current?.clearHighlight();
  }

  //  Reload — clear pending when refetch completes 

  useEffect(() => {
    if (!graphFetching && reloadPending) {
      setReloadPending(false);
    }
  }, [graphFetching, reloadPending]);

  //  Diff handlers 

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

  //  Diff node lookup maps 

  const diffNodeMap = useMemo(() => {
    if (!diffData) return null;
    const added = new Set(diffData.added.map((n) => n.nodeId));
    const removed = new Set(diffData.removed.map((n) => n.nodeId));
    const scoreChanged = new Map(
      diffData.scoreChanged.map((n) => [n.nodeId, n]),
    );
    const moved = new Map(diffData.moved.map((n) => [n.nodeId, n]));
    const codeChanged = new Map(
      (diffData.codeChanged ?? []).map((n) => [n.nodeId, n]),
    );
    return { added, removed, scoreChanged, moved, codeChanged };
  }, [diffData]);

  //  Diff color overrides 

  const diffColorOverrides = useMemo((): Record<string, string> => {
    if (!diffNodeMap) return {};
    const overrides: Record<string, string> = {};
    for (const id of diffNodeMap.added) overrides[id] = "#3fb950";
    for (const id of diffNodeMap.scoreChanged.keys()) overrides[id] = "#d29922";
    for (const id of diffNodeMap.moved.keys()) overrides[id] = "#818cf8";
    for (const id of diffNodeMap.codeChanged.keys()) overrides[id] = "#f59e0b";
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

  //  Route reachable set 

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

  //  Visible nodes 

  const visibleNodes = useMemo(() => {
    if (!graph) return [];

    const seen = new Set<string>();

    const base = graph.nodes.filter((n) => {
      if (seen.has(n.id)) return false; // ← deduplicate
      seen.add(n.id);

      if (routeReachableIds.has(n.id)) return true;
      if (!activeNodeTypes.includes(n.type)) return false;
      if ((n.score ?? 0) < scoreThreshold!) return false;

      const rb = (n.metadata?.renderingBoundary as string) ?? "unset";
      if (!activeBoundaries.includes(rb as any)) return false;

      return true;
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
    activeBoundaries,
    diffMode,
    diffData,
    diffNodeMap,
  ]);

  //  Visible edges 

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

  //  Update canvas when filters change 

  // Debounced: a filter drag used to fire one canvas rebuild per pointer move.
  useEffect(() => {
    if (!graph) return;
    const id = setTimeout(() => {
      canvasRef.current?.updateElements(visibleNodes, visibleEdges);
    }, 180);
    return () => clearTimeout(id);
  }, [visibleNodes, visibleEdges, graph]);

  //  Fullscreen 

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

  const activeNodeTypesRef = useRef(activeNodeTypes);
  const activeEdgeTypesRef = useRef(activeEdgeTypes);

  useEffect(() => {
    activeNodeTypesRef.current = activeNodeTypes;
  }, [activeNodeTypes]);
  useEffect(() => {
    activeEdgeTypesRef.current = activeEdgeTypes;
  }, [activeEdgeTypes]);

  //  Route toggle 

  function handleRouteToggle() {
    if (showRouteNodes) {
      setShowRouteNodes(false);
      clearHighlight();
    } else setShowRouteNodes(true);
  }

  //  Reset 

  function handleReset() {
    setActiveNodeTypes(DEFAULT_NODE_TYPES);
    setActiveEdgeTypes(DEFAULT_EDGE_TYPES);
    setUserThreshold(null);
    setShowRouteNodes(false);
    setRouteHopDepth(2);
    setActiveBoundaries(["client", "server", "unset"]);
    clearHighlight();
  }

  //  Reload 

  function handleReload() {
    setReloadPending(true);
    setSummaryDismissed(true);
    queryClient.invalidateQueries({
      queryKey: keys.graph(graphId, commitHash),
    });
  }

  //  Re-analyze 

  async function handleReanalyze(skipSummarization = false, forceSummarize = false) {
    const repoPath = graph?.repoPath ?? meta?.repoPath;
    if (!repoPath) return;
    setReanalyzing(true);
    try {
      const job = await analyze.mutateAsync({ repoPath, skipSummarization, forceSummarize });
      setReanalyzing(false);
      router.replace(
        `/graph/${graphId}?jobId=${job.jobId}&pSkippedSummarization=${skipSummarization}`,
      );
    } catch {
      setReanalyzing(false);
    }
  }

  //  Node focus 

  // One entry point for "show me this node".
  //
  // Clicking a node while an overlay is already open must STACK, not replace:
  // replacing threw away the trail the user had just walked and there was no
  // way back. `navigate` pushes onto the overlay stack, which the overlay's own
  // Back button and the panel's Back chip both pop.
  function handleNodeFocus(id: string) {
    if (!id) return;
    setFocusedNodeId(id);
    const node = graph?.nodesById[id];

    if (overlay.isOpen) {
      if (overlay.current?.rootNodeId !== id) overlay.navigate(id, node?.type as NodeType);
      return;
    }

    canvasRef.current?.focusNode(id);
    overlay.open(id, node?.type as NodeType, {
      activeNodeTypes: activeNodeTypesRef.current,
      activeEdgeTypes: activeEdgeTypesRef.current,
    });
  }

  /** Blast radius / k-hop from the focused node, straight into the overlay. */
  function handleExplore(mode: "khop" | "blast", depth: number) {
    if (!focusedNodeId) return;
    const node = graph?.nodesById[focusedNodeId];
    const filters = {
      activeNodeTypes: activeNodeTypesRef.current,
      activeEdgeTypes: activeEdgeTypesRef.current,
    };
    if (overlay.isOpen && overlay.current?.rootNodeId === focusedNodeId) {
      overlay.updateFilters({ mode, hopDepth: depth });
    } else {
      overlay.open(focusedNodeId, node?.type as NodeType, filters, { mode, hopDepth: depth });
    }
  }

  /** Pop one overlay, keeping the panel on whatever node we land back on. */
  function handleOverlayBack() {
    const prev = overlay.overlayStack[overlay.overlayStack.length - 2];
    overlay.back();
    setFocusedNodeId(prev ? prev.rootNodeId : null);
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
      {/*  Navbar  */}
      {/* z-50 so the Control Center panel can never slide under the
          subgraph overlay (which is z-20 inside the canvas area). */}
      <nav
        className="border-b border-border px-5 flex items-center gap-3 shrink-0 bg-base/95 backdrop-blur-sm"
        style={{ position: "relative", zIndex: 50, minHeight: 52 }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-primary
                     transition-colors shrink-0"
        >
          <IoArrowBack />
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
            graph={graph}
            activeNodeTypes={activeNodeTypes}
            activeEdgeTypes={activeEdgeTypes}
            scoreThreshold={scoreThreshold}
            onApply={(nodes, edges, score) => {
              setActiveNodeTypes(nodes);
              setActiveEdgeTypes(edges);
              setUserThreshold(score);
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
            activeBoundaries={activeBoundaries}
            onBoundaryChange={setActiveBoundaries}
            onReset={handleReset}
          />
        )}
      </nav>

      {/*  Banners  */}

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

      {/*  Canvas area  */}
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
                          focusedNodeId={focusedNodeId}
              onNodeClick={(id) => {
                if (id) {
                  handleNodeFocus(id);
                } else {
                  setFocusedNodeId(null);
                  overlay.close();
                }
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

            {/* Node panel */}
            {focusedNodeId && graph?.nodesById[focusedNodeId] && (
              <NodePanel
                node={graph.nodesById[focusedNodeId]}
                graphId={graphId}
                commitHash={graph.gitInfo.commitHash}
                graphLanguage={graph.fingerprint?.language as string | undefined}
                nodesById={graph.nodesById}
                edges={graph.edges}
                onClose={() => {
                  setFocusedNodeId(null);
                  setCodeStack([]);
                  clearHighlight();
                  overlay.close();
                }}
                onNodeFocus={handleNodeFocus}
                onOpenCode={(id) => setCodeStack((prev) => (prev[0] === id ? prev : [id]))}
                onExplore={handleExplore}
                overlayDepth={Math.max(0, overlay.overlayStack.length - 1)}
                onOverlayBack={handleOverlayBack}
              />
            )}

            {codeStack.length > 0 && graph && (
              <CodeFlow
                graphId={graphId}
                commitHash={graph.gitInfo.commitHash}
                graphLanguage={graph.fingerprint?.language as string | undefined}
                nodesById={graph.nodesById}
                edges={graph.edges}
                rootNodeId={codeStack[0]}
                activeNodeId={focusedNodeId}
                onClose={() => setCodeStack([])}
                onFocusNode={handleNodeFocus}
                onOpenCode={(id) => setCodeStack([id])}
              />
            )}

            {overlay.isOpen && overlay.current && (
              <SubgraphOverlay
                stack={overlay.overlayStack}
                current={overlay.current}
                graph={graph}
                nodesById={graph.nodesById}
                onNavigate={overlay.navigate}
                onBack={overlay.back}
                onClose={overlay.close}
                onUpdateFilters={overlay.updateFilters}
                onNodeSelect={setFocusedNodeId}
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

//  ReanalyzeButton 

function ReanalyzeButton({
  repoPath,
  disabled,
  onReanalyze,
}: {
  repoPath: string;
  disabled: boolean;
  onReanalyze: (skipSummarization: boolean, forceSummarize?: boolean) => void;
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
              setOpen(false);
              // Re-summarize from Scratch discards existing summaries — confirm first
              if (
                confirm(
                  "Re-summarize from Scratch will discard the existing summaries for the latest commit and re-run the full analysis + summarization (LLM calls).\n\nContinue?"
                )
              ) {
                onReanalyze(false, true);
              }
            }}
            className="w-full flex flex-col gap-0.5 px-3 py-2.5 text-left
                       hover:bg-elevated transition-colors"
          >
            <span className="text-xs font-medium text-primary">
              Re-summarize from Scratch
            </span>
            <span className="text-xs text-dim">
              Fresh analysis + re-summary, discards cached summaries
            </span>
          </button>

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
