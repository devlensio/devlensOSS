import path from "node:path";
import type { Command } from "commander";
import { storage } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, die, info } from "../output.js";
import { runAnalyzeJob } from "../jobRunner.js";

// `devlens summarize [target] [commit]` — runs analysis then summarization.
// `target` may be a repo path or an existing graphId.
export function registerSummarizeCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("summarize")
      .description("Generate technical/business/security summaries for a repo (runs analysis then summarization).")
      .argument("[target]", "repo path or existing graphId", ".")
      .argument("[commit]", "commit hash (informational)")
      .option("--force-summarize", "re-summarize from scratch (ignore prior summaries)", false)
      .option("--model <model>", "override summarization model")
      .option("--provider <provider>", "override provider (anthropic|openai|openrouter|gemini|ollama)")
      .action(async (target, _commit, opts) => {
        const repoPath = resolveTarget(target ?? ".");
        info(`Repo: ${repoPath}`);

        const res = await runAnalyzeJob({
          repoPath,
          summarize: true,
          forceSummarize: !!opts.forceSummarize,
          model: opts.model,
          provider: opts.provider,
        });

        if (res.status !== "completed") die(res.error ?? `Job ended with status: ${res.status}`);
        emit({ graphId: res.graphId, status: res.status });
      })
  );
}

// If target matches an existing graphId, summarize that repo; else treat as a path.
function resolveTarget(target: string): string {
  const meta = storage.getGraphMeta(target);
  if (meta) return meta.repoPath;
  return path.resolve(process.cwd(), target);
}