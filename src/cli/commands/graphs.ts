import type { Command } from "commander";
import { storage } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, die, success } from "../output.js";

// `devlens graphs list` / `devlens graphs delete <id>`
export function registerGraphsCommand(program: Command): void {
  const graphs = program.command("graphs").description("Manage stored graphs");

  withGlobalFlags(
    graphs
      .command("list")
      .description("List all analyzed graphs")
      .action(() => emit(storage.listGraphs()))
  );

  withGlobalFlags(
    graphs
      .command("delete")
      .description("Delete a stored graph by id")
      .argument("<graphId>")
      .action((id) => {
        if (!storage.deleteGraph(id)) die(`Graph not found: ${id}`);
        success(`Deleted graph ${id}`);
        emit({ deleted: id });
      })
  );
}