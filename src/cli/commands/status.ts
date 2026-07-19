import type { Command } from "commander";
import { storage } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit } from "../output.js";

// `devlens status` — what has been analyzed / summarized.
export function registerStatusCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("status")
      .description("Show analyzed and summarized graphs")
      .action(() => {
        const graphs = storage.listGraphs().map((g) => {
          const meta = storage.getGraphMeta(g.graphId);
          return {
            graphId: g.graphId,
            repoPath: g.repoPath,
            framework: g.framework,
            commits: g.commitCount,
            latestCommit: g.latestCommit,
            summarizedCommits: meta?.summarizedCommits?.length ?? 0,
          };
        });
        emit({ total: graphs.length, graphs });
      })
  );
}
