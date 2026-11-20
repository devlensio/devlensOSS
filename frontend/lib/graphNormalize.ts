import type { CodeEdge, CodeNode, GraphResponse } from "./types";

const PAGE_FILE = /(^|\/)page\.(js|jsx|ts|tsx|mjs|cjs)$/i;

/**
 * The engine emits one ROUTE node per file that declares a route, so a Next.js
 * url with both `page.tsx` and `layout.tsx` produces two nodes with the same
 * name but different ids — two entries in search, two upstream lists, two
 * selected states. Keep one per url and move the other's edges onto it.
 */
export function dedupeRouteNodes(nodes: CodeNode[], edges: CodeEdge[]) {
  const byPath = new Map<string, CodeNode[]>();
  for (const n of nodes) {
    if (n.type !== "ROUTE") continue;
    const list = byPath.get(n.name) ?? [];
    list.push(n);
    byPath.set(n.name, list);
  }

  const alias = new Map<string, string>();
  const dropped = new Set<string>();
  const scoreBump = new Map<string, number>();

  for (const [, group] of byPath) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const ap = PAGE_FILE.test(a.filePath) ? 1 : 0;
      const bp = PAGE_FILE.test(b.filePath) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    const keep = ranked[0];
    let best = keep.score ?? 0;
    for (const other of ranked.slice(1)) {
      alias.set(other.id, keep.id);
      dropped.add(other.id);
      best = Math.max(best, other.score ?? 0);
    }
    if (best !== (keep.score ?? 0)) scoreBump.set(keep.id, best);
  }

  if (dropped.size === 0) return { nodes, edges, mergedAway: 0 };

  const resolve = (id: string) => {
    let cur = id;
    const guard = new Set<string>();
    while (alias.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      cur = alias.get(cur)!;
    }
    return cur;
  };

  const kept = nodes
    .filter((n) => !dropped.has(n.id))
    .map((n) => (scoreBump.has(n.id) ? { ...n, score: scoreBump.get(n.id) } : n));

  const seen = new Set<string>();
  const merged: CodeEdge[] = [];
  for (const e of edges) {
    const from = resolve(e.from);
    const to = resolve(e.to);
    if (from === to) continue;
    const key = `${from}|${to}|${e.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(from === e.from && to === e.to ? e : { ...e, from, to });
  }

  return { nodes: kept, edges: merged, mergedAway: dropped.size };
}

/** Dedupe route nodes and rebuild the id maps the UI reads. */
export function normalizeGraph(graph: GraphResponse): GraphResponse {
  const { nodes, edges, mergedAway } = dedupeRouteNodes(graph.nodes, graph.edges);
  if (mergedAway === 0) return graph;

  const nodesById: Record<string, CodeNode> = {};
  for (const n of nodes) nodesById[n.id] = n;

  const nodeScores: Record<string, number> = {};
  for (const n of nodes) {
    const s = graph.nodeScores?.[n.id] ?? n.score;
    if (typeof s === "number") nodeScores[n.id] = s;
  }

  return { ...graph, nodes, edges, nodesById, nodeScores };
}