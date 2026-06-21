// Shared query core. Pure functions over the graph that return plain data and
// throw Error on not-found. BOTH the MCP tools (src/mcp/tools.ts) and the CLI
// query commands adapt over these, so agent-via-MCP and agent-via-CLI behavior
// never drift. The MCP wraps results in content blocks; the CLI formats them.
//
// (graphCache + the shaping helpers currently live under src/mcp; they are
//  shared infra and may relocate to src/core later — imports are the only thing
//  that would change.)

import fs from "node:fs";
import path from "node:path";
import {
  storage,
  analyzePipeline,
  getBlastRadius,
  getKHop,
  getSubgraph,
  findCycles,
  getNodeCode,
} from "devlensio";
import type { EdgeType } from "devlensio";
import { getContext, invalidate } from "../mcp/graphCache.js";
import {
  toCompact,
  pickSummaries,
  SEVERITY_RANK,
  type Severity,
  type SummaryKind,
} from "../mcp/helpers.js";

//  shared internals 

type Ctx = NonNullable<ReturnType<typeof getContext>>;

function requireContext(graphId: string, commitHash?: string): Ctx {
  const ctx = getContext(graphId, commitHash);
  if (!ctx) throw new Error(`Graph not found: ${graphId}`);
  return ctx;
}

const hitRef = (ctx: Ctx, nodeId: string, viaEdge: string) => {
  const n = ctx.index.nodesById.get(nodeId);
  return { id: nodeId, name: n?.name, type: n?.type, filePath: n?.filePath, viaEdge };
};

// Shapes a blast-radius / k-hop result into compact JSON with truncation flags.
export const formatTraversal = (ctx: Ctx, res: ReturnType<typeof getBlastRadius>) => ({
  seedId: res.seedId,
  direction: res.direction,
  truncated: res.truncated,
  stoppedAtRadius: res.stoppedAtRadius,
  hop1Count: res.hop1Count,
  radiusUsed: res.radiusUsed,
  count: res.hits.length,
  nodes: res.hits.map((h) => {
    const n = ctx.index.nodesById.get(h.nodeId);
    return { ...(n ? toCompact(n) : { id: h.nodeId }), hop: h.hop, viaEdge: h.viaEdge };
  }),
});

//  discovery / orientation 

export function listRepos() {
  return storage.listGraphs();
}

export function repoOverview(graphId: string, commitHash?: string) {
  const meta = storage.getGraphMeta(graphId);
  const ctx = getContext(graphId, commitHash);
  if (!meta || !ctx) throw new Error(`Graph not found: ${graphId}`);
  return {
    graphId,
    fingerprint: meta.fingerprint,
    routeCount: meta.routes.length,
    commitCount: meta.commits.length,
    stats: {
      totalNodes: ctx.result.stats.totalNodesAfterFilter,
      totalEdges: ctx.result.stats.totalEdgesAfterFilter,
    },
    topNodes: ctx.result.stats.topScoringNodes,
    topFiles: ctx.result.stats.topScoringFiles,
  };
}

//  search / filter 

export interface FindNodesFilters {
  name?: string;
  nodeIds?: string[];
  nodeTypes?: string[];
  filePath?: string;
  dir?: string;
  minScore?: number;
  severity?: Severity;
  limit?: number;
}

export function findNodes(graphId: string, f: FindNodesFilters = {}, commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);

  // Exact batch fetch short-circuits filters
  if (f.nodeIds?.length) {
    const found = f.nodeIds
      .map((id) => ctx.index.nodesById.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map(toCompact);
    return { total: found.length, nodes: found };
  }

  const nameQ = f.name?.toLowerCase();
  const typeSet = f.nodeTypes ? new Set(f.nodeTypes) : null;
  const minSev = f.severity ? SEVERITY_RANK[f.severity] : 0;

  let matched = ctx.result.allNodes.filter((n) => {
    if (nameQ && !n.name.toLowerCase().includes(nameQ)) return false;
    if (typeSet && !typeSet.has(n.type)) return false;
    if (f.filePath && n.filePath !== f.filePath) return false;
    if (f.dir && !n.filePath.startsWith(f.dir.replace(/\/$/, "") + "/")) return false;
    if (f.minScore !== undefined && Number(n.score ?? 0) < f.minScore) return false;
    if (minSev > 0 && SEVERITY_RANK[(n.security?.severity ?? "none") as Severity] < minSev) return false;
    return true;
  });

  const total = matched.length;
  matched = matched
    .sort((x, y) => Number(y.score ?? 0) - Number(x.score ?? 0))
    .slice(0, f.limit ?? 25);
  return { total, returned: matched.length, nodes: matched.map(toCompact) };
}

