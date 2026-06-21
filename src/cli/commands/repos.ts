import type { Command } from "commander";
import { listRepos } from "../../core/queries.js";
import { withGlobalFlags } from "../options.js";
import { emit } from "../output.js";

// `devlens repos` — list analyzed graphs (mirrors the MCP list_analyzed_repos tool).
export function registerReposCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("repos")
      .description("List repositories DevLens has already analyzed")
      .action(() => {
        emit(listRepos());
      })
  );
}