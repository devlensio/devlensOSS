import type { Command } from "commander";
import { startServer } from "../../server/index.js";
import { withGlobalFlags } from "../options.js";
import { info } from "../output.js";

// `devlens serve` — start the backend HTTP server (long-running).
// Frontend static serving is wired in a later step (Part I / Task 3).
export function registerServeCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("serve")
      .description("Start the DevLens backend server (API; frontend serving lands later).")
      .argument("[path]", "repo path to serve", ".")
      .option("-p, --port <port>", "port to listen on", "3000")
      .action(async (_repoArg, opts) => {
        const port = parseInt(opts.port, 10);
        info(`Starting DevLens server on port ${port}…`);
        await startServer({ port }); // long-running; does not return
      })
  );
}