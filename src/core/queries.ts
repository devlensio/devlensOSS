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
import { execSync } from "node:child_process";
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
import { getContext as getGraphContext, invalidate } from "../mcp/graphCache.js";
import {
  toCompact,
  pickSummaries,
  SEVERITY_RANK,
  type Severity,
  type SummaryKind,
} from "../mcp/helpers.js";

//  shared internals 

type Ctx = NonNullable<ReturnType<typeof getGraphContext>>;

function requireContext(graphId: string, commitHash?: string): Ctx {
  const ctx = getGraphContext(graphId, commitHash);
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

//  Structured errors 

export class DevLensError extends Error {
  constructor(
    public code: string,
    message: string,
    public suggestedTool?: string,
    public suggestedArgs?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DevLensError";
  }
}

//  Token budget helpers 

const DEFAULT_BUDGET = 8000;

function estTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

interface FitToBudgetResult<T> {
  included: T[];
  truncated: boolean;
  droppedCount: number;
}

function fitToBudget<T>(
  items: T[],
  budget: number,
  perItemTokens: (item: T) => number
): FitToBudgetResult<T> {
  let used = 0;
  const included: T[] = [];
  for (const item of items) {
    const cost = perItemTokens(item);
    if (used + cost <= budget) {
      included.push(item);
      used += cost;
    } else {
      return { included, truncated: true, droppedCount: items.length - included.length };
    }
  }
  return { included, truncated: false, droppedCount: 0 };
}

// (withTimeout removed — see note below. The slow primitives it was wrapping
//  (cycles, securityIssues, blastRadius) are all synchronous and block the
//  event loop, so a Promise.race timer could never fire. Real protection
//  needs a worker thread; deferred. The `partial`/`skipped` fields on the
//  composed tools are therefore NOT emitted — the MCP descriptions must match.)

//  Keyword seeding (for get_context) 

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "both", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "just", "because", "but", "and", "or", "if", "while",
  "that", "this", "it", "its", "my", "your", "our", "their", "he",
  "she", "they", "we", "you", "me", "him", "her", "us", "them",
]);

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\w/$]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .slice(0, 8);
}

function seedCountFor(intent: string): number {
  switch (intent) {
    case "explain": return 1;
    case "architecture": return 8;
    case "impact": return 0;
    case "security": return 0;
    case "generic": return 5;
    default: return 5;
  }
}

//  Internal freshness / coverage (used by T1-T5 + exposed as S1/S2) 

function checkFreshnessInternal(graphId: string): {
  graphId: string;
  repoPath: string;
  head: string;
  latestAnalyzed: string;
  dirty: boolean;
  behind: boolean;
  recommendReanalyze: boolean;
  summariesCoverage: { summarized: number; total: number; pct: number; isCommitSummarized: boolean };
  stale: boolean;
  verdict: "fresh" | "stale";
} {
  const meta = storage.getGraphMeta(graphId);
  if (!meta) throw new DevLensError("GRAPH_NOT_FOUND", `Graph not found: ${graphId}`, "analyze", { path: "" });

  const repoPath = meta.repoPath;
  const latestCommit = meta.commits[0];
  const latestAnalyzed = latestCommit?.commitHash ?? "";
  let head = latestAnalyzed;
  let dirty = false;
  let behind = false;
  let hasGit;

  try {
    if (fs.existsSync(repoPath)) {
      head = execSync("git -C " + JSON.stringify(repoPath) + " rev-parse HEAD", { encoding: "utf-8", timeout: 5000 }).trim();
      const status = execSync("git -C " + JSON.stringify(repoPath) + " status --porcelain", { encoding: "utf-8", timeout: 5000 });
      dirty = status.trim().length > 0;
      behind = head !== latestAnalyzed;
      hasGit = true;
    }
  } catch {
    // Not a git repo or repoPath missing — degrade gracefully
    head = latestAnalyzed;
    dirty = false;
    behind = false;
    hasGit = false;
  }

  // Summaries coverage
  const ctx = getGraphContext(graphId, latestAnalyzed);
  const total = ctx?.result.allNodes.length ?? 0;
  const summarized = ctx?.result.allNodes.filter((n) => n.technicalSummary != null).length ?? 0;
  const pct = total > 0 ? Math.round((summarized / total) * 100) : 0;
  const isCommitSummarized = meta.summarizedCommits.includes(latestAnalyzed);

  // stale: dirty worktree OR missing summaries. behind is NOT stale —
  // the user may have intentionally switched branches/commits.
  const stale = dirty || !isCommitSummarized;

  return {
    graphId,
    repoPath,
    head,
    latestAnalyzed,
    dirty,
    behind,
    recommendReanalyze: dirty,
    summariesCoverage: { summarized, total, pct, isCommitSummarized },
    stale,
    verdict: stale ? "stale" : "fresh",
  };
}

