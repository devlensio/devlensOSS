import type { CodeNode, CodeEdge } from "../types";
import { countConnections } from "./connectionCounter";
import { scoreNode } from "./nodeScorer";
import { scoreFile } from "./fileScorer";
import { filterNoise, type FilterResult, type FilterThresholds } from "./noiseFilter";

export interface ScoringResult {
  // All nodes and edges after noise filtering
  filteredNodes: CodeNode[];
  filteredEdges: CodeEdge[];

  // Score for every node — keyed by node id
  // Includes removed nodes so UI can show "why was this removed"
  nodeScores: Map<string, number>;

  // Stats for UI display and debugging
  stats: {
    totalNodesBeforeFilter: number;
    totalEdgesBeforeFilter: number;
    totalNodesAfterFilter: number;
    totalEdgesAfterFilter: number;
    removedNodeCount: number;
    removedEdgeCount: number;
    averageNodeScore: number;
    topScoringNodes: { name: string; score: number; type: string }[];
  };
}

export function scoreAndFilter(
  nodes: CodeNode[],
  edges: CodeEdge[],
  thresholds?: FilterThresholds,
  existingScores?: Map<string, number>  // when provided, skip Passes 1-4
): ScoringResult {

  let nodeScores: Map<string, number>;

  if (existingScores) {
    // Re-filter only — reuse scores from a previous analysis run
    nodeScores = existingScores;
  } else {
    console.log(`\n📊 Scoring ${nodes.length} nodes...`);

    // Pass 1 + 2 — Count connections and find maxima
    const { profiles, maxima } = countConnections(nodes, edges);

    //  Build childrenByFile map — O(n)
    // Maps fileNode.id → all child nodes in that file
    const childrenByFile = new Map<string, CodeNode[]>();

    for (const node of nodes) {
      if (node.type === "FILE") continue;
      if (!node.parentFile) continue;

      if (!childrenByFile.has(node.parentFile)) {
        childrenByFile.set(node.parentFile, []);
      }
      childrenByFile.get(node.parentFile)!.push(node);
    }

    // Pass 3 — Score all non-FILE nodes
    nodeScores = new Map<string, number>();

    for (const node of nodes) {
      if (node.type === "FILE") continue; // scored in pass 4

      const profile = profiles.get(node.id) ?? {
        incomingCalls: 0,
        outgoingCalls: 0,
        incomingReads: 0,
        incomingWrites: 0,
        incomingProps: 0,
        outgoingProps: 0,
        importedBy: 0,
      };

      const score = scoreNode(node, profile, maxima);
      nodeScores.set(node.id, score);
    }

    // ─── Pass 4 — Score FILE nodes using child scores ─────────────
    for (const node of nodes) {
      if (node.type !== "FILE") continue;

      const children = childrenByFile.get(node.id) ?? [];
      const profile = profiles.get(node.id) ?? {
        incomingCalls: 0,
        outgoingCalls: 0,
        incomingReads: 0,
        incomingWrites: 0,
        incomingProps: 0,
        outgoingProps: 0,
        importedBy: 0,
      };

      const score = scoreFile(node, children, nodeScores, profile.importedBy);
      nodeScores.set(node.id, score);
    }
  }



  // Pass 4.5 — Score ROUTE nodes from their handler 
  //
  // A route's significance is entirely determined by the handler it
  // delegates to. We find the HANDLES edge from each route node and
  // assign it the handler's score directly.
  //
  // If a route has multiple HANDLES edges (shouldn't happen but
  // defensive) we take the max. If no handler is resolved, the
  // route keeps its base type bonus score.

  // Build a quick lookup: routeNodeId → handler scores via HANDLES edges
  const handlesEdges = edges.filter(e => e.type === "HANDLES");

  for (const node of nodes) {
    if (node.type !== "ROUTE") continue;

    const handlerScores = handlesEdges
      .filter(e => e.from === node.id)
      .map(e => nodeScores.get(e.to) ?? 0);

    if (handlerScores.length === 0) continue;

    const handlerScore = Math.max(...handlerScores);
    nodeScores.set(node.id, handlerScore);
  }



  // ─── Pass 5 — Filter noise
  const filterResult: FilterResult = filterNoise(
    nodes,
    edges,
    nodeScores,
    thresholds
  );

  // ─── Build stats ──────────────────────────────────────────────
  const allScores = Array.from(nodeScores.values());
  const averageScore = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : 0;

  // Top 10 scoring nodes — useful for UI and debugging
  const topScoringNodes = nodes
    .filter((n) => n.type !== "FILE")
    .map((n) => ({
      name: n.name,
      type: n.type,
      score: nodeScores.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // ─── Log summary ──────────────────────────────────────────────
  console.log(`  Nodes before filter: ${nodes.length}`);
  console.log(`  Nodes after filter:  ${filterResult.nodes.length}`);
  console.log(`  Edges before filter: ${edges.length}`);
  console.log(`  Edges after filter:  ${filterResult.edges.length}`);
  console.log(`  Removed nodes:       ${filterResult.removedNodeCount}`);
  console.log(`  Removed edges:       ${filterResult.removedEdgeCount}`);
  console.log(`  Average score:       ${averageScore.toFixed(2)}`);
  console.log(`\n  🏆 Top scoring nodes:`);
  for (const n of topScoringNodes) {
    console.log(`    ${n.score.toFixed(2).padStart(5)}  [${n.type}]  ${n.name}`);
  }

  return {
    filteredNodes: filterResult.nodes,
    filteredEdges: filterResult.edges,
    nodeScores,
    stats: {
      totalNodesBeforeFilter: nodes.length,
      totalEdgesBeforeFilter: edges.length,
      totalNodesAfterFilter: filterResult.nodes.length,
      totalEdgesAfterFilter: filterResult.edges.length,
      removedNodeCount: filterResult.removedNodeCount,
      removedEdgeCount: filterResult.removedEdgeCount,
      averageNodeScore: parseFloat(averageScore.toFixed(2)),
      topScoringNodes,
    },
  };
}

