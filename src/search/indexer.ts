// indexer.ts
//
// Architecture: turns a PipelineResult into MiniSearch documents and the
// persisted .search.json envelope. Pure CPU over in-memory structures, no IO
// decisions of its own: callers (analyze hook, lazy build, reindex endpoints)
// decide when to write. Compact JSON only; this file is never read by humans.
//
// Flow: PipelineResult.allNodes -> one SearchDoc per node (name, nameparts
// from the camel/snake splitter, path tokens, technical/business/security
// summaries) -> buildEngine -> { envelope, engine } where envelope wraps the
// MiniSearch serialization with version + commit provenance. Rebuilding from
// the same commit JSON must be deterministic apart from builtAt.

import type { PipelineResult, CodeNode } from "devlensio";
import { buildEngine, SEARCH_INDEXER_VERSION } from "./searchEngine.js";
import type { SearchDoc } from "./searchEngine.js";
import { splitNameparts, splitPath } from "./tokenizer.js";
import type { SearchEnvelope } from "./types.js";
import type MiniSearch from "minisearch";
import type { SearchDoc as SearchDocT } from "./searchEngine.js";

export function nodeToDoc(node: CodeNode): SearchDoc {
  return {
    id: node.id,
    name: node.name ?? "",
    nameparts: splitNameparts(node.name ?? "").join(" "),
    path: splitPath(node.filePath ?? "").join(" "),
    tech: node.technicalSummary ?? "",
    biz: node.businessSummary ?? "",
    sec: node.security?.summary ?? "",
  };
}

export function buildIndex(
  result: PipelineResult
): { envelope: SearchEnvelope; engine: MiniSearch<SearchDocT> } {
  const docs = result.allNodes.map(nodeToDoc);
  const engine = buildEngine(docs);
  const envelope: SearchEnvelope = {
    envelopeVersion: 1,
    indexerVersion: SEARCH_INDEXER_VERSION,
    commitHash: result.gitInfo.commitHash,
    builtAt: new Date().toISOString(),
    docs: docs.length,
    engine: engine.toJSON(),
  };
  return { envelope, engine };
}
