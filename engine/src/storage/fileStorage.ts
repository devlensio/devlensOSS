import fs         from "fs";
import path       from "path";
import os         from "os";
import simpleGit  from "simple-git";
import { PipelineResult, PipelineStats, GitInfo } from "../pipeline";
import { CodeNode, CodeEdge } from "../types";
import { GraphStorage } from "./interface";

// ─── Storage layout ───────────────────────────────────────────────────────────
//
//   ~/.devlens/
//   ├── index.json                  lightweight list of all repos
//   └── graphs/
//       └── {graphId}/              one folder per repo (stable hash of path)
//           ├── meta.json           fingerprint, routes, commit history
//           └── commits/
//               └── {hash}.json    full node/edge data per commit
//
// Diffs are computed on demand — not stored.
// GitHub scope is reserved in meta.json for future cloud repo support.

const STORAGE_DIR    = path.join(os.homedir(), ".devlens");
const GRAPHS_DIR     = path.join(STORAGE_DIR, "graphs");
const INDEX_FILE     = path.join(STORAGE_DIR, "index.json");
const SCHEMA_VERSION = "1.0";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GraphIndexEntry {
  graphId:          string;
  repoPath:         string;
  isGithubRepo:     boolean;
  githubUrl:        string | null;   // reserved for cloud repo support
  framework:        string;
  language:         string;
  latestCommit:     string;
  latestAnalyzedAt: string;
  commitCount:      number;
}

export interface CommitSummary {
  commitHash:    string;
  branch:        string;
  message:       string;
  analyzedAt:    string;
  nodeCount:     number;
  edgeCount:     number;
  hasGit:        boolean;
  isSummarized?: boolean;  // true = summaries written onto nodes in this commit
}

export interface GraphMeta {
  graphId:      string;
  repoPath:     string;
  isGithubRepo: boolean;
  githubUrl:    string | null;    // reserved
  githubOwner:  string | null;    // reserved
  githubRepo:   string | null;    // reserved
  fingerprint:  PipelineResult["fingerprint"];
  routes:       PipelineResult["routes"];
  commits:      CommitSummary[];
  summarizedCommits: string[];
}

export interface CommitData {
  commitHash: string;
  analyzedAt: string;
  nodes:      CodeNode[];
  edges:      CodeEdge[];
  allNodes:   CodeNode[];
  allEdges:   CodeEdge[];
  nodeScores: Record<string, number>;
  stats:      PipelineStats;
}

// Diff types — computed on demand, never stored
export interface NodeDiff {
  added:        DiffNode[];
  removed:      DiffNode[];
  scoreChanged: ScoreChange[];
  edgesChanged: EdgeChange[];
  moved:        MovedNode[];
  unchanged:    number;
}

interface DiffNode {
  nodeId:   string;
  name:     string;
  type:     string;
  score:    number;
  filePath: string;
}

interface ScoreChange {
  nodeId:      string;
  name:        string;
  type:        string;
  scoreBefore: number;
  scoreAfter:  number;
  delta:       number;
}

interface EdgeChange {
  nodeId:       string;
  name:         string;
  addedEdges:   { to: string; type: string }[];
  removedEdges: { to: string; type: string }[];
}

interface MovedNode {
  nodeId:      string;
  name:        string;
  fromFile:    string;
  toFile:      string;
  scoreBefore: number;
  scoreAfter:  number;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function graphDir(graphId: string): string {
  return path.join(GRAPHS_DIR, graphId);
}

function metaFile(graphId: string): string {
  return path.join(graphDir(graphId), "meta.json");
}

function commitsDir(graphId: string): string {
  return path.join(graphDir(graphId), "commits");
}

function commitFile(graphId: string, commitHash: string): string {
  return path.join(commitsDir(graphId), `${commitHash}.json`);
}

// Checkpoint file for summarization progress — one per commit
// Purely a progress tracker — summaries live on nodes in commitFile()
function checkpointFile(graphId: string, commitHash: string): string {
  return path.join(commitsDir(graphId), `${commitHash}.summaries.json`);
}

// Exported so checkpoint.ts knows where to read/write
export function getCheckpointPath(graphId: string, commitHash: string): string {
  return checkpointFile(graphId, commitHash);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function ensureStorageExists(): void {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(GRAPHS_DIR))  fs.mkdirSync(GRAPHS_DIR,  { recursive: true });
  if (!fs.existsSync(INDEX_FILE))  writeIndex({ version: SCHEMA_VERSION, graphs: [] });
}

function ensureGraphDirExists(graphId: string): void {
  const dir = graphDir(graphId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const cDir = commitsDir(graphId);
  if (!fs.existsSync(cDir)) fs.mkdirSync(cDir, { recursive: true });
}

// ─── Index helpers ────────────────────────────────────────────────────────────

interface StorageIndex {
  version: string;
  graphs:  GraphIndexEntry[];
}

function readIndex(): StorageIndex {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8")) as StorageIndex;
  } catch {
    return { version: SCHEMA_VERSION, graphs: [] };
  }
}

function writeIndex(index: StorageIndex): void {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}

// ─── Meta helpers ─────────────────────────────────────────────────────────────

function readMeta(graphId: string): GraphMeta | undefined {
  const file = metaFile(graphId);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as GraphMeta;
  } catch {
    return undefined;
  }
}

