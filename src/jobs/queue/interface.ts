import { Job, JobInput, JobSummary, ProgressEvent } from "../types";

// ─── JobQueue Interface ───────────────────────────────────────────────────────
//
// The contract both InMemoryQueue (local) and BullMQQueue (cloud) must implement.
// The rest of the codebase — runner, handlers, SSE — only talks to this interface.
// Swapping implementations never requires changing any other file.
//
// Two implementations:
//   InMemoryQueue  → zero dependencies, jobs lost on restart, local use
//
// Selected automatically at startup in jobs/index.ts:
//   REDIS_URL absent → InMemoryQueue

export interface JobQueue {

  // ── Job Lifecycle ──────────────────────────────────────────────────────────

  // Create a new job and add it to the queue.
  // Returns the created Job.
  // If a job for the same repoPath is already active (queued/running/paused),
  // returns the existing job instead of creating a duplicate.
  enqueue(input: JobInput): Job;

  // Get a single job by ID.
  // Returns undefined if not found.
  getJob(jobId: string): Job | undefined;

  // Get all jobs — for GET /api/jobs endpoint.
  // Returns summaries only — never the full events array.
  listJobs(): JobSummary[];

  // Find an active job for a given repoPath.
  // "Active" = queued | running | paused
  // Used by enqueue() for deduplication.
  findActiveJob(repoPath: string): Job | undefined;

  // ── Job Control ────────────────────────────────────────────────────────────

  // Signal a running/queued job to pause after its current batch.
  // Returns false if job is not in a pauseable state.
  // Pauseable states: running (during summarization phase only)
  pauseJob(jobId: string): boolean;

  // Resume a paused job.
  // Returns false if job is not paused.
  resumeJob(jobId: string): boolean;

  // Cancel a job regardless of its current state.
  // Works on: queued, running, paused
  // Does nothing (returns false) on: completed, failed, cancelled
  cancelJob(jobId: string): boolean;

  // ── Progress & SSE ────────────────────────────────────────────────────────

  // Append a progress event to a job's event history.
  // Called by the runner as it moves through phases.
  // The event is stored on the job AND broadcast to all active SSE subscribers.
  emitEvent(jobId: string, event: ProgressEvent): void;

  // Subscribe to a job's events for SSE streaming.
  // Returns an unsubscribe function — call it when the SSE connection closes.
  //
  // On subscribe:
  //   1. Immediately replays all past events (catch-up for reconnecting clients)
  //   2. Then streams new events live as they are emitted
  //   3. If job is already terminal, replays events and calls onCompleted immediately
  //
  // onEvent    — called for each event (both replayed and live)
  // onCompleted — called when job reaches a terminal status (completed/failed/cancelled)
  subscribe(
    jobId:      string,
    onEvent:    (event: ProgressEvent) => void,
    onCompleted: () => void
  ): () => void;  // returns unsubscribe function

  // ── Internal — called by runner only 

  // Update job fields directly.
  // Only the runner calls this — never API handlers.
  // Handlers use pauseJob/resumeJob/cancelJob instead.
  updateJob(jobId: string, updates: Partial<Job>): void;
}