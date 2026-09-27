// types.ts
//
// Shared types for the local search stack. The SearchEnvelope is the on-disk
// .search.json format: a MiniSearch serialization plus enough provenance to
// decide staleness and rebuildability. The index is always derived from the
// commit JSON, never a source of truth: deleting it must be safe.

import type MiniSearch from "minisearch";
import type { SearchDoc } from "./searchEngine.js";

export type SummaryType = "technical" | "business" | "both";

export interface SearchEnvelope {
  envelopeVersion: number;
  indexerVersion: string;
  commitHash: string;
  builtAt: string;
  docs: number;
  engine: unknown;
}

export interface CachedIndex {
  engine: MiniSearch<SearchDoc>;
  envelope: SearchEnvelope;
  loadedAt: number;
}

export interface SeedResult {
  nodeId: string;
  relevance: number;
  exactMatch: boolean;
  channel: "bm25f" | "exact" | "fallback";
  matchedTerms: string[];
}