function writeMeta(meta: GraphMeta): void {
  fs.writeFileSync(metaFile(meta.graphId), JSON.stringify(meta, null, 2), "utf-8");
}

// ─── Build helpers ────────────────────────────────────────────────────────────

function buildIndexEntry(
  result: PipelineResult,
  commitCount: number
): GraphIndexEntry {
  return {
    graphId:          result.graphId,
    repoPath:         result.repoPath,
    isGithubRepo:     result.isGithubRepo,
    githubUrl:        null,   // populated when GitHub support is added
    framework:        result.fingerprint.framework,
    language:         result.fingerprint.language,
    latestCommit:     result.gitInfo.commitHash,
    latestAnalyzedAt: result.analyzedAt,
    commitCount,
  };
}

function buildCommitSummary(result: PipelineResult): CommitSummary {
  return {
    commitHash: result.gitInfo.commitHash,
    branch:     result.gitInfo.branch,
    message:    result.gitInfo.message,
    analyzedAt: result.analyzedAt,
    nodeCount:  result.nodes.length,
    edgeCount:  result.edges.length,
    hasGit:     result.gitInfo.hasGit,
  };
}

function buildCommitData(result: PipelineResult): CommitData {
  return {
    commitHash: result.gitInfo.commitHash,
    analyzedAt: result.analyzedAt,
    nodes:      result.nodes,
    edges:      result.edges,
    allNodes:   result.allNodes,
    allEdges:   result.allEdges,
    nodeScores: result.nodeScores,
    stats:      result.stats,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function saveGraph(result: PipelineResult, options?: { force?: boolean }): void {
  ensureStorageExists();
  ensureGraphDirExists(result.graphId);
 
  const commitHash = result.gitInfo.commitHash;
 
  // ── 1. Write commit data file ────────────────────────────────
  const cFile = commitFile(result.graphId, commitHash);
 
  const commitData = buildCommitData(result);
 
  // If a commit file already exists and force is not set, preserve any
  // summaries already written onto nodes. This handles the crash-mid-
  // summarization case: server restarts, Phase 1 re-runs, saveGraph is
  // called again — without this merge, summaries written before the crash
  // are lost even though the checkpoint says those levels are done.
  if (!options?.force && fs.existsSync(cFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(cFile, "utf-8")) as CommitData;
 
      const summaryCache = new Map<string, {
        technicalSummary?: string;
        businessSummary?:  string;
        security?:         { severity: "none" | "low" | "medium" | "high"; summary: string };
        summaryModel?:     string;
        summarizedAt?:     string;
      }>();
 
      for (const node of existing.allNodes) {
        if (node.technicalSummary) {
          summaryCache.set(node.id, {
            technicalSummary: node.technicalSummary,
            businessSummary:  node.businessSummary,
            security:         node.security,
            summaryModel:     node.summaryModel,
            summarizedAt:     node.summarizedAt,
          });
        }
      }
 
      if (summaryCache.size > 0) {
        for (const node of commitData.allNodes) {
          const s = summaryCache.get(node.id);
          if (s) Object.assign(node, s);
        }
        for (const node of commitData.nodes) {
          const s = summaryCache.get(node.id);
          if (s) Object.assign(node, s);
        }
        console.log(`♻️  Preserved ${summaryCache.size} existing summaries for ${commitHash}`);
      }
    } catch {
      console.warn(`⚠️  Could not read existing commit file for ${commitHash} — writing fresh`);
    }
  }
 
  fs.writeFileSync(cFile, JSON.stringify(commitData, null, 2), "utf-8");
 
  // ── 2. Update meta.json ──────────────────────────────────────
  const existingMeta = readMeta(result.graphId);
  const newSummary   = buildCommitSummary(result);
 
  const meta: GraphMeta = existingMeta ?? {
    graphId:           result.graphId,
    repoPath:          result.repoPath,
    isGithubRepo:      result.isGithubRepo,
    githubUrl:         null,
    githubOwner:       null,
    githubRepo:        null,
    fingerprint:       result.fingerprint,
    routes:            result.routes,
    commits:           [],
    summarizedCommits: [],
  };
 
  // Replace if same commit already exists, else append
  const existingCommit = meta.commits.findIndex(
    (c) => c.commitHash === commitHash
  );
  if (existingCommit >= 0) {
    meta.commits[existingCommit] = newSummary;
  } else {
    meta.commits.push(newSummary);
  }
 
  // Keep commits sorted newest first
  meta.commits.sort((a, b) =>
    new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime()
  );
 
  writeMeta(meta);
 
  // ── 3. Update index.json ─────────────────────────────────────
  const index      = readIndex();
  const indexEntry = buildIndexEntry(result, meta.commits.length);
  const existing   = index.graphs.findIndex((g) => g.graphId === result.graphId);
 
  if (existing >= 0) {
    index.graphs[existing] = indexEntry;
  } else {
    index.graphs.push(indexEntry);
  }
 
  index.graphs.sort((a, b) =>
    new Date(b.latestAnalyzedAt).getTime() - new Date(a.latestAnalyzedAt).getTime()
  );
 
  writeIndex(index);
 
  console.log(`\n💾 Saved: ${cFile}`);
}

// Returns latest commit data merged with meta — reconstructs PipelineResult shape
export function getGraph(
  graphId: string,
  commitHash?: string   // defaults to latest commit
): PipelineResult | undefined {
  ensureStorageExists();

  const meta = readMeta(graphId);
  if (!meta || meta.commits.length === 0) return undefined;

  // Use provided commitHash or fall back to latest
  const targetHash = commitHash ?? meta.commits[0].commitHash;
  const cFile      = commitFile(graphId, targetHash);

  if (!fs.existsSync(cFile)) return undefined;

  try {
    const data = JSON.parse(fs.readFileSync(cFile, "utf-8")) as CommitData;

    // Reconstruct full PipelineResult from meta + commit data
    return {
      graphId:      meta.graphId,
      repoPath:     meta.repoPath,
      analyzedAt:   data.analyzedAt,
      fingerprint:  meta.fingerprint,
      routes:       meta.routes,
      nodes:        data.nodes,
      edges:        data.edges,
      allNodes:     data.allNodes,
      allEdges:     data.allEdges,
      nodeScores:   data.nodeScores,
      stats:        data.stats,
      isGithubRepo: meta.isGithubRepo,
      gitInfo: {
        commitHash: data.commitHash,
        branch:     meta.commits.find(c => c.commitHash === targetHash)?.branch  ?? "unknown",
        message:    meta.commits.find(c => c.commitHash === targetHash)?.message ?? "",
        hasGit:     meta.commits.find(c => c.commitHash === targetHash)?.hasGit  ?? false,
      },
    };
  } catch (err) {
    console.error(`Failed to read commit ${targetHash} for graph ${graphId}:`, err);
    return undefined;
  }
}

export function getNodeCode (
  graphId: string,
  commitHash: string, 
  nodeId: string
):  CodeNode | undefined {
  ensureStorageExists();
  const cFile = commitFile(graphId, commitHash);
  if(!fs.existsSync(cFile)) return undefined;

  try {
    const data = JSON.parse(fs.readFileSync(cFile, "utf-8")) as CommitData;
    return data.allNodes.find(n => n.id === nodeId);
  } catch (err) {
    console.error(`Failed to read node ${nodeId} from ${graphId}/${commitHash}:`, err);
    return undefined;
  }
}

export function listGraphs(): GraphIndexEntry[] {
  ensureStorageExists();
  return readIndex().graphs;
}

export function getGraphMeta(graphId: string): GraphMeta | undefined {
  ensureStorageExists();
  return readMeta(graphId);
}

export function deleteGraph(graphId: string): boolean {
  ensureStorageExists();

  const dir = graphDir(graphId);
  if (!fs.existsSync(dir)) return false;

  fs.rmSync(dir, { recursive: true, force: true });

  const index  = readIndex();
  index.graphs = index.graphs.filter((g) => g.graphId !== graphId);
  writeIndex(index);

  console.log(`🗑️  Deleted graph: ${graphId}`);
  return true;
}

export function deleteCommit(graphId: string, commitHash: string): boolean {
  ensureStorageExists();

  const cFile = commitFile(graphId, commitHash);
  if (!fs.existsSync(cFile)) return false;

  fs.unlinkSync(cFile);

  const meta = readMeta(graphId);
  if (meta) {
    meta.commits = meta.commits.filter((c) => c.commitHash !== commitHash);
    writeMeta(meta);

    // Update index entry
    const index   = readIndex();
    const entry   = index.graphs.find((g) => g.graphId === graphId);
    if (entry) {
      entry.commitCount      = meta.commits.length;
      entry.latestCommit     = meta.commits[0]?.commitHash     ?? "";
      entry.latestAnalyzedAt = meta.commits[0]?.analyzedAt     ?? "";
      writeIndex(index);
    }
  }

  console.log(`🗑️  Deleted commit ${commitHash} from graph ${graphId}`);
  return true;
}

// ─── Diff — computed on demand, never stored ──────────────────────────────────

const SCORE_CHANGE_THRESHOLD = 0.1;

export function diffCommits(
  graphId:      string,
  fromHash:     string,
  toHash:       string
): NodeDiff | undefined {
  ensureStorageExists();

  const fileA = commitFile(graphId, fromHash);
  const fileB = commitFile(graphId, toHash);

  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) return undefined;

  const dataA = JSON.parse(fs.readFileSync(fileA, "utf-8")) as CommitData;
  const dataB = JSON.parse(fs.readFileSync(fileB, "utf-8")) as CommitData;

  // Build id → node maps — O(n)
  const nodesA = new Map<string, CodeNode>(dataA.allNodes.map((n) => [n.id, n]));
  const nodesB = new Map<string, CodeNode>(dataB.allNodes.map((n) => [n.id, n]));

  // Build name+type → node map for A — used for moved node detection
  const byNameA = new Map<string, CodeNode>();
  for (const node of dataA.allNodes) {
    byNameA.set(`${node.name}::${node.type}`, node);
  }

  // Build edge maps — nodeId → Set of "type::targetId"
  const edgesA = new Map<string, Set<string>>();
  const edgesB = new Map<string, Set<string>>();

  for (const edge of dataA.allEdges) {
    if (!edgesA.has(edge.from)) edgesA.set(edge.from, new Set());
    edgesA.get(edge.from)!.add(`${edge.type}::${edge.to}`);
  }
  for (const edge of dataB.allEdges) {
    if (!edgesB.has(edge.from)) edgesB.set(edge.from, new Set());
    edgesB.get(edge.from)!.add(`${edge.type}::${edge.to}`);
  }

  const added:        DiffNode[]    = [];
  const removed:      DiffNode[]    = [];
  const scoreChanged: ScoreChange[] = [];
  const edgesChanged: EdgeChange[]  = [];
  const moved:        MovedNode[]   = [];
  const movedIds     = new Set<string>(); // track moved nodes to exclude from added/removed
  let   unchanged    = 0;

  // ── Find moved nodes first ───────────────────────────────────
  // Moved = same name+type, different filePath, id changed
  for (const [idB, nodeB] of nodesB) {
    if (nodesA.has(idB)) continue; // same id = not moved

    const key   = `${nodeB.name}::${nodeB.type}`;
    const nodeA = byNameA.get(key);

    if (nodeA && nodeA.filePath !== nodeB.filePath) {
      moved.push({
        nodeId:      idB,
        name:        nodeB.name,
        fromFile:    nodeA.filePath,
        toFile:      nodeB.filePath,
        scoreBefore: dataA.nodeScores[nodeA.id] ?? 0,
        scoreAfter:  dataB.nodeScores[idB]      ?? 0,
      });
      movedIds.add(idB);
      movedIds.add(nodeA.id);
    }
  }

  // ── Find added nodes ─────────────────────────────────────────
  for (const [idB, nodeB] of nodesB) {
    if (nodesA.has(idB) || movedIds.has(idB)) continue;
    added.push({
      nodeId:   idB,
      name:     nodeB.name,
      type:     nodeB.type,
      score:    dataB.nodeScores[idB] ?? 0,
      filePath: nodeB.filePath,
    });
  }

  // ── Find removed nodes ───────────────────────────────────────
  for (const [idA, nodeA] of nodesA) {
    if (nodesB.has(idA) || movedIds.has(idA)) continue;
    removed.push({
      nodeId:   idA,
      name:     nodeA.name,
      type:     nodeA.type,
      score:    dataA.nodeScores[idA] ?? 0,
      filePath: nodeA.filePath,
    });
  }

  // ── Find score and edge changes for nodes in both commits ────
  for (const [idA, nodeA] of nodesA) {
    const nodeB = nodesB.get(idA);
    if (!nodeB || movedIds.has(idA)) continue;

    const scoreA = dataA.nodeScores[idA] ?? 0;
    const scoreB = dataB.nodeScores[idA] ?? 0;
    const delta  = scoreB - scoreA;

    if (Math.abs(delta) >= SCORE_CHANGE_THRESHOLD) {
      scoreChanged.push({
        nodeId:      idA,
        name:        nodeA.name,
        type:        nodeA.type,
        scoreBefore: scoreA,
        scoreAfter:  scoreB,
        delta:       parseFloat(delta.toFixed(2)),
      });
    }

    // Edge diff for this node
    const eA = edgesA.get(idA) ?? new Set<string>();
    const eB = edgesB.get(idA) ?? new Set<string>();

    const addedEdges   = [...eB].filter((e) => !eA.has(e)).map((e) => {
      const [type, to] = e.split("::");
      return { type, to };
    });
    const removedEdges = [...eA].filter((e) => !eB.has(e)).map((e) => {
      const [type, to] = e.split("::");
      return { type, to };
    });

    if (addedEdges.length > 0 || removedEdges.length > 0) {
      edgesChanged.push({
        nodeId:       idA,
        name:         nodeA.name,
        addedEdges,
        removedEdges,
      });
    } else if (Math.abs(delta) < SCORE_CHANGE_THRESHOLD) {
      unchanged++;
    }
  }

  // Sort score changes by absolute delta descending
  scoreChanged.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { added, removed, scoreChanged, edgesChanged, moved, unchanged };
}


