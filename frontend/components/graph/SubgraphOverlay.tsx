import { bfsReachable, buildAdjacency } from "@/lib/graphAlgo";
import {
  CodeEdge,
  CodeNode,
  GraphResponse,
  NodeType,
  OverlayGraph,
} from "@/lib/types";
import fcose from "cytoscape-fcose";
import { useEffect, useMemo, useRef } from "react";
import { HiOutlineArrowLeft } from "react-icons/hi2";
import { toElements } from "./cytoscopeUtils";
import cytoscape from "cytoscape";
import {
  getCytoscapeStyles,
  getLayoutConfig,
} from "./cytoscapeConfig";
import OverlayFilterBar from "./OverlayFilterBar";

cytoscape.use(fcose);

interface SubgraphOverlayProps {
  stack: OverlayGraph[];
  current: OverlayGraph;
  graph: GraphResponse;
  nodesById: Record<string, CodeNode>;
  onNavigate: (nodeId: string, nodeType?: NodeType) => void;
  onBack: () => void;
  onClose: () => void;
  onUpdateFilters: (updates: Partial<OverlayGraph>) => void;
  onNodeSelect: (nodeId: string) => void; //it will open nodedetails panel
}

export default function SubgraphOverlay({
  stack,
  current,
  graph,
  nodesById,
  onNavigate,
  onBack,
  onClose,
  onUpdateFilters,
  onNodeSelect,
}: SubgraphOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // comute the subgraph (full BFS + full reverse BFS)
  const { subgraphNodes, subgraphEdges } = useMemo(() => {
  const { adj, radj } = buildAdjacency(graph.edges);

  let allIds: Set<string>;




  if (current.mode === "khop") {
    const depth = current.hopDepth!;
    const forward = bfsReachable(current.rootNodeId, adj, depth);
    allIds = new Set([
      current.rootNodeId,
      ...[...forward].map(r => r.nodeId),
    ]);
  } 
  else if (current.mode === "blast") {
    const depth = current.hopDepth!;
    const backward = bfsReachable(current.rootNodeId, radj, depth);
    allIds = new Set([
      current.rootNodeId,
      ...[...backward].map(r => r.nodeId),
    ]);
  } 
  else {
    // full — merge forward + backward BFS
    const forward  = bfsReachable(current.rootNodeId, adj,  Infinity);
    const backward = bfsReachable(current.rootNodeId, radj,  Infinity);
    allIds = new Set([
      current.rootNodeId,
      ...[...forward].map(r => r.nodeId),
      ...[...backward].map(r => r.nodeId),
    ]);
  }




  const subgraphNodes: CodeNode[] = [];
  for (const id of allIds) {
    const node = nodesById[id];
    if (node && current.activeNodeTypes.includes(node.type))
      subgraphNodes.push(node);
  }

  const nodeIdSet = new Set(subgraphNodes.map(n => n.id));
  const subgraphEdges = graph.edges.filter(e =>
    current.activeEdgeTypes.includes(e.type) &&
    nodeIdSet.has(e.from) &&
    nodeIdSet.has(e.to)
  );

  return { subgraphNodes, subgraphEdges };
}, [current.rootNodeId, current.activeNodeTypes, current.activeEdgeTypes,
    current.mode, current.hopDepth, graph]);

  // nodesById comes from props — no need to recompute
  const breadcrumb = stack.map(
    (entry) => nodesById[entry.rootNodeId]?.name ?? entry.rootNodeId,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (subgraphNodes.length === 0) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(subgraphNodes, subgraphEdges),
      style: getCytoscapeStyles(current.rootNodeId),
      layout: getLayoutConfig(subgraphNodes.length),
      boxSelectionEnabled: false,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      autoungrabify: true,
      wheelSensitivity: 3,
      minZoom: 0.05,
      maxZoom: 4,
    });

    // After layout completes — zoom into root node
    cy.one("layoutstop", () => {
      const rootNode = cy.getElementById(current.rootNodeId);
      if (!rootNode.empty()) {
        cy.animate(
          {
            fit: { eles: rootNode, padding: 200 },
            easing: "ease-in-out-cubic",
          },
          { duration: 600 },
        );
      }
    });

    cy.on("tap", "node", (e) => {
      const nodeId = e.target.id();
      const nodeType = e.target.data("type") as NodeType;
      onNodeSelect(nodeId); // open NodeDetailPanel
      onNavigate(nodeId, nodeType); // push to overlay stack
    });

    cy.on("tap", (e) => {
      if (e.target === cy) onNodeSelect("");
    });

    return () => cy.destroy();
  }, [subgraphEdges, subgraphNodes]);

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "#13191f", zIndex: 20 }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 h-12 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                     transition-colors"
          style={{ color: "#859490" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#e1e2ea")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#859490")}
        >
          <HiOutlineArrowLeft size={14} />
          {stack.length <= 1 ? "Close" : "Back"}
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs overflow-hidden">
          {breadcrumb.map((name, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span style={{ color: "#3c4a46" }}>→</span>}
              <span
                style={{
                  color: i === breadcrumb.length - 1 ? "#2dd4bf" : "#859490",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                }}
              >
                {name}
              </span>
            </span>
          ))}
        </div>

        <OverlayFilterBar
          activeNodeTypes={current.activeNodeTypes}
          activeEdgeTypes={current.activeEdgeTypes}
          onApply={(nodeTypes, edgeTypes) =>
            onUpdateFilters({ activeNodeTypes: nodeTypes, activeEdgeTypes: edgeTypes })
          }
        />

        <div className="flex-1" />

        {/* Node count */}
        <span
          className="text-xs shrink-0"
          style={{ color: "#3c4a46", fontFamily: "monospace" }}
        >
          {subgraphNodes.length} nodes · {subgraphEdges.length} edges
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}
