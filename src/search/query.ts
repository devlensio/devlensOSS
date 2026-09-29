// query.ts
//
// Architecture: public entry point of the local search stack. Combines the
// BM25F channel (MiniSearch with per-summaryType boosts) with an exact-name
// channel and a v1-style substring fallback, then normalizes and blends
// scores with the graph's node score exactly like the cloud seed merge.
//
// Flow: searchSeeds(graphId, commitHash, task, summaryType, limit)
// -> queryTerms(task) -> ensureIndex: cache hit / file load / lazy build.
// The graph itself is read through the shared context cache rather than a fresh
// storage.getGraph, because a full graph parse costs about 1.5s on a mid-size repo
// and search happens on every front door call.
// A null engine (commit JSON missing too) yields { needsReanalyze: true } so
// callers answer "graph needs re-analyzing" instead of erroring. Seeds get
// relevance = score/maxScore clamped to [0,1]; exact name matches flag
// exactMatch and outrank via the channel priority applied by the caller.
// Fallback (engine present but zero hits, or index unusable) runs the v1
// substring scorer so quality degrades to v1, never to empty.

import { storage } from "devlensio";
import type { CodeNode, PipelineResult } from "devlensio";
import { queryTerms } from "./tokenizer.js";
import { runSearch } from "./searchEngine.js";
import type { SearchDoc } from "./searchEngine.js";
import { ensureIndex } from "./indexManager.js";
import { getContext } from "../mcp/graphCache.js";
import type { SeedResult, SummaryType } from "./types.js";

export interface SearchSeedsResult {
  seeds: SeedResult[];
  needsReanalyze: boolean;
  origin: "cache" | "file" | "lazy-build" | "missing" | "fallback";
}

function exactNameMatches(
  terms: string[],
  nodes: CodeNode[],
  limit: number
): SeedResult[] {
  const lower = terms.map((t) => t.toLowerCase());
  const hits: SeedResult[] = [];
  for (const node of nodes) {
    const nameLower = (node.name ?? "").toLowerCase();
    if (lower.some((t) => nameLower === t)) {
      hits.push({
        nodeId: node.id,
        relevance: 1,
        exactMatch: true,
        channel: "exact",
        matchedTerms: [node.name],
      });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

function fallbackSeeds(
  terms: string[],
  result: PipelineResult,
  summaryType: SummaryType,
  limit: number
): SeedResult[] {
  const lower = terms.map((t) => t.toLowerCase());
  const seeds: SeedResult[] = [];
  for (const node of result.allNodes) {
    const nameLower = (node.name ?? "").toLowerCase();
    const pathLower = (node.filePath ?? "").toLowerCase();
    const summary =
      summaryType === "technical"
        ? (node.technicalSummary ?? "")
        : summaryType === "business"
          ? (node.businessSummary ?? "")
          : `${node.technicalSummary ?? ""} ${node.businessSummary ?? ""}`;
    const summaryLower = summary.toLowerCase();
    let kw = 0;
    for (const t of lower) {
      if (nameLower.includes(t)) kw += 3;
      if (pathLower.includes(t)) kw += 2;
      if (summaryLower.includes(t)) kw += 1;
    }
    if (kw > 0) {
      const relevance = Math.min(1, kw / Math.max(1, lower.length * 3));
      seeds.push({
        nodeId: node.id,
        relevance,
        exactMatch: lower.some((t) => nameLower === t),
        channel: "fallback",
        matchedTerms: [],
      });
    }
  }
  seeds.sort((a, b) => b.relevance - a.relevance);
  return seeds.slice(0, limit);
}

export function searchSeeds(
  graphId: string,
  commitHash: string,
  task: string,
  summaryType: SummaryType = "both",
  limit = 25
): SearchSeedsResult {
  const terms = queryTerms(task);
  const ensured = ensureIndex(graphId, commitHash);

  if (!ensured.engine) {
    return { seeds: [], needsReanalyze: true, origin: "missing" };
  }

  if (terms.length === 0) {
    return { seeds: [], needsReanalyze: false, origin: ensured.origin };
  }

  const hits = runSearch(ensured.engine, terms, summaryType, limit);

  if (hits.length === 0) {
    const result = getContext(graphId, commitHash)?.result ?? storage.getGraph(graphId, commitHash);
    if (!result) {
      return { seeds: [], needsReanalyze: true, origin: "missing" };
    }
    const exact = exactNameMatches(terms, result.allNodes, limit);
    if (exact.length > 0) {
      return { seeds: exact, needsReanalyze: false, origin: ensured.origin };
    }
    return {
      seeds: fallbackSeeds(terms, result, summaryType, limit),
      needsReanalyze: false,
      origin: "fallback",
    };
  }

  const max = Math.max(...hits.map((h) => h.score), 1e-9);
  const seeds: SeedResult[] = hits.map((h) => ({
    nodeId: h.nodeId,
    relevance: Math.max(0, Math.min(1, h.score / max)),
    exactMatch: h.matchedTerms.length >= terms.length,
    channel: "bm25f",
    matchedTerms: h.matchedTerms,
  }));

  const result = getContext(graphId, commitHash)?.result ?? storage.getGraph(graphId, commitHash);
  if (result) {
    const exact = exactNameMatches(terms, result.allNodes, limit);
    const exactIds = new Set(exact.map((e) => e.nodeId));
    for (const seed of seeds) {
      if (exactIds.has(seed.nodeId)) seed.exactMatch = true;
    }
    for (const e of exact) {
      if (!seeds.some((s) => s.nodeId === e.nodeId)) seeds.push(e);
    }
  }

  return { seeds: seeds.slice(0, limit), needsReanalyze: false, origin: ensured.origin };
}
