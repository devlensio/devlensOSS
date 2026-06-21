// Drives an analyze/summarize job through the engine's in-memory queue and
// renders progress to stderr. Shared by the `analyze` and `summarize` commands.
//
// The queue runs runJob() (Phase 1 analysis + optional Phase 2 summarization)
// asynchronously; we subscribe for progress events and resolve when terminal.

import { queue, resolveConfig } from "devlensio";
import type { ProgressEvent, LLMProvider } from "devlensio";
import { info, success, isJsonMode } from "./output.js";

export interface RunJobOpts {
  repoPath: string;
  isGithubRepo?: boolean;
  summarize: boolean; // false → skipSummarization (Phase 1 only)
  forceSummarize?: boolean;
  model?: string;
  provider?: string;
}

export interface JobResult {
  graphId?: string;
  status: string;
  error?: string;
}

export async function runAnalyzeJob(opts: RunJobOpts): Promise<JobResult> {
  const config = resolveConfig();

  // Per-run override of summarization provider/model (used by `summarize`).
  if (opts.model || opts.provider) {
    config.summarization = {
      ...config.summarization,
      ...(opts.provider ? { provider: opts.provider as LLMProvider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    };
  }

  const job = queue.enqueue({
    repoPath: opts.repoPath,
    isGithubRepo: opts.isGithubRepo ?? false,
    skipSummarization: !opts.summarize,
    forceSummarize: opts.forceSummarize ?? false,
    config,
  });

  await new Promise<void>((resolve) => {
    const unsub = queue.subscribe(
      job.jobId,
      (ev) => renderEvent(ev),
      () => {
        unsub();
        resolve();
      }
    );
  });

  const final = queue.getJob(job.jobId);
  return { graphId: final?.graphId, status: final?.status ?? "unknown", error: final?.error };
}

function renderEvent(ev: ProgressEvent): void {
  if (isJsonMode()) return; // progress is noise in machine mode
  switch (ev.event) {
    case "analysis_started":
      info("Analyzing repository…");
      break;
    case "analysis_progress":
      info(`  • ${ev.step}`);
      break;
    case "analysis_complete":
      info(`  analysis complete — ${ev.nodeCount} nodes, ${ev.edgeCount} edges`);
      break;
    case "summarization_started":
      info(`Summarizing ${ev.totalNodes} nodes…`);
      break;
    case "summarization_progress":
      info(`  • ${ev.completed}/${ev.total} — ${ev.nodeName}`);
      break;
    case "summarization_complete":
      success("Summarization complete");
      break;
    // failure surfaces via the final job status
  }
}