// ─── Summarization helpers ────────────────────────────────────────────────────

// Marks a commit as fully summarized in meta.json.
// Called by the summarizer after all nodes in a commit have been summarized.
// Uses commit hash as key — globally unique, works across branches.
export function markCommitSummarized(
  graphId:    string,
  commitHash: string
): void {
  ensureStorageExists();
  const meta = readMeta(graphId);
  if (!meta) return;

  // Add to summarizedCommits set if not already there
  if (!meta.summarizedCommits?.includes(commitHash)) {
    meta.summarizedCommits?.push(commitHash);
  }

  // Also update the isSummarized flag on the CommitSummary entry
  const commit = meta.commits.find(c => c.commitHash === commitHash);
  if (commit) commit.isSummarized = true;

  writeMeta(meta);
  console.log(`✅ Marked commit ${commitHash} as summarized`);
}

// Checks if a commit has already been summarized.
// Fast lookup — O(n) but summarizedCommits list is small.
export function isCommitSummarized(
  graphId:    string,
  commitHash: string
): boolean {
  const meta = readMeta(graphId);
  if (!meta) return false;
  return meta.summarizedCommits?.includes(commitHash);
}

// Finds the most recent ancestor commit that has been summarized.
// Uses simple-git to walk the commit history of the repo.
// Returns undefined if no summarized ancestor exists (= full summarization needed).
//
// This works correctly across branches because commit hashes are globally unique.
// If branch A and branch B both point to commit C, and C is summarized,
// both branches benefit — no re-summarization needed.
export async function findLastSummarizedAncestor(
  graphId:    string,
  commitHash: string,
  repoPath:   string
): Promise<string | undefined> {
  const meta = readMeta(graphId);
  if (!meta || meta.summarizedCommits?.length === 0) return undefined;
 
  const summarizedSet = new Set(meta.summarizedCommits);
 
  // No-git repos use timestamp hashes — there is no ancestry to walk.
  // The only useful check is whether this exact commit was already summarized,
  // but that's handled by isCommitSummarized() before this is ever called.
  // Smart reuse across runs is not possible without git history.
  const commitEntry = meta.commits.find(c => c.commitHash === commitHash);
  if (commitEntry && !commitEntry.hasGit) return undefined;
 
  try {
    const git = simpleGit(repoPath);
 
    const log = await git.log({
      from: commitHash,
      "--ancestry-path": null,
    } as any);
 
    // Walk history newest to oldest — first summarized ancestor wins
    for (const commit of log.all) {
      if (summarizedSet.has(commit.hash)) return commit.hash;
    }
 
    // Also check short hashes — git sometimes uses 7-char short hashes
    for (const commit of log.all) {
      const shortHash = commit.hash.slice(0, 7);
      if (summarizedSet.has(shortHash)) return shortHash;
    }
 
    return undefined;
 
  } catch (err) {
    console.warn(`Could not walk git history for ${repoPath}:`, err);
    return undefined;
  }
}