export function nodesInPath(graphId: string, p: string, nodeTypes?: string[], commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  const typeSet = nodeTypes ? new Set(nodeTypes) : null;

  let ids = ctx.index.nodesByFilePath.get(p); // exact file?
  if (!ids) {
    const prefix = p.replace(/\/$/, "") + "/"; // else folder prefix
    ids = [];
    for (const [fp, fileIds] of ctx.index.nodesByFilePath) {
      if (fp.startsWith(prefix)) ids.push(...fileIds);
    }
  }

  const nodes = ids
    .map((id) => ctx.index.nodesById.get(id)!)
    .filter((n) => !typeSet || typeSet.has(n.type))
    .map(toCompact);
  return { path: p, total: nodes.length, nodes };
}

//  node detail 

export type NodeInclude = "metadata" | "callers" | "callees" | SummaryKind;
const ALL_INCLUDE: NodeInclude[] = ["metadata", "callers", "callees", "technical", "business", "security"];

export function getNodeDetail(
  graphId: string,
  nodeId: string,
  include?: NodeInclude[],
  edgeTypes?: string[],
  commitHash?: string
) {
  const ctx = requireContext(graphId, commitHash);
  const node = ctx.index.nodesById.get(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const inc = new Set(include ?? ALL_INCLUDE);
  const out: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
    filePath: node.filePath,
    lines: `${node.startLine}-${node.endLine}`,
    score: Math.round(Number(node.score ?? 0)),
  };

  if (inc.has("metadata")) out.metadata = node.metadata;

  const kinds = (["technical", "business", "security"] as SummaryKind[]).filter((k) => inc.has(k));
  if (kinds.length) Object.assign(out, pickSummaries(node, kinds));

  // radius:1 is explicit → uncapped, returns ALL direct neighbors
  const opts = { radius: 1, edgeTypes: edgeTypes as EdgeType[] | undefined };
  if (inc.has("callees")) out.callees = getKHop(ctx.index, nodeId, opts).hits.map((h) => hitRef(ctx, h.nodeId, h.viaEdge));
  if (inc.has("callers")) out.callers = getBlastRadius(ctx.index, nodeId, opts).hits.map((h) => hitRef(ctx, h.nodeId, h.viaEdge));

  return out;
}

export function getSummariesFor(graphId: string, nodeIds: string[], include?: SummaryKind[], commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  const summaries = nodeIds.map((id) => {
    const n = ctx.index.nodesById.get(id);
    if (!n) return { id, error: "not found" };
    return { id, name: n.name, ...pickSummaries(n, include) };
  });
  return { summaries };
}

