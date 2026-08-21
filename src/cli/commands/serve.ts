import type { Command } from "commander";
import { startServer } from "../../server/index.js";
import { withGlobalFlags } from "../options.js";
import { info } from "../output.js";

// `devlens serve` — backend API only (used by MCP / skills).
//
// The web UI is served from the source repo via `bun start` (or
// `bun run dev`), not through the CLI. This command starts the API backend
// only, on a single port, for MCP / skills / the web UI to talk to.
export function registerServeCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("serve")
      .description("Start the DevLens backend API server (used by MCP / skills / the web UI).")
      .argument("[path]", "repo path to serve", ".")
      .option("-p, --port <port>", "port to listen on (auto-incremented if busy)", "3000")
      .action(async (_repoArg, opts) => {
        const port = parseInt(opts.port, 10);
        info(`Starting DevLens API server (trying port ${port}…)`);
        const srv = await startServer({ port, repoPath: _repoArg });
        console.log(`   (API-only mode — the web UI is served from the source repo via \`bun start\`.)`);
        keepAlive(srv.stop);
      })
  );
}

// Long-running servers: keep the process alive until the user interrupts.
function keepAlive(stop: () => void): void {
  const shutdown = () => {
    try { stop(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Note: Bun.serve keeps the process alive by itself, but we attach handlers
  // so Ctrl+C exits cleanly (exit code 0) instead of dumping a stacktrace.
}
