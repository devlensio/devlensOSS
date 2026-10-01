// Drives an analyze/summarize job through the engine's in-memory queue and
// renders progress to stderr. Shared by the `analyze` and `summarize` commands.
//
// The queue runs runJob() (Phase 1 analysis + optional Phase 2 summarization)
// asynchronously; we subscribe for progress events and resolve when terminal.

import { queue, resolveConfig, storage } from "devlensio";
import type { LLMProvider, DevLensConfig } from "devlensio";
import { info, success, warn, isJsonMode } from "./output.js";
import { buildIndex } from "../search/indexer.js";
import { writeIndex, invalidate } from "../search/indexManager.js";
import { SKIP_SUMMARIZATION_CONFIG } from "../core/skipConfig.js";
import { JobProgress } from "./progress.js";

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
  // Structure-only analysis never resolves (validates) the user's LLM config —
  // an incomplete/absent summarization config must not block `devlens analyze`
  // (GitHub issue #10). Only --summarize paths resolve the real config, which
  // fails fast here with one actionable message instead of mid-job.
  let config: DevLensConfig = SKIP_SUMMARIZATION_CONFIG;
  if (opts.summarize) {
    config = resolveConfig();

    // Per-run override of summarization provider/model (used by `summarize`).
    if (opts.model || opts.provider) {
      config.summarization = {
        ...config.summarization,
        ...(opts.provider ? { provider: opts.provider as LLMProvider } : {}),
        ...(opts.model ? { model: opts.model } : {}),
      };
    }
  }

  const job = queue.enqueue({
    repoPath: opts.repoPath,
    isGithubRepo: opts.isGithubRepo ?? false,
    skipSummarization: !opts.summarize,
    forceSummarize: opts.forceSummarize ?? false,
    config,
  });

  // Live view: analysis spinner → summarization bar with [p]/[r]/[c] keys.
  const progress = new JobProgress({
    jobId: job.jobId,
    queue,
    json: isJsonMode(),
    input: process.stdin,
    onInterrupt: () => requestCancel(),
    io: { out: (s) => process.stderr.write(s), info, success, warn },
  });

  // ── Graceful cancel (issue 17) ──────────────────────────────────────────
  // Ctrl+C: SIGINT signal (cooked mode, e.g. during analysis) AND the raw
  // 0x03 byte (raw mode, during the bar) both land here. First press asks
  // the engine to stop at the next checkpoint and waits for the terminal
  // event; a second press force-quits. Never a stack trace, exit code 130.
  let interrupted = false;
  function requestCancel(): void {
    if (interrupted) {
      process.stderr.write("\nForce quitting.\n");
      process.exit(130);
    }
    interrupted = true;
    progress.noteInterrupt();
    queue.cancelJob(job.jobId);
  }
  const onSigint = () => requestCancel();
  process.on("SIGINT", onSigint);

  try {
    await new Promise<void>((resolve) => {
      const unsub = queue.subscribe(
        job.jobId,
        (ev) => progress.onEvent(ev),
        () => {
          unsub();
          resolve();
        }
      );
    });
  } finally {
    process.off("SIGINT", onSigint);
    progress.stop();
  }

  const final = queue.getJob(job.jobId);
  if (final?.graphId && !final.error) {
    indexLatestCommit(final.graphId);
  }
  return { graphId: final?.graphId, status: final?.status ?? "unknown", error: final?.error };
}

// Every analyze/summarize run rebuilds the derived .search.json for the
// commit it touched. Failure is non-fatal: queries lazily rebuild on demand.
function indexLatestCommit(graphId: string): void {
  try {
    const meta = storage.getGraphMeta(graphId);
    const latest = meta?.commits[0];
    if (!latest) return;
    const result = storage.getGraph(graphId, latest.commitHash);
    if (!result) return;
    const { envelope, engine } = buildIndex(result);
    writeIndex(graphId, latest.commitHash, envelope, engine);
    invalidate(graphId);
    if (!isJsonMode()) {
      info(`indexed search index for ${latest.commitHash.slice(0, 10)} (${envelope.docs} nodes)`);
    }
  } catch (err) {
    if (!isJsonMode()) {
      info(`search indexing failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