export function getNodeCodeFor(graphId: string, nodeId: string, commitHash?: string) {
  const meta = storage.getGraphMeta(graphId);
  const commit = commitHash ?? meta?.commits[0]?.commitHash;
  if (!commit) throw new Error(`No commits for graph: ${graphId}`);

  const node = getNodeCode(graphId, commit, nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const base = { id: nodeId, filePath: node.filePath, lines: `${node.startLine}-${node.endLine}` };
  if (node.rawCode) return { ...base, code: node.rawCode };

  // Fallback: rawCode dropped after summarization — read the range from disk.
  const ctx = requireContext(graphId, commitHash);
  const abs = path.join(ctx.result.repoPath, node.filePath);
  const code = fs.readFileSync(abs, "utf-8").split("\n").slice(node.startLine - 1, node.endLine).join("\n");
  return { ...base, code, source: "disk" as const };
}

//  security 

export function securityIssues(graphId: string, minSeverity: Severity = "low", limit = 50, commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  const minRank = SEVERITY_RANK[minSeverity];

  const issues = ctx.result.allNodes
    .filter((n) => SEVERITY_RANK[(n.security?.severity ?? "none") as Severity] >= minRank)
    .sort(
      (a, b) =>
        SEVERITY_RANK[(b.security?.severity ?? "none") as Severity] - SEVERITY_RANK[(a.security?.severity ?? "none") as Severity] ||
        Number(b.score ?? 0) - Number(a.score ?? 0)
    )
    .slice(0, limit)
    .map((n) => ({ ...toCompact(n), securitySummary: n.security?.summary }));
  return { total: issues.length, issues };
}

//  traversal 

export function blastRadius(graphId: string, nodeId: string, radius?: number, edgeTypes?: string[], commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  if (!ctx.index.nodesById.has(nodeId)) throw new Error(`Node not found: ${nodeId}`);
  return formatTraversal(ctx, getBlastRadius(ctx.index, nodeId, { radius, edgeTypes: edgeTypes as EdgeType[] | undefined }));
}

export function kHop(graphId: string, nodeId: string, radius?: number, edgeTypes?: string[], commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  if (!ctx.index.nodesById.has(nodeId)) throw new Error(`Node not found: ${nodeId}`);
  return formatTraversal(ctx, getKHop(ctx.index, nodeId, { radius, edgeTypes: edgeTypes as EdgeType[] | undefined }));
}

export function subgraph(graphId: string, seedNodeId: string, commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  const sg = getSubgraph(ctx.result.allNodes, ctx.result.allEdges, ctx.result.nodeScores, seedNodeId);
  if (!sg) throw new Error(`Seed node not found or not clustered: ${seedNodeId}`);
  return {
    clusterId: sg.clusterId,
    nodeCount: sg.nodes.length,
    edgeCount: sg.edges.length,
    nodes: sg.nodes.map(toCompact),
    edges: sg.edges,
  };
}

export function cycles(graphId: string, commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  const groups = findCycles(ctx.result.allNodes, ctx.result.allEdges);
  const enriched = groups.map((c) => ({
    size: c.size,
    nodes: c.nodeIds.map((id) => {
      const n = ctx.index.nodesById.get(id);
      return { id, name: n?.name, filePath: n?.filePath };
    }),
  }));
  return { total: enriched.length, cycles: enriched };
}

export function topNodes(graphId: string, limit = 25, commitHash?: string) {
  const ctx = requireContext(graphId, commitHash);
  const nodes = [...ctx.result.allNodes]
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .slice(0, limit)
    .map(toCompact);
  return { total: nodes.length, nodes };
}

//  analysis / change 

export async function analyzeRepo(repoPath: string, isGithubRepo = false) {
  const result = await analyzePipeline(repoPath, isGithubRepo);
  storage.saveGraph(result);
  invalidate(result.graphId); // drop any stale cached context for this graph
  return {
    graphId: result.graphId,
    commit: result.gitInfo.commitHash,
    branch: result.gitInfo.branch,
    fingerprint: result.fingerprint,
    stats: {
      totalNodes: result.stats.totalNodesAfterFilter,
      totalEdges: result.stats.totalEdgesAfterFilter,
    },
    topNodes: result.stats.topScoringNodes,
  };
}

export function analyzeChanges(graphId: string, from: string, to: string, radius = 1) {
  const diff = storage.diffCommits(graphId, from, to);
  if (!diff) throw new Error(`One or both commits not found for graph: ${graphId}`);

  const ctx = requireContext(graphId, to); // build index on the newer commit

  const changed = [...diff.added, ...diff.codeChanged];
  const impact = changed.map((d) => {
    const res = getBlastRadius(ctx.index, d.nodeId, { radius });
    return {
      nodeId: d.nodeId,
      name: d.name,
      impactedCount: res.hits.length,
      truncated: res.truncated,
      impacted: res.hits.map((h) => hitRef(ctx, h.nodeId, h.viaEdge)),
    };
  });

  return {
    summary: {
      added: diff.added.length,
      removed: diff.removed.length,
      codeChanged: diff.codeChanged.length,
      scoreChanged: diff.scoreChanged.length,
      unchanged: diff.unchanged,
    },
    diff,
    impact,
  };
}