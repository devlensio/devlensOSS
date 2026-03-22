import { queue } from "../../jobs";
import { resolveConfig } from "../../config";
import { isTerminal, toJobSummary } from "../../jobs/types";
import type { JobInput } from "../../jobs/types";
import { existsSync, lstatSync } from "node:fs";
import { resolve, normalize }   from "node:path";
import { storage } from "../../storage";

//  handleAnalyze 
//
// POST /api/analyze
//
// Creates a new job and returns jobId immediately.
// Does NOT wait for analysis to complete — that happens in the background.
// If a job for the same repoPath is already active, returns the existing jobId.
//
// Client should then open GET /api/job/:jobId/stream to watch progress.

// FUTURE SCOPE: optional commitHash support via git worktree
// When commitHash is provided: git worktree add /tmp/devlens-{uuid} {hash}
// analyzePipeline runs against temp path, worktree removed after saveGraph()
// It was actually complex considering the MVP and when I dont even know if people are gonna use it :/ . So I skipped it.

export async function handleAnalyze(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { repoPath, isGithubRepo, skipSummarization, forceSummarize, thresholds } = body as {
    repoPath:      string;
    isGithubRepo?: boolean;
    skipSummarization?: boolean;
    forceSummarize?: boolean;
    thresholds?:   Record<string, number>;
  };

  // Validate repoPath
  if (!repoPath || typeof repoPath !== "string") {
    return Response.json(
      { success: false, error: "repoPath is required and must be a string" },
      { status: 400 }
    );
  }

  const absolutePath = resolve(normalize(repoPath.trim()));

  // Validate directory exists (skip for GitHub repos)
  if (!isGithubRepo) {
    const exists =
      existsSync(absolutePath) && lstatSync(absolutePath).isDirectory();
    if (!exists) {
      return Response.json(
        { success: false, error: `Directory not found: ${absolutePath}` },
        { status: 400 }
      );
    }
  }

  // Resolve config for this request
  const config = resolveConfig(req);

  const input: JobInput = {
    repoPath:    absolutePath,
    isGithubRepo: isGithubRepo ?? false,
    skipSummarization:  skipSummarization ?? false,
    forceSummarize: forceSummarize ?? false,
    thresholds,
    config,
  };

  // enqueue() handles deduplication internally —
  // returns existing job if same repoPath is already active
  const job = queue.enqueue(input);
  
  return Response.json({
    success: true,
    data: {
      jobId:      job.jobId,
      status:     job.status,
      repoPath:   job.repoPath,
      createdAt:  job.createdAt,
      existing:   job.status !== "queued",  // true = deduplication hit — returned an already-running job
    },
  });
}


// ─── handleSummarize ──────────────────────────────────────────────────────────
//
// POST /api/graph/:graphId/:commitHash/summarize
//
// Enqueues a summarization-only job for a commit that has already been analysed.
// Used when the user ran analysis with skipSummarization=true and now wants
// to trigger summarization separately (e.g. after configuring their LLM key).
//
// Fails if:
//   - graph or commit does not exist on disk
//   - the commit is already fully summarized (isSummarized=true in meta)
//   - a job for the same repoPath is already active (deduplication)

export async function handleSummarize(
  graphId:    string,
  commitHash: string,
  req:        Request
): Promise<Response> {
  // Verify the graph and commit exist
  const meta = storage.getGraphMeta(graphId);
  if (!meta) {
    return Response.json(
      { success: false, error: `Graph not found: ${graphId}` },
      { status: 404 }
    );
  }

  const commitEntry = meta.commits.find(c => c.commitHash === commitHash);
  if (!commitEntry) {
    return Response.json(
      {
        success: false,
        error:   `Commit ${commitHash} not found in graph ${graphId}`,
        hint:    "Run POST /api/analyze first to analyse this repo",
      },
      { status: 404 }
    );
  }

  // Already done — no point re-running
  if (commitEntry.isSummarized) {
    return Response.json(
      {
        success: false,
        error:   "This commit is already summarized",
        hint:    "Delete the graph and re-analyze if you want fresh summaries",
      },
      { status: 409 }
    );
  }

  // Enqueue as a full job but analysis will be fast — it re-runs and saves
  // the same commit data, then continues straight to summarization.
  // We pass skipSummarization=false explicitly.
  const config = resolveConfig(req);

  let forceSummarize = false;
  try {
    const body = await req.json() as { forceSummarize?: boolean };
    forceSummarize = body.forceSummarize ?? false;
  } catch {
    // No body or invalid JSON — default to false
  }

  const input: JobInput = {
    repoPath:          meta.repoPath,
    isGithubRepo:      meta.isGithubRepo,
    skipSummarization: false,
    forceSummarize,
    config,
  };

  const job = queue.enqueue(input);

  return Response.json({
    success: true,
    data: {
      jobId:      job.jobId,
      status:     job.status,
      graphId,
      commitHash,
      repoPath:   meta.repoPath,
      existing:   job.status !== "queued",
    },
  });
}

