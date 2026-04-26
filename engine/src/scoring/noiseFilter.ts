import type { CodeNode, CodeEdge } from "../types";

export interface FilterResult {
  nodes: CodeNode[];
  edges: CodeEdge[];
  removedNodeCount: number;
  removedEdgeCount: number;
}

// Default Thresholds — used when UI does not overrides, exposed as constants so contributors can tune them
export const DEFAULT_THRESHOLDS = {
  // Non-FILE nodes below this score are removed
  NODE_MIN_SCORE: 0,

  // FILE nodes below this score are removed
  // Lower than node threshold because files can be important
  // even if their children scored low (e.g. constants files)
  FILE_MIN_SCORE: 0,

  // Ghost nodes are never removed — they represent real connections
  GHOST_MIN_SCORE: 0,
};

// What the UI passes to override defaults
export interface FilterThresholds {
  nodeMinScore?: number;   // optional — falls back to default
  fileMinScore?: number;
  ghostMinScore?: number;
}

// Edge types that are never removed regardless of node scores
const PROTECTED_EDGE_TYPES = new Set([
  "GUARDS",
  "READS_FROM",
  "WRITES_TO",
  "HANDLES",
  "TESTS",
]);

// Node types that are never removed regardless of score
const PROTECTED_NODE_TYPES = new Set([
  "STATE_STORE",
  "GHOST",
  "ROUTE",
  "STORY",
  "TEST"
]);

export function filterNoise(
  nodes: CodeNode[],
  edges: CodeEdge[],
  nodeScores: Map<string, number>,
  thresholds?: FilterThresholds   // ← optional, UI can override
): FilterResult {
  const originalNodeCount = nodes.length;
  const originalEdgeCount = edges.length;

  // Merge UI overrides with defaults
  // UI only needs to pass what it wants to change
  const activeThresholds = {
    nodeMinScore:  thresholds?.nodeMinScore  ?? DEFAULT_THRESHOLDS.NODE_MIN_SCORE,
    fileMinScore:  thresholds?.fileMinScore  ?? DEFAULT_THRESHOLDS.FILE_MIN_SCORE,
    ghostMinScore: thresholds?.ghostMinScore ?? DEFAULT_THRESHOLDS.GHOST_MIN_SCORE,
  };

  // ─── Step 1 — Determine which nodes to keep ───────────────────
  const keepNodeIds = new Set<string>();

  for (const node of nodes) {
    const score = nodeScores.get(node.id) ?? 0;

    // Protected node types are always kept
    if (PROTECTED_NODE_TYPES.has(node.type)) {
      keepNodeIds.add(node.id);
      continue;
    }

    // FILE nodes use their own threshold
    if (node.type === "FILE") {
      if (score >= activeThresholds.fileMinScore) {
        keepNodeIds.add(node.id);
      }
      continue;
    }

    // All other nodes use the standard threshold
    if (score >= activeThresholds.nodeMinScore) {
      keepNodeIds.add(node.id);
    }
  }

  // ─── Step 2 — Rescue FILE nodes with kept children ────────────
  for (const node of nodes) {
    if (node.type !== "FILE") continue;
    if (keepNodeIds.has(node.id)) continue;

    const hasKeptChild = nodes.some(
      (n) => n.parentFile === node.id && keepNodeIds.has(n.id)
    );

    if (hasKeptChild) keepNodeIds.add(node.id);
  }

  // ─── Step 3 — Filter nodes ────────────────────────────────────
  const filteredNodes = nodes.filter((n) => keepNodeIds.has(n.id));

  for(const node of filteredNodes){
        // clean resolvedCalls...we are not cleaning metadata.calls because the calls are passed to the LLM for context. So js specific calls or built in method calls are important for context understanding context
        const resolvedCalls = node.metadata.resolvedCalls as {name: string; nodeId: string}[] | undefined;
        if(resolvedCalls?.length){
          node.metadata.resolvedCalls = resolvedCalls.filter(r => keepNodeIds.has(r.nodeId));
          
        }
  }


  // ─── Step 4 — Filter edges ────────────────────────────────────
  const filteredEdges = edges.filter((edge) => {
    if (PROTECTED_EDGE_TYPES.has(edge.type)) return true;
    return keepNodeIds.has(edge.from) && keepNodeIds.has(edge.to);
  });

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    removedNodeCount: originalNodeCount - filteredNodes.length,
    removedEdgeCount: originalEdgeCount - filteredEdges.length,
  };
}