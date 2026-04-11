import type { DevLensConfig } from "../config";
import type { FilterThresholds } from "../pipeline";

export type JobStatus =
    | "queued"
    | "running"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed"

// Which phase the job is currently in.
//   analysis      → Steps 1-6, fast, atomic, cannot be paused or cancelled cleanly
//                   mid-phase cancel sets cancelRequested, runner checks after phase
//   summarization → Step 7, slow, resumable, batched, cancel respected between batches
export type JobPhase = "analysis" | "summarization";

export type AnalysisStep =
    | "fingerprint"
    | "filesystem"
    | "parse"
    | "edges"
    | "scoring";


//Since the job is time taking, obviously we cannot run it over HTTP method, I mean ideally we can, but it is not a practical approach. So we will send events of the job over SSE
export type ProgressEvent =
    | { event: "queued"; jobId: string; position: number }
    | { event: "analysis_started"; jobId: string }
    | { event: "analysis_progress"; jobId: string; step: AnalysisStep }
    | { event: "analysis_complete"; jobId: string; graphId: string; nodeCount: number; edgeCount: number }
    | { event: "summarization_started"; jobId: string; totalNodes: number }
    | { event: "summarization_progress"; jobId: string;completed: number; total: number; nodeName: string }
    | { event: "summarization_complete"; jobId: string }
    | {event: "paused"; jobId: string;completedNodes: number; totalNodes: number}
    | {event: "resumed"; jobId: string;completedNodes: number; totalNodes: number}
    // Cancelled — emitted regardless of which phase or status job was in
    // cleanedUp = true means checkpoint file was deleted from disk
    | { event: "cancelled"; jobId: string; cleanedUp: boolean }
    | { event: "completed"; jobId: string; graphId: string }
    | { event: "failed"; jobId: string; error: string };


export interface Job {
  jobId:    string;
  status:   JobStatus;
  phase:    JobPhase | null;  // null = queued, not started yet

  // Input
  repoPath:     string;
  isGithubRepo: boolean;
  thresholds?:  FilterThresholds;
  config:       DevLensConfig;  // snapshot at creation — never changes
  skipSummarization?: boolean;        // if true, stop after Phase 1

  // Output
  graphId?: string;  // set after Phase 1 completes

  // Progress
  events:           ProgressEvent[];  // full history for SSE replay
  pauseRequested:   boolean;          // signal: pause after current batch
  cancelRequested:  boolean;          // signal: cancel after current batch
                                      // (or immediately if queued/paused)

  // Summarization progress
  summarizationTotal?:     number;
  summarizationCompleted?: number;

  // Timestamps
  createdAt:     string;
  startedAt?:    string;
  pausedAt?:     string;
  cancelledAt?:  string;
  completedAt?:  string;
  failedAt?:     string;

  error?: string;

  forceSummarize?: boolean;
}

export interface JobInput {
  repoPath:      string;
  isGithubRepo?: boolean;
  skipSummarization:  boolean;
  thresholds?:   FilterThresholds;
  config:        DevLensConfig;
  forceSummarize?: boolean;
}

export interface JobSummary {
  jobId:    string;
  status:   JobStatus;
  phase:    JobPhase | null;
  repoPath: string;
  graphId?: string;
  summarizationTotal?:     number;
  summarizationCompleted?: number;
  createdAt:     string;
  startedAt?:    string;
  pausedAt?:     string;
  cancelledAt?:  string;
  completedAt?:  string;
  failedAt?:     string;

  error?: string;
}

// Jobs in these statuses are done — they will never change state again.
// Used by the queue to decide when to clean up SSE subscribers.
export const TERMINAL_STATUSES = new Set<JobStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}


// Only paused jobs can be resumed.
// Cancelled jobs cannot — their checkpoints are deleted.
export function isResumable(status: JobStatus): boolean {
  return status === "paused";
}

export function toJobSummary(job: Job): JobSummary {
  return {
    jobId:                   job.jobId,
    status:                  job.status,
    phase:                   job.phase,
    repoPath:                job.repoPath,
    graphId:                 job.graphId,
    summarizationTotal:      job.summarizationTotal,
    summarizationCompleted:  job.summarizationCompleted,
    createdAt:               job.createdAt,
    startedAt:               job.startedAt,
    pausedAt:                job.pausedAt,
    cancelledAt:             job.cancelledAt,
    completedAt:             job.completedAt,
    failedAt:                job.failedAt,
    error:                   job.error,
  };
}