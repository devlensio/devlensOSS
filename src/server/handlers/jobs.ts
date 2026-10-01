import { queue, DevLensConfig, resolveConfig, isTerminal, toJobSummary, JobInput, storage } from "devlensio";
import { existsSync, lstatSync } from "node:fs";
import { resolve, normalize } from "node:path";
import { SKIP_SUMMARIZATION_CONFIG } from "../../core/skipConfig.js";
import { summarizationConfigured } from "../../core/tolerantConfig.js";



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

  const { repoPath, isGithubRepo, skipSummarization, forceSummarize, thresholds, includedThirdPartyLibs } = body as {
    repoPath: string;
    isGithubRepo?: boolean;
    skipSummarization?: boolean;
    forceSummarize?: boolean;
    thresholds?: Record<string, number>;
    includedThirdPartyLibs?: string[];
  };

  if (!repoPath || typeof repoPath !== "string") {
    return Response.json(
      { success: false, error: "repoPath is required and must be a string" },
      { status: 400 }
    );
  }

  const absolutePath = resolve(normalize(repoPath.trim()));

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

  let skip = !!skipSummarization;
  if (!skip && !summarizationConfigured(req)) {
    skip = true;
    console.warn(
      "devlens: no usable summarization API key configured — running analysis only. " +
      "Configure a provider in the webUI settings (or run `devlens init`) to enable summaries."
    );
  }

  let config: DevLensConfig;
  if (skip) {
    config = SKIP_SUMMARIZATION_CONFIG;
  } else {
    try {
      config = resolveConfig(req);
    } catch (err) {
      console.warn(
        `devlens: ${err instanceof Error ? err.message : String(err)} — running analysis without summarization.`
      );
      skip = true;
      config = SKIP_SUMMARIZATION_CONFIG;
    }
  }

  const input: JobInput = {
    repoPath:                absolutePath,
    isGithubRepo:            isGithubRepo ?? false,
    skipSummarization:       skip,
    forceSummarize:          forceSummarize ?? false,
    thresholds,
    config,
    includedThirdPartyLibs:  includedThirdPartyLibs ?? [],
  };

  const job = queue.enqueue(input);

  return Response.json({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      repoPath: job.repoPath,
      createdAt: job.createdAt,
      ...(skip && !skipSummarization ? { summarizationSkipped: true } : {}),
      existing: job.status !== "queued",
    },
  });
}



export async function handleSummarize(
  graphId: string,
  commitHash: string,
  req: Request
): Promise<Response> {
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
        error: `Commit ${commitHash} not found in graph ${graphId}`,
        hint: "Run POST /api/analyze first to analyse this repo",
      },
      { status: 404 }
    );
  }

  if (commitEntry.isSummarized) {
    return Response.json(
      {
        success: false,
        error: "This commit is already summarized",
        hint: "Delete the graph and re-analyze if you want fresh summaries",
      },
      { status: 409 }
    );
  }

  const config = resolveConfig(req);

  let forceSummarize = false;
  try {
    const body = await req.json() as { forceSummarize?: boolean };
    forceSummarize = body.forceSummarize ?? false;
  } catch {
  }

  const input: JobInput = {
    repoPath: meta.repoPath,
    isGithubRepo: meta.isGithubRepo,
    skipSummarization: false,
    forceSummarize,
    config,
  };

  const job = queue.enqueue(input);

  return Response.json({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      graphId,
      commitHash,
      repoPath: meta.repoPath,
      existing: job.status !== "queued",
    },
  });
}


export function handleListJobs(): Response {
  const jobs = queue.listJobs();
  return Response.json({ success: true, data: jobs });
}


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


export function handleJobStream(jobId: string): Response {
  const job = queue.getJob(jobId);
  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = queue.subscribe(
        jobId,

        (event) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
          }
        },

        () => {
          try {
            controller.close();
          } catch {
          }
        }
      );
    },

    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",

      "X-Accel-Buffering": "no",
    },
  });
}


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
        error: "Job can only be paused during summarization phase",
        hint: `Current phase: ${job.phase ?? "not started"}, status: ${job.status}`,
      },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    data: { jobId, message: "Pause requested — will pause after current batch" },
  });
}


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
        error: "Cancelled jobs cannot be resumed",
        hint: "Submit a new analysis request instead",
      },
      { status: 400 }
    );
  }

  const resumed = queue.resumeJob(jobId);
  if (!resumed) {
    return Response.json(
      {
        success: false,
        error: `Job cannot be resumed from status: ${job.status}`,
      },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    data: {
      jobId,
      message: "Job resumed from checkpoint",
      completedNodes: job.summarizationCompleted ?? 0,
      totalNodes: job.summarizationTotal ?? 0,
    },
  });
}


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
        error: `Job is already ${job.status} — cannot cancel`,
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