function coverageInternal(graphId: string, commitHash?: string): {
  graphId: string;
  commit: string;
  totals: { total: number; summarized: number; structureOnly: number; pct: number };
  byType: Record<string, { total: number; summarized: number }>;
  model: string | null;
  promptVersion: string;
  lastSummarizedAt: string | null;
} {
  const meta = storage.getGraphMeta(graphId);
  if (!meta) throw new DevLensError("GRAPH_NOT_FOUND", `Graph not found: ${graphId}`);

  const ctx = requireContext(graphId, commitHash);
  const total = ctx.result.allNodes.length;
  const summarized = ctx.result.allNodes.filter((n) => n.technicalSummary != null).length;
  const pct = total > 0 ? Math.round((summarized / total) * 100) : 0;

  // Group by type
  const byType: Record<string, { total: number; summarized: number }> = {};
  for (const n of ctx.result.allNodes) {
    const t = n.type;
    if (!byType[t]) byType[t] = { total: 0, summarized: 0 };
    byType[t].total++;
    if (n.technicalSummary != null) byType[t].summarized++;
  }

  // Find the most common summary model
  const modelCounts = new Map<string, number>();
  for (const n of ctx.result.allNodes) {
    if (n.summaryModel) {
      modelCounts.set(n.summaryModel, (modelCounts.get(n.summaryModel) ?? 0) + 1);
    }
  }
  let model: string | null = null;
  let maxCount = 0;
  for (const [m, c] of modelCounts) {
    if (c > maxCount) { model = m; maxCount = c; }
  }

  const lastSummarizedCommit = meta.summarizedCommits.length > 0
    ? meta.summarizedCommits[meta.summarizedCommits.length - 1]
    : null;
  const lastSummarizedAt = lastSummarizedCommit
    ? meta.commits.find((c) => c.commitHash === lastSummarizedCommit)?.analyzedAt ?? null
    : null;

  return {
    graphId,
    commit: commitHash ?? meta.commits[0]?.commitHash ?? "",
    totals: { total, summarized, structureOnly: total - summarized, pct },
    byType,
    model,
    promptVersion: "v1",
    lastSummarizedAt,
  };
}

//  discovery / orientation 

export function listRepos() {
  return storage.listGraphs();
}

