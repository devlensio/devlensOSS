import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { startServer } from "../../server/index.js";
import { withGlobalFlags } from "../options.js";
import { info, warn } from "../output.js";

// Resolve the path to a built web UI bundle, or "" if none is found.
// Precedence:
//   1. $DEVLENS_UI_DIR (explicit)
//   2. ./frontend/out               (repo source tree — `bun run dev:ui:build`)
//   3. <binary dir>/ui              (UI staged next to the installed binary)
//   4. ~/.devlens/ui                (downloaded / installed alongside config)
//   5. ./.devlens/ui                (project-local)
function resolveUiDir(): string {
  const candidates: string[] = [];
  if (process.env.DEVLENS_UI_DIR) candidates.push(process.env.DEVLENS_UI_DIR);
  candidates.push(path.resolve(process.cwd(), "frontend", "out"));

  const execDir = typeof process.execPath === "string" && process.execPath ? path.dirname(process.execPath) : "";
  if (execDir) candidates.push(path.join(execDir, "ui"));

  candidates.push(path.join(os.homedir(), ".devlens", "ui"));
  candidates.push(path.resolve(process.cwd(), ".devlens", "ui"));

  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "index.html"))) return path.resolve(dir);
  }
  return "";
}

// Resolve the frontend repo dir that holds a LIVE Next.js build (`.next/BUILD_ID`).
// This is the RECOMMENDED UI mode (`bun start` / running `serve-ui` from source
// after `bun run build:ui`): a live Next server renders ANY /graph/<id> on
// demand, so graph navigation works for graphs created after startup. Returns
// "" when no build is present (falls back to the static bundle).
function resolveFrontendDir(): string {
  if (process.env.DEVLENS_FRONTEND_DIR) {
    const p = path.resolve(process.env.DEVLENS_FRONTEND_DIR);
    if (fs.existsSync(path.join(p, ".next", "BUILD_ID"))) return p;
  }
  const p = path.resolve(process.cwd(), "frontend");
  if (fs.existsSync(path.join(p, ".next", "BUILD_ID"))) return p;
  return "";
}

// `devlens serve` — backend API only (used by MCP & skills; unchanged).
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
        console.log(`   (API-only mode — use \`devlens serve-ui\` to also serve the web UI.)`);
        keepAlive(srv.stop);
      })
  );
}

// `devlens serve-ui` — backend API + web UI on one port.
// Prefers the LIVE Next.js build (`.next`) so dynamic /graph/<id> routes render
// on demand; falls back to the static bundle (`frontend/out`) if no build exists.
export function registerServeUiCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("serve-ui")
      .description("Start the DevLens backend API + web UI together on a single port (auto-increments if busy).")
      .argument("[path]", "repo path to serve", ".")
      .option("-p, --port <port>", "starting port to listen on", "3000")
      .action(async (_repoArg, opts) => {
        const port = parseInt(opts.port, 10);
        const frontendDir = resolveFrontendDir();
        const uiDir = frontendDir ? "" : resolveUiDir();
        if (frontendDir) {
          info(`Starting DevLens server with live web UI (Next.js build in "${frontendDir}") (trying port ${port}…)`);
        } else if (!uiDir) {
          warn("no web UI build found (looked for ./frontend/.next, frontend/out, <binary>/ui, ~/.devlens/ui).");
          warn("start the server in API-only mode, or build the UI first (see docs).");
        } else {
          info(`Starting DevLens server with static web UI "${uiDir}" (trying port ${port}…)`);
        }
        const srv = await startServer({
          port,
          repoPath: _repoArg,
          uiDir: uiDir || undefined,
          ...(frontendDir ? { next: { frontendDir } } : {}),
        });
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