// Saves summaries back onto nodes in the commit file after each batch.
// Called by the summarizer after each batch completes.
// Merges summary fields onto existing nodes — never replaces the whole file.
//
// nodeUpdates: Map<nodeId, NodeSummary> — only the nodes summarized in this batch
export function saveNodeSummaries(
  graphId:     string,
  commitHash:  string,
  nodeUpdates: Map<string, {
    technicalSummary: string;
    businessSummary:  string;
    security:         { severity: "none" | "low" | "medium" | "high"; summary: string };
    summaryModel:     string;
    summarizedAt:     string;
  }>
): void {
  ensureStorageExists();

  const cFile = commitFile(graphId, commitHash);
  if (!fs.existsSync(cFile)) {
    console.error(`Cannot save summaries — commit file not found: ${cFile}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(cFile, "utf-8")) as CommitData;

  // Build id → node maps once — O(n)
  // JSON.parse gives independent copies of allNodes and nodes (filtered copy from allNodes),
  // so both arrays need updating. Maps let us apply the batch
  // in O(b) instead of scanning all nodes per update.
  const allNodesById = new Map(data.allNodes.map(n => [n.id, n]));
  const nodesById    = new Map(data.nodes.map(n    => [n.id, n]));

  // Apply updates — O(b) where b = batch size
  let updatedCount = 0;
  for (const [nodeId, summary] of nodeUpdates) {
    const apply = (node: CodeNode) => {
      node.technicalSummary = summary.technicalSummary;
      node.businessSummary  = summary.businessSummary;
      node.security         = summary.security;
      node.summaryModel     = summary.summaryModel;
      node.summarizedAt     = summary.summarizedAt;
    };

    const allNode = allNodesById.get(nodeId);
    if (allNode) { apply(allNode); updatedCount++; }

    const node = nodesById.get(nodeId);
    if (node) apply(node);
  }

  // Write back atomically
  const tmp = `${cFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, cFile);

  console.log(`💾 Saved ${updatedCount} node summaries to ${commitHash}`);
}


export function removeFromSummarizedCommits(graphId: string, commitHash: string): void {
  const meta = readMeta(graphId);
  if (!meta) return;
  meta.summarizedCommits = (meta.summarizedCommits ?? []).filter(h => h !== commitHash);
  // Also reset isSummarized flag on the commit entry
  const commit = meta.commits.find(c => c.commitHash === commitHash);
  if (commit) commit.isSummarized = false;
  writeMeta(meta);
}

export const fileStorage: GraphStorage = {
  saveGraph,
  getGraph,
  listGraphs,
  getGraphMeta,
  deleteGraph,
  diffCommits,
  markCommitSummarized,
  isCommitSummarized,
  findLastSummarizedAncestor,
  saveNodeSummaries,
  getCheckpointPath,
  removeFromSummarizedCommits
};


// What each function does:

// saveGraph()       → writes 3 things: commit file, meta.json, index.json
// getGraph()        → reads meta + commit file, reconstructs PipelineResult
// listGraphs()      → reads index.json only, never touches graph folders
// getGraphMeta()    → reads meta.json — returns commit history for a repo
// deleteGraph()     → deletes entire folder + removes from index
// deleteCommit()    → deletes one commit file + updates meta + index
// diffCommits()     → loads two commit files, computes O(n) diff, returns result