export function repoOverview(graphId: string, commitHash?: string) {
  const meta = storage.getGraphMeta(graphId);
  const ctx = getGraphContext(graphId, commitHash);
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

// ═══════════════════════════════════════════════════════════════════════════════
//  Shared brief helpers (used by T1 architecture_brief + T4 onboarding_tour)
// ═══════════════════════════════════════════════════════════════════════════════

interface ModuleInfo {
  clusterId: string;
  centerId: string | null;   // the seed node id used to grow this module
  purpose: string | null;
  directories: string[];
  keyNodes: ReturnType<typeof toCompact>[];
  count: number;
}

function buildModules(
  graphId: string,
  seedIds: string[],
  commitHash?: string
): ModuleInfo[] {
  // Keep the seed id alongside each cluster so the center is the actual seed,
  // not whatever order getSubgraph happened to return.
  const rawModules: ({ seedId: string } & ReturnType<typeof subgraph>)[] = seedIds.map((id) => {
    try {
      const sg = subgraph(graphId, id, commitHash);
      return sg ? { seedId: id, ...sg } : null;
    } catch {
      return null;
    }
  }).filter((m): m is NonNullable<typeof m> => m !== null);

  // Dedupe overlapping clusters by node-id overlap >= 60% -> merge.
  // When merging, keep the seed id of the first (higher-ranked) cluster.
  const merged: typeof rawModules = [];
  for (const mod of rawModules) {
    const nodeSet = new Set(mod.nodes.map((n) => n.id));
    let absorbed = false;
    for (const existing of merged) {
      const existSet = new Set(existing.nodes.map((n) => n.id));
      const overlap = [...nodeSet].filter((id) => existSet.has(id)).length;
      const minSize = Math.min(nodeSet.size, existSet.size);
      if (minSize > 0 && overlap / minSize >= 0.6) {
        for (const n of mod.nodes) {
          if (!existSet.has(n.id)) {
            existing.nodes.push(n);
            existSet.add(n.id);
          }
        }
        existing.nodeCount = existing.nodes.length;
        existing.edgeCount += mod.edgeCount;
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push(mod);
  }

  const ctx = requireContext(graphId, commitHash);
  return merged.map((mod) => {
    const center = ctx.index.nodesById.get(mod.seedId) ?? null;
    const dirs = [...new Set(mod.nodes.map((n) => n.filePath.split("/").slice(0, -1).join("/") || "/"))];
    return {
      clusterId: mod.clusterId,
      centerId: mod.seedId,
      purpose: center?.businessSummary ?? null,
      directories: dirs.slice(0, 5),
      keyNodes: mod.nodes.slice(0, 10),
      count: mod.nodeCount,
    };
  });
}

interface BackboneEnumerateResult {
  routes: ReturnType<typeof findNodes>;
  stores: ReturnType<typeof findNodes>;
  hooks: ReturnType<typeof findNodes>;
}

function enumerateBackbone(graphId: string, commitHash?: string): BackboneEnumerateResult {
  const routes = findNodes(graphId, { nodeTypes: ["ROUTE"], limit: 1000 }, commitHash);
  const stores = findNodes(graphId, { nodeTypes: ["STATE_STORE"], limit: 1000 }, commitHash);
  const hooks = findNodes(graphId, { nodeTypes: ["HOOK"], limit: 1000 }, commitHash);
  return { routes, stores, hooks };
}

interface KeyFlow {
  routeName: string;
  routeId: string;
  filePath: string;
  steps: { name: string; filePath: string; viaEdge: string; hop: number }[];
}

function buildKeyFlows(
  graphId: string,
  routeIds: string[],
  commitHash?: string
): KeyFlow[] {
  const ctx = requireContext(graphId, commitHash);
  return routeIds.map((id) => {
    const node = ctx.index.nodesById.get(id);
    try {
      const downstream = getKHop(ctx.index, id, { radius: 2 });
      const steps = downstream.hits
        .sort((a, b) => a.hop - b.hop)
        .map((h) => {
          const n = ctx.index.nodesById.get(h.nodeId);
          return { name: n?.name ?? h.nodeId, filePath: n?.filePath ?? "", viaEdge: h.viaEdge, hop: h.hop };
        });
      return {
        routeName: node?.name ?? id,
        routeId: id,
        filePath: node?.filePath ?? "",
        steps,
      };
    } catch {
      return { routeName: node?.name ?? id, routeId: id, filePath: node?.filePath ?? "", steps: [] };
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  S1  check_freshness
// ═══════════════════════════════════════════════════════════════════════════════

export function checkFreshness(graphId: string) {
  const report = checkFreshnessInternal(graphId);
  return { ...report, schemaVersion: 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  S2  get_coverage
// ═══════════════════════════════════════════════════════════════════════════════

export function getCoverage(graphId: string, commitHash?: string) {
  return { ...coverageInternal(graphId, commitHash), schemaVersion: 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  T1  architecture_brief
// ═══════════════════════════════════════════════════════════════════════════════

export interface ArchitectureBriefOpts {
  tokenBudget?: number;
  maxRoutesTraced?: number;
  maxModules?: number;
  commitHash?: string;
}

export function architectureBrief(graphId: string, opts: ArchitectureBriefOpts = {}) {
  const maxModules = opts.maxModules ?? 5;
  const maxRoutes = opts.maxRoutesTraced ?? 8;
  const commitHash = opts.commitHash;

  const ctx = requireContext(graphId, commitHash);
  const overview = repoOverview(graphId, commitHash);
  const fresh = checkFreshnessInternal(graphId);

  // Seed ids: map topScoringNodes (name/score/type) to actual node ids
  const topNodeIds = overview.topNodes
    .slice(0, maxModules)
    .map((tn) => {
      const match = ctx.result.allNodes.find((n) => n.name === tn.name && n.type === tn.type);
      return match?.id;
    })
    .filter((id): id is string => !!id);

  // Modules
  const modules = buildModules(graphId, topNodeIds, commitHash);

  // Backbone (bounded, high-value sets — enumerated FULLY, never truncated)
  const backbone = enumerateBackbone(graphId, commitHash);
  const routes = backbone.routes;
  const stores = backbone.stores;
  const hooks = backbone.hooks;

  // Route flows: top routes by score, 2-hop downstream call path
  // (route -> handler -> service -> store/db is typically 2 hops)
  const topRouteIds = (routes.nodes ?? [])
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRoutes)
    .map((n) => n.id);
  const keyFlows = buildKeyFlows(graphId, topRouteIds, commitHash);

  // Module connections: blast radius per module center (the actual seed id)
  const moduleCenters = modules
    .map((m) => m.centerId)
    .filter((id): id is string => !!id);
  const connections = moduleCenters.map((centerId) => {
    try {
      const br = blastRadius(graphId, centerId, 1, undefined, commitHash);
      return {
        from: centerId,
        edges: br.nodes.map((n) => ({ to: n.id, viaEdge: n.viaEdge })),
      };
    } catch {
      return { from: centerId, edges: [] };
    }
  });

  // Summaries for core nodes
  const meaningIds = [...new Set([...moduleCenters, ...topRouteIds, ...stores.nodes.map((n) => n.id)])];
  const summaries = getSummariesFor(graphId, meaningIds, ["business", "technical"], commitHash);

  // Health (no timeout protection — cycles/securityIssues are sync and block the
  // event loop; a Promise.race timer can't fire. Worker-thread protection is a
  // future PR. These calls are O(V+E) and fast on typical repos; verify on 50k+.)
  const cyclesResult = cycles(graphId, commitHash);
  const securityResult = securityIssues(graphId, "low", 200, commitHash);

  const secCounts = { high: 0, medium: 0, low: 0 };
  for (const iss of securityResult.issues) {
    const sev = iss.severity;
    if (sev && sev in secCounts) secCounts[sev as keyof typeof secCounts]++;
  }

  // Assemble — the backbone (modules/routes/stores/hooks/flows) is enumerated
  // FULLY and never truncated (bounded, high-value). Only the long-tail core-node
  // inventory gets a budget cap.
  const storeNodes = stores.nodes;
  const hookNodes = hooks.nodes;
  const routeNodes = routes.nodes;

  // Core nodes from meaning set (capped to protect budget)
  const coreNodes = meaningIds.slice(0, 15).map((id) => {
    const n = ctx.index.nodesById.get(id);
    if (!n) return null;
    try {
      const callees = getKHop(ctx.index, id, { radius: 1 }).hits.slice(0, 5).map((h) => hitRef(ctx, h.nodeId, h.viaEdge));
      const callers = getBlastRadius(ctx.index, id, { radius: 1 }).hits.slice(0, 5).map((h) => hitRef(ctx, h.nodeId, h.viaEdge));
      return {
        id, name: n.name, type: n.type, filePath: n.filePath,
        lines: `${n.startLine}-${n.endLine}`,
        role: n.businessSummary?.slice(0, 100) ?? null,
        callers, callees,
      };
    } catch { return null; }
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  return {
    schemaVersion: 1,
    header: {
      totalNodes: overview.stats.totalNodes,
      totalEdges: overview.stats.totalEdges,
      routeCount: overview.routeCount,
      commit: commitHash ?? fresh.latestAnalyzed,
      analyzedAt: fresh.summariesCoverage.isCommitSummarized ? "summarized" : "structure-only",
      dirty: fresh.dirty,
      stale: fresh.stale,
    },
    overview: { fingerprint: overview.fingerprint, topNodes: overview.topNodes },
    modules,
    routes: { total: routes.total, returned: routeNodes.length, nodes: routeNodes, truncated: false },
    stores: { total: stores.total, nodes: storeNodes },
    hooks:  { total: hooks.total, nodes: hookNodes },
    keyFlows,
    connections,
    coreNodes,
    health: {
      cycles: { total: cyclesResult.total, cycles: cyclesResult.cycles, verdict: cyclesResult.total === 0 ? ("acyclic" as const) : undefined },
      security: {
        counts: secCounts,
        topFindings: securityResult.issues.slice(0, 10),
      },
    },
    stats: {
      modulesCount: modules.length,
      routesCount: routes.total,
      storesCount: stores.total,
      hooksCount: hooks.total,
      keyFlowsCount: keyFlows.length,
    },
    coverage: fresh.summariesCoverage,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  T2  security_brief
// ═══════════════════════════════════════════════════════════════════════════════

export interface SecurityBriefOpts {
  minSeverity?: "low" | "medium" | "high";
  tokenBudget?: number;
  commitHash?: string;
}

export function securityBrief(graphId: string, opts: SecurityBriefOpts = {}) {
  const minSeverity = opts.minSeverity ?? "low";
  const commitHash = opts.commitHash;
  const fresh = checkFreshnessInternal(graphId);

  const issues = securityIssues(graphId, minSeverity, 1000, commitHash);

  const counts = { high: 0, medium: 0, low: 0, total: issues.total };
  for (const iss of issues.issues) {
    const sev = iss.severity;
    if (sev && sev in counts) counts[sev as keyof typeof counts]++;
  }

  // Enrich high-severity findings with blast radius. No timeout — blastRadius
  // is synchronous and would block the event loop anyway; a Promise.race timer
  // can't interrupt it. (Worker-thread protection is a future PR.)
  const findings = issues.issues.map((iss) => {
    const base = { ...iss, mitigationHint: null as null, reach: undefined as { count: number; truncated: boolean; topDependents: { id: string; name?: string; viaEdge: string }[] } | undefined };
    if (iss.severity === "high") {
      try {
        const reach = blastRadius(graphId, iss.id, 2, undefined, commitHash);
        base.reach = {
          count: reach.count,
          truncated: reach.truncated,
          topDependents: reach.nodes.slice(0, 5).map((n) => ({ id: n.id, name: ("name" in n ? n.name : undefined), viaEdge: n.viaEdge })),
        };
      } catch {
        base.reach = { count: 0, truncated: false, topDependents: [] };
      }
    }
    return base;
  });

  // Rank fix-first: high severity sorted by reach count desc
  const fixTheseFirst = findings
    .filter((f) => f.severity === "high")
    .sort((a, b) => (b.reach?.count ?? 0) - (a.reach?.count ?? 0))
    .slice(0, 5)
    .map((f) => f.id);

  return {
    schemaVersion: 1,
    counts,
    findings,
    fixTheseFirst,
    verdict: counts.total === 0 ? ("clean" as const) : undefined,
    coverage: fresh.summariesCoverage,
    header: {
      commit: commitHash ?? fresh.latestAnalyzed,
      analyzedAt: fresh.summariesCoverage.isCommitSummarized ? "summarized" : "structure-only",
      dirty: fresh.dirty,
      stale: fresh.stale,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  T3  review_pr
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReviewPrOpts {
  radius?: number;
  tokenBudget?: number;
  commitHash?: string;
}

export function reviewPr(graphId: string, from: string, to: string, opts: ReviewPrOpts = {}) {
  const radius = opts.radius ?? 1;
  const commitHash = opts.commitHash ?? to;

  const changes = analyzeChanges(graphId, from, to, radius);

  const changedIds = [
    ...new Set([
      ...changes.diff.added.map((d) => d.nodeId),
      ...changes.diff.codeChanged.map((d) => d.nodeId),
    ]),
  ];

  const summaries = getSummariesFor(graphId, changedIds, ["technical", "business", "security"], to);

  // Per changed-node: impact + tests (incoming TESTS edges = tests covering it).
  // No timeout — blastRadius is synchronous; worker-thread protection is a future PR.
  const changedNodes = changedIds.map((id) => {
    const impactEntry = changes.impact.find((i) => i.nodeId === id);
    const diffEntry = changes.diff.added.find((d) => d.nodeId === id)
      ?? changes.diff.codeChanged.find((d) => d.nodeId === id);

    let testsResult: { count: number; items: { id: string; name?: string; filePath?: string }[] } = { count: 0, items: [] };
    try {
      const tests = blastRadius(graphId, id, 1, ["TESTS"], to);
      testsResult = {
        count: tests.count,
        items: tests.nodes.map((n) => ({ id: n.id, name: ("name" in n ? n.name : undefined), filePath: ("filePath" in n ? n.filePath : undefined) })),
      };
    } catch {
      // node may not exist in the 'to' graph — leave testsResult empty
    }

    const summaryEntry = summaries.summaries.find((s) => s.id === id && !("error" in s));

    return {
      id,
      name: diffEntry?.name ?? impactEntry?.name ?? (summaryEntry && "name" in summaryEntry ? summaryEntry.name : id),
      type: changes.diff.added.find((d) => d.nodeId === id) ? ("added" as const) : ("codeChanged" as const),
      filePath: diffEntry?.filePath ?? "",
      technicalSummary: (summaryEntry && "technicalSummary" in summaryEntry ? summaryEntry.technicalSummary : null),
      businessSummary: (summaryEntry && "businessSummary" in summaryEntry ? summaryEntry.businessSummary : null),
      security: (summaryEntry && "security" in summaryEntry ? summaryEntry.security : null),
      impact: impactEntry
        ? { count: impactEntry.impactedCount, truncated: impactEntry.truncated, topDependents: impactEntry.impacted.slice(0, 5) }
        : { count: 0, truncated: false, topDependents: [] },
      tests: testsResult,
    };
  });

  // Security delta. No timeout — securityIssues is synchronous.
  const secNow  = securityIssues(graphId, "low", 1000, to);
  const secThen = securityIssues(graphId, "low", 1000, from);
  const nowIds  = new Set(secNow.issues.map((i) => i.id));
  const thenIds = new Set(secThen.issues.map((i) => i.id));
  const newIssues      = secNow.issues.filter((i) => !thenIds.has(i.id));
  const resolvedIssues  = secThen.issues.filter((i) => !nowIds.has(i.id));

  const checklist = [
    "Each changed node's blast radius reviewed",
    "Tests exist for every changed public function/handler",
    "No new high-severity security findings",
    "No removed tests for still-changed nodes",
    "Routes in blast radius still render",
  ];

  const fresh = checkFreshnessInternal(graphId);

  return {
    schemaVersion: 1,
    summary: changes.summary,
    changedNodes,
    securityDelta: { newIssues, resolvedIssues },
    reviewerChecklist: checklist,
    header: {
      from, to,
      commit: to,
      analyzedAt: fresh.summariesCoverage.isCommitSummarized ? "summarized" : "structure-only",
      stale: fresh.stale,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  T4  onboarding_tour
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnboardingTourOpts {
  tokenBudget?: number;
  maxModules?: number;
  maxFlows?: number;
  commitHash?: string;
}

export function onboardingTour(graphId: string, opts: OnboardingTourOpts = {}) {
  const maxModules = opts.maxModules ?? 8;
  const maxFlows = opts.maxFlows ?? 4;
  const commitHash = opts.commitHash;

  const ctx = requireContext(graphId, commitHash);
  const overview = repoOverview(graphId, commitHash);
  const fresh = checkFreshnessInternal(graphId);

  // Seed ids from top nodes
  const topNodeIds = overview.topNodes
    .slice(0, maxModules)
    .map((tn) => {
      const match = ctx.result.allNodes.find((n) => n.name === tn.name && n.type === tn.type);
      return match?.id;
    })
    .filter((id): id is string => !!id);

  const modules = buildModules(graphId, topNodeIds, commitHash);
  const backbone = enumerateBackbone(graphId, commitHash);
  const routes = backbone.routes;
  const stores = backbone.stores;
  const hooks = backbone.hooks;

  // Key flows
  const topRouteIds = (routes.nodes ?? [])
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFlows)
    .map((n) => n.id);
  const keyFlows = buildKeyFlows(graphId, topRouteIds, commitHash);

  // Domain glossary: business summaries of module centers + top routes + stores
  const glossaryIds = [...new Set([
    ...modules.map((m) => m.centerId).filter((id): id is string => !!id),
    ...topRouteIds,
    ...stores.nodes.slice(0, 10).map((n) => n.id),
  ])];
  const glossarySummaries = getSummariesFor(graphId, glossaryIds, ["business"], commitHash);
  const domainGlossary = glossarySummaries.summaries
    .filter((s) => "businessSummary" in s && s.businessSummary)
    .map((s) => ({ term: ("name" in s ? s.name : s.id), definition: ("businessSummary" in s ? s.businessSummary! : "") }));

  // Reading path: top nodes by score
  const allTopIds = [
    ...topNodeIds,
    ...topRouteIds,
    ...stores.nodes.slice(0, 5).map((n) => n.id),
  ].slice(0, 12);
  const readingPath = allTopIds.map((id) => {
    const n = ctx.index.nodesById.get(id);
    return { id, name: n?.name ?? id, filePath: n?.filePath ?? "", why: n?.businessSummary?.slice(0, 140) ?? null };
  });

  // Gotchas (no timeout — cycles/securityIssues are synchronous; worker-thread
  // protection is a future PR)
  const cyclesResult = cycles(graphId, commitHash);
  const highSecurity = securityIssues(graphId, "high", 50, commitHash).issues;

  const loadBearing = topNodeIds
    .map((id) => {
      try {
        const br = blastRadius(graphId, id, 1, undefined, commitHash);
        return br.count > 10 ? { id, name: ctx.index.nodesById.get(id)?.name ?? id, dependents: br.count } : null;
      } catch { return null; }
    })
    .filter((lb): lb is NonNullable<typeof lb> => lb !== null);

  return {
    schemaVersion: 1,
    header: {
      totalNodes: overview.stats.totalNodes,
      totalEdges: overview.stats.totalEdges,
      routeCount: overview.routeCount,
      commit: commitHash ?? fresh.latestAnalyzed,
      analyzedAt: fresh.summariesCoverage.isCommitSummarized ? "summarized" : "structure-only",
      stale: fresh.stale,
    },
    stack: overview.fingerprint,
    modules,
    entryPoints: routes,
    state: { stores, hooks },
    keyFlows,
    readingPath,
    domainGlossary,
    gotchas: {
      cycles: cyclesResult.cycles,
      highSecurity,
      loadBearing,
    },
    coverage: fresh.summariesCoverage,
    needsDisk: ["package.json scripts", ".env.example vars", "README run steps"],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  T5  get_context   (keyword-seeded, NO embeddings)
// ═══════════════════════════════════════════════════════════════════════════════

export interface GetContextOpts {
  intent?: "explain" | "architecture" | "impact" | "security" | "generic";
  focus?: string;
  seedNodeIds?: string[];
  hops?: 1 | 2;
  tokenBudget?: number;
  commitHash?: string;
}

function seedByKeyword(
  ctx: Ctx,
  query: string,
  topN: number
): { id: string; name: string; score: number; keywordScore: number }[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const scored = ctx.result.allNodes.map((n) => {
    let kw = 0;
    const nameLower = n.name.toLowerCase();
    const pathLower = n.filePath.toLowerCase();
    const bizLower = (n.businessSummary ?? "").toLowerCase();
    for (const t of tokens) {
      if (nameLower.includes(t)) kw += 3;
      if (pathLower.includes(t)) kw += 2;
      if (bizLower.includes(t)) kw += 1;
    }
    const final = kw * 0.6 + Number(n.score ?? 0) * 0.4;
    return { id: n.id, name: n.name, score: Number(n.score ?? 0), keywordScore: kw, final };
  });

  return scored
    .filter((s) => s.keywordScore > 0)
    .sort((a, b) => b.final - a.final)
    .slice(0, topN)
    .map(({ id, name, score, keywordScore }) => ({ id, name, score, keywordScore }));
}

const NODE_CAP = 150;

export function getContext(graphId: string, query: string, opts: GetContextOpts = {}) {
  const intent = opts.intent ?? "generic";
  // Default 1 hop. Agents that want depth (e.g. architecture on a big repo)
  // pass hops: 2 explicitly. Intent presets already control edge types and
  // direction, which is the more important knob.
  const hops = opts.hops ?? 1;
  const budget = opts.tokenBudget ?? DEFAULT_BUDGET;
  const commitHash = opts.commitHash;
  const focus = opts.focus;
  const seedNodeIds = opts.seedNodeIds;

  const ctx = requireContext(graphId, commitHash);

  //  Step 1: Seed 
  let seeds: { id: string; name: string; score: number; keywordScore?: number }[] = [];
  let retrievalFallback: string | undefined;

  if (seedNodeIds && seedNodeIds.length > 0) {
    // Direct seeds — skip keyword seeding
    seeds = seedNodeIds.map((id) => {
      const n = ctx.index.nodesById.get(id);
      return { id, name: n?.name ?? id, score: Number(n?.score ?? 0) };
    });
  } else if (intent === "security") {
    seeds = securityIssues(graphId, "low", 200, commitHash).issues.map((i) => ({
      id: i.id, name: i.name, score: i.score, keywordScore: 0,
    }));
  } else if (intent === "impact") {
    // Impact seeds come from `focus` or `seedNodeIds` (the changed nodes), NOT
    // keyword search. If neither is provided, we can't compute impact — point
    // the agent at review_pr, which resolves changed nodes from a commit range.
    if (!focus && !(seedNodeIds && seedNodeIds.length > 0)) {
      throw new DevLensError(
        "IMPACT_REQUIRES_FOCUS",
        "intent='impact' needs a focus node (or seedNodeIds). For PR-scope impact, use review_pr(from, to) instead — it resolves the changed-node set from the commit range.",
        "review_pr"
      );
    }
    seeds = [];   // focus/seedNodeIds are prepended below
  } else {
    const n = seedCountFor(intent);
    seeds = seedByKeyword(ctx, query, n);
    if (seeds.length === 0) {
      // Fall back to central nodes
      seeds = topNodes(graphId, 5, commitHash).nodes.map((n) => ({
        id: n.id, name: n.name, score: n.score, keywordScore: 0,
      }));
      retrievalFallback = "keyword-miss -> central nodes";
    }
  }

  // Prepend focus node if provided
  if (focus) {
    // focus can be a nodeId or a filePath
    let focusNode = ctx.index.nodesById.get(focus);
    if (!focusNode) {
      // Try as filePath prefix
      const nodesInFile = nodesInPath(graphId, focus, undefined, commitHash).nodes;
      focusNode = nodesInFile[0] ? ctx.index.nodesById.get(nodesInFile[0].id) : undefined;
    }
    if (focusNode) {
      seeds = [{ id: focusNode.id, name: focusNode.name, score: Number(focusNode.score ?? 0), keywordScore: 0 }, ...seeds];
    }
  }

  //  Step 2: Traverse (intent-aware) 
  const edgeTypesByIntent: Record<string, EdgeType[] | undefined> = {
    explain: undefined,
    architecture: ["CALLS" as EdgeType, "PROP_PASS" as EdgeType, "RENDERS" as EdgeType],
    impact: ["CALLS" as EdgeType, "IMPORTS" as EdgeType, "READS_FROM" as EdgeType],
    security: undefined,
    generic: undefined,
  };
  const directionByIntent: Record<string, "both" | "incoming" | "outgoing"> = {
    explain: "both",
    architecture: "both",
    impact: "incoming",
    security: "incoming",
    generic: "both",
  };

  const edgeTypes = edgeTypesByIntent[intent];
  const direction = directionByIntent[intent];

  // Collect expanded nodes with similarity decay
  interface ExpandedNode {
    id: string;
    hop: number;
    viaEdge: string;
    similarity: number;
  }

  const expanded = new Map<string, ExpandedNode>();
  const maxSeedSimilarity = 1.0;

  for (const seed of seeds) {
    expanded.set(seed.id, { id: seed.id, hop: 0, viaEdge: "seed", similarity: maxSeedSimilarity });

    if (expanded.size >= NODE_CAP) break;

    if (direction === "both" || direction === "incoming") {
      try {
        const br = getBlastRadius(ctx.index, seed.id, { radius: hops, edgeTypes });
        for (const h of br.hits) {
          if (!expanded.has(h.nodeId) && expanded.size < NODE_CAP) {
            const sim = maxSeedSimilarity * (h.hop === 1 ? 0.6 : 0.3);
            expanded.set(h.nodeId, { id: h.nodeId, hop: h.hop, viaEdge: h.viaEdge, similarity: sim });
          }
        }
      } catch { /* skip failed traversals */ }
    }

    if (direction === "both" || direction === "outgoing") {
      try {
        const kh = getKHop(ctx.index, seed.id, { radius: hops, edgeTypes });
        for (const h of kh.hits) {
          if (!expanded.has(h.nodeId) && expanded.size < NODE_CAP) {
            const sim = maxSeedSimilarity * (h.hop === 1 ? 0.6 : 0.3);
            expanded.set(h.nodeId, { id: h.nodeId, hop: h.hop, viaEdge: h.viaEdge, similarity: sim });
          }
        }
      } catch { /* skip failed traversals */ }
    }
  }

  //  Step 3: Assemble (token-budgeted) 
  const sorted = [...expanded.values()]
    .sort((a, b) => {
      const nodeA = ctx.index.nodesById.get(a.id);
      const nodeB = ctx.index.nodesById.get(b.id);
      const rankA = a.similarity * 0.6 + Number(nodeA?.score ?? 0) * 0.4;
      const rankB = b.similarity * 0.6 + Number(nodeB?.score ?? 0) * 0.4;
      return rankB - rankA;
    });

  // Security-severity nodes always included
  const securityPriority = new Set<string>();
  for (const n of ctx.result.allNodes) {
    if (SEVERITY_RANK[(n.security?.severity ?? "none") as Severity] >= SEVERITY_RANK.low) {
      securityPriority.add(n.id);
    }
  }

  // Sort: security-first, then by rank
  sorted.sort((a, b) => {
    const aSec = securityPriority.has(a.id) ? 1 : 0;
    const bSec = securityPriority.has(b.id) ? 1 : 0;
    if (aSec !== bSec) return bSec - aSec;
    const nodeA = ctx.index.nodesById.get(a.id);
    const nodeB = ctx.index.nodesById.get(b.id);
    const rankA = a.similarity * 0.6 + Number(nodeA?.score ?? 0) * 0.4;
    const rankB = b.similarity * 0.6 + Number(nodeB?.score ?? 0) * 0.4;
    return rankB - rankA;
  });

  // Build nodes until budget
  let usedBudget = 0;
  const included: Record<string, unknown>[] = [];
  const securityAlwaysIncluded: Record<string, unknown>[] = [];
  const allSorted = [...sorted];
  let droppedCount = 0;
  let truncated = false;

  for (const exp of allSorted) {
    const n = ctx.index.nodesById.get(exp.id);
    if (!n) continue;
    const entry = {
      id: n.id, name: n.name, type: n.type, filePath: n.filePath,
      lines: `${n.startLine}-${n.endLine}`,
      hop: exp.hop, viaEdge: exp.viaEdge,
      technicalSummary: n.technicalSummary ?? null,
      businessSummary: n.businessSummary ?? null,
      security: n.security ?? null,
    };
    const cost = estTokens(JSON.stringify(entry));

    if (securityPriority.has(exp.id)) {
      securityAlwaysIncluded.push(entry);
      included.push(entry);
      usedBudget += cost;
    } else if (usedBudget + cost <= budget) {
      included.push(entry);
      usedBudget += cost;
    } else {
      droppedCount++;
      truncated = true;
    }
  }

  const fresh = checkFreshnessInternal(graphId);

  return {
    schemaVersion: 1,
    intent,
    query,
    hops,
    tokenBudget: budget,
    seeds,
    nodes: included,
    securityAlwaysIncluded,
    counts: {
      seeds: seeds.length,
      expanded: expanded.size,
      included: included.length,
      dropped: droppedCount,
      truncated,
    },
    coverage: fresh.summariesCoverage,
    ...(retrievalFallback && { retrievalFallback }),
    verdict: included.length === 0 ? ("no-context" as const) : undefined,
  };
}