// Drives an analyze/summarize job through the engine's in-memory queue —
// shared by the `analyze` and `summarize` commands.
//
// Pipeline: resolve config → queue.enqueue() → subscribe to progress events
// (rendered by JobProgress: analysis spinner → summarization bar with
// p/r/c keys) → await the terminal event → rebuild the derived search index
// for the touched commit (non-fatal on failure) → return {graphId, status}.
//
// Key invariants:
//   - Config gating: structure-only runs (summarize=false) NEVER resolve or
//     validate the user's LLM config — they enqueue the shared placeholder
//     config, so an incomplete/absent/invalid config cannot block analysis
//     (devlensOSS#10). Only --summarize paths resolve the real config, which
//     fails fast here with one actionable message instead of mid-job; per-run
//     --model/--provider overrides apply only on that path.
//   - Graceful cancel: SIGINT (cooked mode, e.g. during analysis) and the raw
//     0x03 byte (raw mode, during the bar) both route to requestCancel() —
//     first press warns, signals the engine to stop at the next checkpoint and
//     waits for the terminal event (the command then exits 130); a second
//     press force-quits. The SIGINT listener is installed only for the job's
//     lifetime and always removed in `finally`.
import { queue, resolveConfig, storage } from "devlensio";
import type { LLMProvider, DevLensConfig } from "devlensio";
import { info, isJsonMode } from "./output.js";
import { buildIndex } from "../search/indexer.js";
import { writeIndex, invalidate } from "../search/indexManager.js";
import { SKIP_SUMMARIZATION_CONFIG } from "../core/skipConfig.js";
import { JobProgress, cliProgressIO } from "./progress.js";

export interface RunJobOpts {
  repoPath: string;
  isGithubRepo?: boolean;
  summarize: boolean;
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
  let config: DevLensConfig = SKIP_SUMMARIZATION_CONFIG;
  if (opts.summarize) {
    config = resolveConfig();

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

  const progress = new JobProgress({
    jobId: job.jobId,
    queue,
    json: isJsonMode(),
    input: process.stdin,
    onInterrupt: () => requestCancel(),
    io: cliProgressIO(),
  });

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
