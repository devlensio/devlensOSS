// ─── Summarization Architecture ───────────────────────────────────────────────
//
// Triggered after Phase 1 (analysis) completes for a job.
//
// SMART REUSE
//   Before summarizing, we check if the commit was already summarized (skip entirely),
//   or if a previous summarized commit exists — nodes whose codeHash hasn't changed
//   get their summaries copied for free without any LLM call.
//
// JOB-SCOPED INDEXES
//   edgeIndex, routeIndex, systemPrompt, and allNodesMap are built ONCE per job
//   before the batch loop starts. A job is tied to a single commit — nodes, edges,
//   and routes never change mid-job even if the user edits code. Building indexes
//   once and reusing them across all batches avoids O(n×e) redundant work.
//
// THREE PHASES (in order)
//   Phase 1 — nodeOrder[][]   topo-sorted levels, each level runs in parallel
//   Phase 2 — cycleGroups[]   nodes with circular deps, grouped or individual
//   Phase 3 — fileNodes[]     FILE nodes last — use child summaries as context
//
// PAUSE / CANCEL
//   Signals are checked between levels/groups — never mid-level.
//   Levels complete atomically so resume always starts at a clean boundary.
//   Checkpoint is saved after every level/group — O(1) resume via lastCompletedLevel.
//
// MAPREDUCE
//   Nodes whose rawCode exceeds MAPREDUCE_TOKEN_THRESHOLD are split into chunks,
//   each chunk summarized in parallel (map), then reduced into one final summary.

import { storage }               from "../storage";
import { resolveConfig }         from "../config";
import { CodeNode }              from "../types";
import { FILE_BATCH_SIZE, SummarizationInput }    from "./types";
import { buildTopologicalOrder } from "./topological";
import {
  createCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  getResumePoint,
  markLevelCompleted,
  markCycleGroupCompleted,
  markFileNodeCompleted,
  markFileNodeBatchCompleted,
} from "./checkpoint";
import {
  buildEdgeIndex,
  buildRouteIndex,
  buildSystemPrompt,
  buildPrompt,
  buildCycleGroupPrompt,
} from "./prompts";
import { createLLMClient }       from "./providers";
import { exceedsThreshold, mapreduceSummarize } from "./mapreduce";
import { MAX_GROUP_SUMMARY_SIZE } from "./types";
 
// ─── runSummarization ─────────────────────────────────────────────────────────
//
// Main entry point — called by runner.ts after Phase 1 completes.
// Handles fresh runs and resumes from checkpoint transparently.
//
// Flow:
//   1. Load commit data (nodes, edges, fingerprint, routes)
//   2. Check if already summarized → skip
//   3. Copy summaries from previous commit where codeHash matches → free reuse
//   4. Build indexes once (edges, routes, system prompt, allNodes map)
//   5. Build or load checkpoint
//   6. Run three phases: nodeOrder levels → cycleGroups → fileNodes
//   7. Save summaries to storage after every level/group
//   8. Check pause/cancel signals between levels
 
