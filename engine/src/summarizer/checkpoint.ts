// Purely a read/write utility — no LLM calls, no complex logic.
//
// createCheckpoint()  — called at start of fresh summarization run
// loadCheckpoint()    — called on resume
// saveCheckpoint()    — called after every level/group completes
// deleteCheckpoint()  — called on cancel or completion
// getResumePoint()    — returns { phase, levelIndex } — where to continue from

import fs from "fs";
import { getCheckpointPath } from "../storage/fileStorage";
import type { SummaryCheckpoint } from "./types";

// ─── Load / Save / Delete ─────────────────────────────────────────────────────

export function loadCheckpoint(graphId: string, commitHash: string): SummaryCheckpoint | undefined {
  const file = getCheckpointPath(graphId, commitHash);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as SummaryCheckpoint;
  } catch {
    return undefined;
  }
}

export function saveCheckpoint(checkpoint: SummaryCheckpoint): void {
  const file = getCheckpointPath(checkpoint.graphId, checkpoint.commitHash);
  checkpoint.updatedAt = new Date().toISOString();

  // Atomic write — never corrupts on crash mid-write
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

export function deleteCheckpoint(graphId: string, commitHash: string): void {
  const file = getCheckpointPath(graphId, commitHash);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ─── Create ───────────────────────────────────────────────────────────────────
//
// Called once at the start of a fresh summarization run.
// nodeOrder is now string[][] — each inner array is one parallel level.
// On resume we load this file and never redo the topo sort.

export function createCheckpoint(
  graphId:     string,
  commitHash:  string,
  nodeOrder:   string[][],
  cycleGroups: SummaryCheckpoint["cycleGroups"],
  fileNodes:   string[],
): SummaryCheckpoint {
  const now = new Date().toISOString();

  const totalRegularNodes  = nodeOrder.reduce((sum, level) => sum + level.length, 0);
  const totalCycleNodes    = cycleGroups.reduce((sum, g) => sum + g.size, 0);
  const totalNodes         = totalRegularNodes + totalCycleNodes + fileNodes.length;

  const checkpoint: SummaryCheckpoint = {
    graphId,
    commitHash,
    status:    "running",
    createdAt: now,
    updatedAt: now,

    nodeOrder,
    cycleGroups,
    fileNodes,

    // -1 = not started for all three phases
    lastCompletedLevel:      -1,
    lastCompletedCycleGroup: -1,
    lastCompletedFileNode:   -1,

    totalNodes,
    completedNodes: 0,
  };

  saveCheckpoint(checkpoint);
  return checkpoint;
}

// ─── Resume ───────────────────────────────────────────────────────────────────
//
// Returns exactly where to continue from.
// Three phases in order:
//   Phase 1 — nodeOrder[][]  (regular nodes, topo sorted by level)
//   Phase 2 — cycleGroups[]  (cyclic nodes)
//   Phase 3 — fileNodes[]    (FILE nodes, always last)
//
// Levels complete atomically — if lastCompletedLevel = 2,
// levels 0,1,2 are fully done and we start from level 3.

export type ResumePhase = "nodes" | "cycles" | "files" | "done";

export interface ResumePoint {
  phase: ResumePhase;
  index: number;  // level index for nodes, group index for cycles, node index for files
}

export function getResumePoint(checkpoint: SummaryCheckpoint): ResumePoint {
  // Phase 1 — regular nodes (level by level)
  if (checkpoint.lastCompletedLevel < checkpoint.nodeOrder.length - 1) {
    return {
      phase: "nodes",
      index: checkpoint.lastCompletedLevel + 1,
    };
  }

  // Phase 2 — cycle groups
  if (checkpoint.lastCompletedCycleGroup < checkpoint.cycleGroups.length - 1) {
    return {
      phase: "cycles",
      index: checkpoint.lastCompletedCycleGroup + 1,
    };
  }

  // Phase 3 — file nodes
  if (checkpoint.lastCompletedFileNode < checkpoint.fileNodes.length - 1) {
    return {
      phase: "files",
      index: checkpoint.lastCompletedFileNode + 1,
    };
  }

  return { phase: "done", index: -1 };
}

// ─── Progress update helpers ──────────────────────────────────────────────────
//
// Called by the batch loop after each level/group/file completes.

// Marks an entire level as completed — levels are atomic.
export function markLevelCompleted(
  checkpoint:  SummaryCheckpoint,
  levelIndex:  number,
): void {
  checkpoint.lastCompletedLevel  = levelIndex;
  checkpoint.completedNodes     += checkpoint.nodeOrder[levelIndex].length;
}

export function markCycleGroupCompleted(
  checkpoint: SummaryCheckpoint,
  groupIndex: number,
): void {
  checkpoint.lastCompletedCycleGroup  = groupIndex;
  checkpoint.completedNodes          += checkpoint.cycleGroups[groupIndex].size;
}

export function markFileNodeCompleted(
  checkpoint: SummaryCheckpoint,
  index:      number,
): void {
  checkpoint.lastCompletedFileNode = index;
  checkpoint.completedNodes++;
}

// Marks a batch of file nodes as completed.
// batchEnd = index of the LAST node in the batch (inclusive).
// count    = how many nodes were actually in the batch (may be < batchSize at end).
export function markFileNodeBatchCompleted(
  checkpoint: SummaryCheckpoint,
  batchEnd:   number,
  count:      number,
): void {
  checkpoint.lastCompletedFileNode  = batchEnd;
  checkpoint.completedNodes        += count;
}