//  handleListJobs 
//
// GET /api/jobs
//
// Returns all jobs sorted newest first.
// Returns summaries only — never the full events array.

export function handleListJobs(): Response {
  const jobs = queue.listJobs();
  return Response.json({ success: true, data: jobs });
}

//  handleGetJob 
//
// GET /api/job/:jobId
//
// Returns current status of a single job.
// For live progress, use the SSE stream endpoint instead.

export function handleGetJob(jobId: string): Response {
  const job = queue.getJob(jobId);
  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }
  return Response.json({ success: true, data: toJobSummary(job) });
}

//  handleJobStream 
//
// GET /api/job/:jobId/stream
//
// Opens an SSE stream for a job.
// Immediately replays all past events (catch-up for reconnecting clients).
// Then streams live events as they are emitted by the runner.
// Stream closes automatically when job reaches a terminal state.
//
// The browser should use the EventSource API:
//   const es = new EventSource(`/api/job/${jobId}/stream`);
//   es.onmessage = (e) => console.log(JSON.parse(e.data));

export function handleJobStream(jobId: string): Response {
  // Check job exists before setting up stream
  const job = queue.getJob(jobId);
  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  // TextEncoder reused across all enqueue calls for this stream
  const encoder = new TextEncoder();

  // unsubscribe function — stored so cancel() can call it
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = queue.subscribe(
        jobId,

        // onEvent — called for every event (replayed history + live)
        // Encodes to Uint8Array — required by Bun's ReadableStream
        (event) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // Stream already closed — subscriber will be cleaned up
          }
        },

        // onCompleted — job reached terminal state, close stream cleanly
        () => {
          try {
            controller.close();
          } catch {
            // Already closed — ignore
          }
        }
      );
    },

    // cancel() fires when browser closes the tab or disconnects
    // Cleans up the subscriber so it doesn't leak memory
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      // Required SSE headers
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",

      // Disable buffering in nginx/proxies — critical for SSE to work
      // Without this, proxies buffer the stream and browser gets nothing
      // until the buffer fills up
      "X-Accel-Buffering": "no",
    },
  });
}

//  handlePauseJob 
//
// POST /api/job/:jobId/pause
//
// Signals the job to pause after its current summarization batch.
// Only works during summarization phase — not during analysis.

export function handlePauseJob(jobId: string): Response {
  const job = queue.getJob(jobId);
  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  if (isTerminal(job.status)) {
    return Response.json(
      { success: false, error: `Job is already ${job.status}` },
      { status: 400 }
    );
  }

  const paused = queue.pauseJob(jobId);
  if (!paused) {
    return Response.json(
      {
        success: false,
        error:   "Job can only be paused during summarization phase",
        hint:    `Current phase: ${job.phase ?? "not started"}, status: ${job.status}`,
      },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    data:    { jobId, message: "Pause requested — will pause after current batch" },
  });
}

//  handleResumeJob 
//
// POST /api/job/:jobId/resume
//
// Resumes a paused job from its last checkpoint.
// Only works on paused jobs — not cancelled or failed.

export function handleResumeJob(jobId: string): Response {
  const job = queue.getJob(jobId);
  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  if (job.status === "cancelled") {
    return Response.json(
      {
        success: false,
        error:   "Cancelled jobs cannot be resumed",
        hint:    "Submit a new analysis request instead",
      },
      { status: 400 }
    );
  }

  const resumed = queue.resumeJob(jobId);
  if (!resumed) {
    return Response.json(
      {
        success: false,
        error:   `Job cannot be resumed from status: ${job.status}`,
      },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    data: {
      jobId,
      message:           "Job resumed from checkpoint",
      completedNodes:    job.summarizationCompleted ?? 0,
      totalNodes:        job.summarizationTotal     ?? 0,
    },
  });
}

//  handleCancelJob 
//
// POST /api/job/:jobId/cancel
//
// Cancels a job regardless of its current state.
// Queued jobs are cancelled immediately.
// Running/paused jobs are cancelled after their current batch finishes.
// Cancelled jobs cannot be resumed — submit a new analysis to start over.

export function handleCancelJob(jobId: string): Response {
  const job = queue.getJob(jobId);
  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  if (isTerminal(job.status)) {
    return Response.json(
      {
        success: false,
        error:   `Job is already ${job.status} — cannot cancel`,
      },
      { status: 400 }
    );
  }

  const cancelled = queue.cancelJob(jobId);
  if (!cancelled) {
    return Response.json(
      { success: false, error: "Failed to cancel job" },
      { status: 500 }
    );
  }

  // For queued jobs — cancelled immediately
  // For running/paused — cancelRequested flag set, runner handles it
  const isImmediate = job.status === "queued";

  return Response.json({
    success: true,
    data: {
      jobId,
      message: isImmediate
        ? "Job cancelled immediately"
        : "Cancel requested — will cancel after current batch",
    },
  });
}