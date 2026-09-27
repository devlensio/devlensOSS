// searchEngine.ts
//
// Architecture: wrapper around MiniSearch that gives us cloud-style BM25F
// semantics locally. MiniSearch implements BM25+ (k1=1.2, b=0.75, delta
// configurable) with per-field boosts, prefix and fuzzy matching, and a
// toJSON/loadJSON round trip we use for the .search.json persistence format.
//
// Flow (index side): nodes -> six-field docs (name, nameparts, path, tech,
// biz, sec) -> MiniSearch.addAll -> toJSON on disk. Flow (query side): query
// terms -> MiniSearch.search with a per-summaryType boost table (technical
// queries boost tech summaries, business queries boost biz summaries,
// "both" uses the default table) -> results with scores and matched terms.
// Scores are MiniSearch-normalized; query.ts still clamps relevance against
// the max hit before blending with node score.

import MiniSearch from "minisearch";
import stemmer from "wink-porter2-stemmer";
import type { SummaryType } from "./types.js";

export const SEARCH_INDEXER_VERSION = "minisearch-1";

const FIELDS = ["name", "nameparts", "path", "tech", "biz", "sec"] as const;

export const DEFAULT_BOOSTS: Record<string, number> = {
  name: 3,
  nameparts: 3,
  path: 2,
  tech: 1,
  biz: 1,
  sec: 0.5,
};

export const SUMMARY_TYPE_BOOSTS: Record<SummaryType, Record<string, number>> = {
  both: DEFAULT_BOOSTS,
  technical: { name: 3, nameparts: 3, path: 2, tech: 3, biz: 0.5, sec: 0.5 },
  business: { name: 3, nameparts: 3, path: 2, tech: 0.5, biz: 3, sec: 0.5 },
};

export interface SearchDoc {
  id: string;
  name: string;
  nameparts: string;
  path: string;
  tech: string;
  biz: string;
  sec: string;
}

export interface SearchHit {
  nodeId: string;
  score: number;
  matchedTerms: string[];
}

function createEngine(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>({
    fields: [...FIELDS],
    storeFields: [],
    processTerm: (term: string) => {
      const t = term.toLowerCase();
      return t.length >= 2 ? stemmer(t) : null;
    },
  });
}

export function buildEngine(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const engine = createEngine();
  engine.addAll(docs);
  return engine;
}

export function loadEngine(serialized: unknown): MiniSearch<SearchDoc> {
  return MiniSearch.loadJS<SearchDoc>(serialized as never, {
    fields: [...FIELDS],
    storeFields: [],
    processTerm: (term: string) => {
      const t = term.toLowerCase();
      return t.length >= 2 ? stemmer(t) : null;
    },
  });
}

export function runSearch(
  engine: MiniSearch<SearchDoc>,
  terms: string[],
  summaryType: SummaryType = "both",
  limit = 25
): SearchHit[] {
  if (terms.length === 0) return [];
  const results = engine.search(terms.join(" "), {
    boost: SUMMARY_TYPE_BOOSTS[summaryType] ?? DEFAULT_BOOSTS,
    prefix: true,
    fuzzy: 0.2,
  });
  return results.slice(0, limit).map((r) => ({
    nodeId: String(r.id),
    score: r.score,
    matchedTerms: Object.keys(r.match ?? {}),
  }));
}
