// indexManager.ts
//
// Architecture: owns the lifecycle of .search.json files on disk and the
// in-memory cache of parsed indexes. Everything the search stack needs to
// touch storage goes through here, so the rest of the module stays pure.
//
// Flow: ensureIndex(graphId, commitHash) -> if a valid .search.json exists,
// parse (or reuse LRU cache) and return it. If it is missing, LAZY BUILD:
// load the commit graph through the engine storage API, run the indexer,
// write the file compactly, mark isIndexed in meta, return the fresh engine.
// If the commit JSON itself is missing, return null; callers must translate
// that into a "graph needs re-analyzing" response, never an error. Cache is
// an LRU (32 entries, 10 min TTL) keyed graphId@commitHash because parsing a
// large index per request would dominate latency. invalidate() hooks are
// called by analyze, /api/reindex handlers and tool mutations.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LRUCache } from "lru-cache";
import { storage } from "devlensio";
import { loadEngine } from "./searchEngine.js";
import type MiniSearch from "minisearch";
import type { SearchDoc } from "./searchEngine.js";
import { buildIndex } from "./indexer.js";
import { SEARCH_INDEXER_VERSION } from "./searchEngine.js";
import type { CachedIndex, SearchEnvelope } from "./types.js";

const CACHE = new LRUCache<string, CachedIndex>({ max: 32, ttl: 10 * 60 * 1000 });

export function devlensRoot(): string {
  return path.join(os.homedir(), ".devlens");
}

export function searchIndexPath(graphId: string, commitHash: string): string {
  return path.join(
    devlensRoot(),
    "graphs",
    graphId,
    "commits",
    `${commitHash}.search.json`
  );
}

function readEnvelope(indexPath: string): SearchEnvelope | null {
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as SearchEnvelope;
    if (!parsed || parsed.envelopeVersion !== 1 || !parsed.engine) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cacheKey(graphId: string, commitHash: string): string {
  return `${graphId}@${commitHash}`;
}

export function getCached(
  graphId: string,
  commitHash: string
): MiniSearch<SearchDoc> | null {
  return CACHE.get(cacheKey(graphId, commitHash))?.engine ?? null;
}

function loadFresh(
  graphId: string,
  commitHash: string,
  envelope: SearchEnvelope
): MiniSearch<SearchDoc> {
  const engine = loadEngine(envelope.engine);
  CACHE.set(cacheKey(graphId, commitHash), {
    engine,
    envelope,
    loadedAt: Date.now(),
  });
  return engine;
}

export interface EnsureResult {
  engine: MiniSearch<SearchDoc> | null;
  origin: "cache" | "file" | "lazy-build" | "missing";
}

export function ensureIndex(
  graphId: string,
  commitHash: string
): EnsureResult {
  const cached = CACHE.get(cacheKey(graphId, commitHash));
  if (cached) return { engine: cached.engine, origin: "cache" };

  const indexPath = searchIndexPath(graphId, commitHash);
  if (fs.existsSync(indexPath)) {
    const envelope = readEnvelope(indexPath);
    if (envelope) {
      return { engine: loadFresh(graphId, commitHash, envelope), origin: "file" };
    }
    // corrupt file: fall through to lazy build, which overwrites it
  }

  const result = storage.getGraph(graphId, commitHash);
  if (!result) return { engine: null, origin: "missing" };

  const { envelope, engine } = buildIndex(result);
  const dir = path.dirname(indexPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(envelope), "utf-8");
  try {
    storage.markCommitIndexed(graphId, commitHash);
  } catch {
    // older engine builds without markCommitIndexed: index still works
  }
  CACHE.set(cacheKey(graphId, commitHash), {
    engine,
    envelope,
    loadedAt: Date.now(),
  });
  return { engine, origin: "lazy-build" };
}

export function writeIndex(
  graphId: string,
  commitHash: string,
  envelope: SearchEnvelope,
  engine: MiniSearch<SearchDoc>
): void {
  const indexPath = searchIndexPath(graphId, commitHash);
  const dir = path.dirname(indexPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(envelope), "utf-8");
  try {
    storage.markCommitIndexed(graphId, commitHash);
  } catch {
    // older engine builds without markCommitIndexed: index still works
  }
  CACHE.set(cacheKey(graphId, commitHash), {
    engine,
    envelope,
    loadedAt: Date.now(),
  });
}

export function invalidate(graphId: string, commitHash?: string): void {
  if (commitHash) {
    CACHE.delete(cacheKey(graphId, commitHash));
    return;
  }
  for (const key of CACHE.keys()) {
    if (key.startsWith(`${graphId}@`)) CACHE.delete(key);
  }
}

export function isIndexedOnDisk(graphId: string, commitHash: string): boolean {
  return fs.existsSync(searchIndexPath(graphId, commitHash));
}

export function currentIndexerVersion(): string {
  return SEARCH_INDEXER_VERSION;
}