export async function runSummarization(input: SummarizationInput): Promise<void> {
  const { job, queue, graphId, commitHash, repoPath, routes, callbacks } = input;
 
  // ── Step 1: Load commit data ───────────────────────────────────────────────
  const result = storage.getGraph(graphId, commitHash);
  if (!result) {
    callbacks.onError(`Commit data not found: ${graphId}/${commitHash}`);
    return;
  }
 
  // ── Step 2: Skip if already summarized ────────────────────────────────────
  if (storage.isCommitSummarized(graphId, commitHash)) {
    callbacks.onComplete();
    return;
  }
 
  // ── Step 3: Copy summaries from previous commit where codeHash matches ────
  // Nodes whose code hasn't changed don't need re-summarization.
  // We identify them by codeHash — if it matches, copy the summary directly.
  if (input.previousCommitHash) {
    const prevResult = storage.getGraph(graphId, input.previousCommitHash);
    if (prevResult) {
      const prevById = new Map(prevResult.allNodes.map(n => [n.id, n]));
      for (const node of result.allNodes) {
        const prev = prevById.get(node.id);
        if (
          prev &&
          prev.technicalSummary &&
          node.codeHash &&
          node.codeHash === prev.codeHash
        ) {
          node.technicalSummary = prev.technicalSummary;
          node.businessSummary  = prev.businessSummary;
          node.security         = prev.security;
          node.summaryModel     = prev.summaryModel;
          node.summarizedAt     = prev.summarizedAt;
        }
      }
    }
  }
 
  // ── Step 4: Build job-scoped indexes — built once, reused every batch ─────
  const config      = await resolveConfig();
  const client      = createLLMClient(config.summarization);
  const allNodesMap = new Map<string, CodeNode>(result.allNodes.map(n => [n.id, n]));
  const edgeIndex   = buildEdgeIndex(result.allEdges);
  const routeIndex  = buildRouteIndex(routes);
  const systemPrompt = buildSystemPrompt(result.fingerprint);
 
  // Validate LLM connection before starting — fail fast
  try {
    await client.validateConnection();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM connection failed";
    callbacks.onError(msg);
    return;
  }
 
  // ── Step 5: Build or load checkpoint ──────────────────────────────────────
  let checkpoint = loadCheckpoint(graphId, commitHash);
  const isResume = !!checkpoint;
 
  if (!checkpoint) {
    // Fresh run — build topo order and create checkpoint
    const { nodeOrder, cycleGroups, fileNodes } = buildTopologicalOrder(
      result.allNodes,
      result.allEdges
    );
    checkpoint = createCheckpoint(graphId, commitHash, nodeOrder, cycleGroups, fileNodes);
  }
 
  // On resume: nodes from already-completed levels may have summaries in memory
  // (merged into the commit file by saveGraph on restart) but saveBatch will never
  // be called for skipped levels — so those summaries would sit in memory and never
  // be re-persisted after the fresh saveGraph overwrote the file.
  // Fix: flush all already-summarized nodes to disk in one pass before the loop starts.
  if (isResume) {
    const alreadySummarized = result.allNodes.filter(n => n.technicalSummary);
    if (alreadySummarized.length > 0) {
      const updates = new Map(alreadySummarized.map(n => [n.id, {
        technicalSummary: n.technicalSummary!,
        businessSummary:  n.businessSummary  ?? "",
        security:         n.security  ??  { severity: "none" as const, summary: "" },
        summaryModel:     n.summaryModel     ?? "",
        summarizedAt:     n.summarizedAt     ?? new Date().toISOString(),
      }]));
      storage.saveNodeSummaries(graphId, commitHash, updates);
      console.log(`♻️  Re-persisted ${alreadySummarized.length} summaries from pre-crash levels`);
    }
  }
 
  // Notify caller of total work
  callbacks.onStarted(checkpoint.totalNodes);
 
  // ── Helper: summarize one node ────────────────────────────────────────────
  async function summarizeNode(node: CodeNode): Promise<void> {
    // Skip if already summarized (copied from previous commit)
    if (node.technicalSummary) return;
 
    const output = exceedsThreshold(node)
      ? await mapreduceSummarize(node, client, systemPrompt)
      : await client.summarize({
          messages: buildPrompt({ node, allNodes: allNodesMap, edgeIndex, routeIndex, systemPrompt }),
          temperature: 0,
        });
 
    // Write summary back onto node in memory
    node.technicalSummary = output.technicalSummary;
    node.businessSummary  = output.businessSummary;
    node.security         = output.security;
    node.summaryModel     = client.model;
    node.summarizedAt     = new Date().toISOString();
  }
 
  // ── Helper: save a batch of node updates to disk ──────────────────────────
  function saveBatch(nodes: CodeNode[]): void {
    const updates = new Map(nodes.map(n => [n.id, {
      technicalSummary: n.technicalSummary!,
      businessSummary:  n.businessSummary  ?? "",
      security:         n.security         ?? { severity: "none" as const, summary: "" },
      summaryModel:     n.summaryModel     ?? client.model,
      summarizedAt:     n.summarizedAt     ?? new Date().toISOString(),
    }]));
    storage.saveNodeSummaries(graphId, commitHash, updates);
  }
 
  // ── Helper: check pause/cancel signals ────────────────────────────────────
  function shouldPause(): boolean  { return queue.getJob(job.jobId)?.pauseRequested  ?? false; }
  function shouldCancel(): boolean { return queue.getJob(job.jobId)?.cancelRequested ?? false; }
 
  // ── Derive start indexes for all three phases ─────────────────────────────
  // If resumePoint is past a phase entirely, start index = length (skips loop).
  const resumePoint = getResumePoint(checkpoint);
 
  const levelStart = resumePoint.phase === "nodes"                                 ? resumePoint.index :
                     resumePoint.phase === "done"                                  ? checkpoint.nodeOrder.length :
                     /* cycles or files — nodes already done */                      checkpoint.nodeOrder.length;
 
  const cycleStart = resumePoint.phase === "cycles"                                ? resumePoint.index :
                     resumePoint.phase === "files" || resumePoint.phase === "done" ? checkpoint.cycleGroups.length :
                     /* nodes phase — cycles not started yet */                      0;
 
  const fileStart  = resumePoint.phase === "files"                                 ? resumePoint.index :
                     resumePoint.phase === "done"                                  ? checkpoint.fileNodes.length :
                     /* nodes or cycles phase — files not started yet */             0;
 
  // ── Step 6: Phase 1 — nodeOrder levels ────────────────────────────────────
  // Each level is independent — all nodes in a level run in parallel.
  // Levels complete atomically — checkpoint saves after each full level.
  for (let lvl = levelStart; lvl < checkpoint.nodeOrder.length; lvl++) {
      const level = checkpoint.nodeOrder[lvl];
      const nodes = level.map(id => allNodesMap.get(id)).filter(Boolean) as CodeNode[];
 
      // All nodes in this level summarized in parallel
      await Promise.all(nodes.map(summarizeNode));
 
      saveBatch(nodes);
      markLevelCompleted(checkpoint, lvl);
      saveCheckpoint(checkpoint);
      callbacks.onProgress(checkpoint.completedNodes, checkpoint.totalNodes, `level ${lvl}`);
 
      if (shouldCancel()) {
        deleteCheckpoint(graphId, commitHash);
        callbacks.onCancel(true);
        return;
      }
 
      if (shouldPause()) {
        checkpoint.status = "paused";
        saveCheckpoint(checkpoint);
        callbacks.onPause();
        return;
      }
  }
 
  // ── Step 7: Phase 2 — cycleGroups ─────────────────────────────────────────
  for (let gi = cycleStart; gi < checkpoint.cycleGroups.length; gi++) {
    const group = checkpoint.cycleGroups[gi];
    const nodes = group.nodeIds.map(id => allNodesMap.get(id)).filter(Boolean) as CodeNode[];
 
    if (group.size <= MAX_GROUP_SUMMARY_SIZE) {
      // Small cycle — one grouped LLM call
      const messages = buildCycleGroupPrompt(group.nodeIds, { allNodes: allNodesMap, edgeIndex, routeIndex, systemPrompt });
      const output   = await client.summarize({ messages, temperature: 0 });
 
      // For grouped calls the LLM returns one summary — apply to all nodes in group
      for (const node of nodes) {
        node.technicalSummary = output.technicalSummary;
        node.businessSummary  = output.businessSummary;
        node.security         = output.security;
        node.summaryModel     = client.model;
        node.summarizedAt     = new Date().toISOString();
      }
    } else {
      // Large cycle — summarize individually
      await Promise.all(nodes.map(summarizeNode));
    }
 
    saveBatch(nodes);
    markCycleGroupCompleted(checkpoint, gi);
    saveCheckpoint(checkpoint);
    callbacks.onProgress(checkpoint.completedNodes, checkpoint.totalNodes, `cycle group ${gi}`);
 
    if (shouldCancel()) {
      deleteCheckpoint(graphId, commitHash);
      callbacks.onCancel(true);
      return;
    }
 
    if (shouldPause()) {
      checkpoint.status = "paused";
      saveCheckpoint(checkpoint);
      callbacks.onPause();
      return;
    }
  }
 
  // ── Step 8: Phase 3 — fileNodes ───────────────────────────────────────────
  // FILE nodes summarized last — they use child summaries as context.
   for (let fi = fileStart; fi < checkpoint.fileNodes.length; fi += FILE_BATCH_SIZE) {
    const batchEnd   = Math.min(fi + FILE_BATCH_SIZE - 1, checkpoint.fileNodes.length - 1);
    const batchIds   = checkpoint.fileNodes.slice(fi, batchEnd + 1);
    const batchNodes = batchIds.map(id => allNodesMap.get(id)).filter(Boolean) as CodeNode[];
 
    await Promise.all(batchNodes.map(summarizeNode));
 
    saveBatch(batchNodes);
    markFileNodeBatchCompleted(checkpoint, batchEnd, batchNodes.length);
    saveCheckpoint(checkpoint);
    callbacks.onProgress(
      checkpoint.completedNodes,
      checkpoint.totalNodes,
      `file batch ${fi}-${batchEnd}`
    );
 
    if (shouldCancel()) {
      deleteCheckpoint(graphId, commitHash);
      callbacks.onCancel(true);
      return;
    }
 
    if (shouldPause()) {
      checkpoint.status = "paused";
      saveCheckpoint(checkpoint);
      callbacks.onPause();
      return;
    }
  }
 
  // ── Done ──────────────────────────────────────────────────────────────────
  storage.markCommitSummarized(graphId, commitHash);
  deleteCheckpoint(graphId, commitHash);
  callbacks.onComplete();
}