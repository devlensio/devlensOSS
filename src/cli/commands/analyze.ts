import path from "node:path";
import type { Command } from "commander";
import { withGlobalFlags } from "../options.js";
import { emit, die, info } from "../output.js";
import { runAnalyzeJob } from "../jobRunner.js";

// `devlens analyze [path] [commitHash]` — Phase 1 analysis; --summarize chains Phase 2.
export function registerAnalyzeCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("analyze")
      .description("Analyze a repository into a DevLens graph. Add --summarize to also generate summaries.")
      .argument("[path]", "repository path", ".")
      .argument("[commitHash]", "commit to analyze (informational — engine analyzes the working tree)")
      .option("--summarize", "also generate technical/business/security summaries", false)
      .option("--force-summarize", "re-summarize every node from scratch", false)
      .option("--latest", "analyze the working tree including uncommitted changes (current default)", false)
      .action(async (repoArg, commitHash, opts) => {
        if (commitHash) info("Note: commit targeting is not wired yet — analyzing the current working-tree state.");

        const repoPath = path.resolve(process.cwd(), repoArg ?? ".");
        info(`Repo: ${repoPath}`);

        const res = await runAnalyzeJob({
          repoPath,
          summarize: !!(opts.summarize || opts.forceSummarize),
          forceSummarize: !!opts.forceSummarize,
        });

        if (res.status !== "completed") die(res.error ?? `Job ended with status: ${res.status}`);
        emit({ graphId: res.graphId, status: res.status });
      })
  );
}