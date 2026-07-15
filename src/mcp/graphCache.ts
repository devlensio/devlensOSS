import { LRUCache } from "lru-cache";
import { storage, buildGraphIndex } from "devlensio";
import type { PipelineResult, GraphIndex } from "devlensio";

export interface GraphContext {
  result: PipelineResult;
  index:  GraphIndex;
}

const TTL_WINDOW = 1000 * 60 * 60 * 12; //12hrs

const cache = new LRUCache<string, GraphContext>({
  max: 50,              // cap distinct graph@commit entries held in memory
  ttl: TTL_WINDOW,    // entries expire 12h after insertion
});

const keyFor = (graphId: string, commitHash?: string) =>
  `${graphId}@${commitHash ?? "latest"}`;

export function getContext(graphId: string, commitHash?: string): GraphContext | undefined {
  const key = keyFor(graphId, commitHash);

  const cached = cache.get(key);   // get() also refreshes recency / checks TTL
  if (cached) return cached;

  const result = storage.getGraph(graphId, commitHash);
  if (!result) return undefined;

  const index = buildGraphIndex(result.allNodes, result.allEdges);
  const ctx: GraphContext = { result, index };
  cache.set(key, ctx);
  return ctx;
}

// Invalidate ALL commits of a graph — call after re-analysis or summarization,
// since both rewrite node data the index/summaries are built from.
export function invalidate(graphId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${graphId}@`)) cache.delete(key);
  }
}

export function invalidateGraphCommit(graphId: string, commitHash: string): void{
 cache.delete(`${graphId}@${commitHash}`);
}