import path from "path";
import fs from "fs";
import { parseRepo } from "../parser/index";
import { analyzeFilesystem } from "../filesystem/index";
import { analyzeFingerprint } from "../fingerprint/index";
import { detectEdges } from "../graph/index";
import { scoreAndFilter } from "../scoring/index";

const repoPath = process.argv[2];
const outputPath = process.argv[3] || "./graph-output.json";

if (!repoPath) {
  console.error(
    "Usage: npx ts-node src/debug/exportGraph.ts <repo-path> [output.json]"
  );
  process.exit(1);
}

const absRepoPath = path.resolve(repoPath);

async function main() {
  console.log(`\n🔍 Analyzing: ${absRepoPath}`);

  // ─── Pipeline ────────────────────────────────────────────────
  const fingerprint = analyzeFingerprint(absRepoPath);
  const routeNodes  = analyzeFilesystem(absRepoPath, fingerprint);
  const { nodes }   = parseRepo(absRepoPath);

  const { edges, ghostNodes } = detectEdges(
    nodes,
    routeNodes,
    absRepoPath,
    fingerprint
  );

  const allNodes = [...nodes, ...ghostNodes];

  // ─── Scoring ─────────────────────────────────────────────────
  const {
    filteredNodes,
    filteredEdges,
    nodeScores,
    stats,
  } = scoreAndFilter(allNodes, edges);

  // Group edges by type for efficiency (avoids repeated filtering)
  const groupedEdges: Record<string, any[]> = filteredEdges.reduce((acc: Record<string, any[]>, edge: any) => {
    const type = edge.type;
    acc[type] ??= [];
    acc[type].push(edge);
    return acc;
  }, {} as Record<string, any[]>);

  // ─── Build graph JSON ─────────────────────────────────────────
  const graph = {
    meta: {
      analyzedAt:   new Date().toISOString(),
      repoPath:     absRepoPath,
      framework:    fingerprint.framework,
      projectType:  fingerprint.projectType,
      language:     fingerprint.language,
      totalNodes:   filteredNodes.length,
      totalEdges:   filteredEdges.length,
      totalRoutes:  routeNodes.length,
    },

    // Scoring stats
    scoringStats: {
      nodesBeforeFilter:  stats.totalNodesBeforeFilter,
      nodesAfterFilter:   stats.totalNodesAfterFilter,
      edgesBeforeFilter:  stats.totalEdgesBeforeFilter,
      edgesAfterFilter:   stats.totalEdgesAfterFilter,
      removedNodes:       stats.removedNodeCount,
      removedEdges:       stats.removedEdgeCount,
      averageScore:       stats.averageNodeScore,
      topScoringNodes:    stats.topScoringNodes,
    },

    // Summary counts per type
    summary: {
      nodes: countByKey(filteredNodes, "type"),
      edges: countByKey(filteredEdges, "type"),
    },

    // All nodes — with their scores
    nodes: filteredNodes.map((n) => ({
      id:       n.id,
      name:     n.name,
      type:     n.type,
      file:     n.filePath,
      score:    parseFloat((nodeScores.get(n.id) ?? 0).toFixed(2)),
      lines:    `${n.startLine}-${n.endLine}`,
      parentFile: n.parentFile,
      metadata: n.metadata,
    })),

    // All routes
    routes: routeNodes.map((r) => {
      if (r.type === "BACKEND_ROUTE") {
        return {
          type:      r.type,
          method:    r.httpMethod,
          path:      r.urlPath,
          handler:   r.handlerName,
          isDynamic: r.isDynamic,
          framework: r.framework,
        };
      }
      return {
        type:      r.type,
        path:      r.urlPath,
        file:      r.filePath,
        isDynamic: r.isDynamic,
      };
    }),

    // Edges grouped by type
    edges: {
      CALLS:      formatEdges(groupedEdges.CALLS ?? []),
      IMPORTS:    formatEdges(groupedEdges.IMPORTS ?? []),
      READS_FROM: formatEdges(groupedEdges.READS_FROM ?? []),
      WRITES_TO:  formatEdges(groupedEdges.WRITES_TO ?? []),
      PROP_PASS:  formatEdges(groupedEdges.PROP_PASS ?? []),
      EMITS:      formatEdges(groupedEdges.EMITS ?? []),
      LISTENS:    formatEdges(groupedEdges.LISTENS ?? []),
      GUARDS:     formatEdges(groupedEdges.GUARDS ?? []),
    },

    // Adjacency list — one entry per node
    adjacency: buildAdjacency(filteredNodes, filteredEdges, nodeScores),
  };

  // ─── Write to file ────────────────────────────────────────────
  const absOutputPath = path.resolve(outputPath);
  fs.writeFileSync(absOutputPath, JSON.stringify(graph, null, 2));

  console.log(`\n✅ Graph exported to: ${absOutputPath}`);
  console.log(`\n📊 Final Summary:`);
  console.log(`   Nodes:  ${filteredNodes.length} (was ${stats.totalNodesBeforeFilter})`);
  console.log(`   Routes: ${routeNodes.length}`);
  console.log(`   Edges:  ${filteredEdges.length} (was ${stats.totalEdgesBeforeFilter})`);
  console.log(`\n📂 Edge breakdown:`);

  for (const [type, count] of Object.entries(graph.summary.edges)) {
    console.log(`   ${type.padEnd(15)} ${count}`);
  }

  console.log(`\n🏆 Top scoring nodes:`);
  for (const n of stats.topScoringNodes) {
    console.log(
      `   ${n.score.toFixed(2).padStart(5)}  [${n.type.padEnd(12)}]  ${n.name}`
    );
  }

  console.log(`\n📁 Top scoring files:`);
  const topFiles = allNodes
    .filter((n) => n.type === "FILE")
    .map((n) => ({
      name: n.name,
      type: n.type,
      score: nodeScores.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  for (const f of topFiles) {
    console.log(
      `   ${f.score.toFixed(2).padStart(5)}  [${f.type.padEnd(12)}]  ${f.name}`
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countByKey(arr: any[], key: string): Record<string, number> {
  return arr.reduce((counts: Record<string, number>, item) => {
    const val = item[key];
    counts[val] = (counts[val] || 0) + 1;
    return counts;
  }, {});
}

function formatEdges(edges: any[]): any[] {
  return edges.map((e) => ({
    from:     shortId(e.from),
    to:       shortId(e.to),
    fromFull: e.from,
    toFull:   e.to,
    ...e.metadata,
  }));
}

function shortId(id: string): string {
  if (id.includes("::")) return id.split("::")[1];
  if (id.startsWith("ghost::")) return id.replace("ghost::", "👻 ");
  return id;
}

function buildAdjacency(
  nodes: any[],
  edges: any[],
  nodeScores: Map<string, number>
): Record<string, any> {
  const adj: Record<string, any> = {};

  for (const node of nodes) {
    adj[node.name] = {
      id:         node.id,
      type:       node.type,
      score:      parseFloat((nodeScores.get(node.id) ?? 0).toFixed(2)),
      outgoing:   [],
      incoming:   [],
    };
  }

  for (const edge of edges) {
    const fromName = shortId(edge.from);
    const toName   = shortId(edge.to);

    if (adj[fromName]) {
      adj[fromName].outgoing.push({
        type: edge.type,
        to:   toName,
        ...edge.metadata,
      });
    }

    if (adj[toName]) {
      adj[toName].incoming.push({
        type: edge.type,
        from: fromName,
        ...edge.metadata,
      });
    }
  }

  // Remove nodes with no connections
  for (const name of Object.keys(adj)) {
    if (
      adj[name].outgoing.length === 0 &&
      adj[name].incoming.length === 0
    ) {
      delete adj[name];
    }
  }

  return adj;
}

main().catch(console.error);