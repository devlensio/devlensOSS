#!/usr/bin/env node
/**
 * Dev launcher for the web UI.
 *
 * Plain `next dev` is not safe here, for three reasons:
 *
 * 1. **Port.** `src/server/index.ts` owns the API (PORT, 3000 by default) and
 *    `lib/api.ts` points the browser at `http://localhost:3000` in dev. Running
 *    `next dev` with no `-p` made the UI race the API for 3000: whoever lost
 *    silently slid to 3001, and when the UI won it called its own port for the
 *    API and every request 404'd. We pin the UI to 3001 (override with
 *    NEXT_DEV_PORT) and skip to the next free port if something already holds
 *    it, so a stale watcher can never crash the UI with EADDRINUSE.
 *
 * 2. **Engine discovery.** The API auto-increments its port when 3000 is taken
 *    (e.g. by an orphaned `bun --watch`), which would leave the UI pointing at
 *    the wrong place. Probe the engine and hand its real URL to Next as
 *    NEXT_PUBLIC_ENGINE_URL so the pair always matches.
 *
 * 3. **Heap.** Node caps the V8 old space at ~2 GB on a 16 GB box. A cold
 *    Turbopack compile of the graph route is the heaviest thing in this repo,
 *    and hitting that cap aborts the dev server with "JavaScript heap out of
 *    memory" instead of collecting. Give V8 explicit headroom.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frontendDir = fileURLToPath(new URL("..", import.meta.url));
const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
// Leave room for the OS, the Bun engine and a browser; never go below 2 GB.
const heapMb = Math.min(8192, Math.max(2048, Math.floor(totalMb * 0.4)));
const PORT_SCAN = 20;

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function firstFreePort(start) {
  for (let i = 0; i < PORT_SCAN; i++) {
    if (await isFree(start + i)) return start + i;
  }
  throw new Error(`no free port in ${start}..${start + PORT_SCAN - 1}`);
}

async function probeEngine() {
  // The engine binds quickly and prints its port; give it a moment, then fall
  // back to the documented default (or the user's explicit override).
  const explicit = process.env.NEXT_PUBLIC_ENGINE_URL;
  if (explicit) return { url: explicit, discovered: false };

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    for (let port = 3000; port < 3000 + 10; port++) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 250);
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (res.ok) return { url: `http://localhost:${port}`, discovered: true };
      } catch {
        /* not up yet */
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { url: "http://localhost:3000", discovered: false };
}

const uiPort = await firstFreePort(Number(process.env.NEXT_DEV_PORT ?? 3001));
const engine = await probeEngine();

const nextBin = require.resolve("next/dist/bin/next");
const nodeOptions = [process.env.NODE_OPTIONS ?? "", `--max-old-space-size=${heapMb}`]
  .filter(Boolean)
  .join(" ");

if (engine.discovered && !/\/\/localhost:3000$/.test(engine.url)) {
  console.log(
    `[dev] engine found on ${engine.url} (not :3000) — pointing the UI at it via NEXT_PUBLIC_ENGINE_URL`,
  );
} else if (!engine.discovered) {
  console.log(`[dev] no engine on :3000-:3009 yet, assuming ${engine.url}`);
}
console.log(
  `[dev] web UI on http://localhost:${uiPort}  ·  V8 old-space cap ${heapMb} MB (of ${totalMb} MB RAM)`,
);

const child = spawn(process.execPath, [nextBin, "dev", "-p", String(uiPort)], {
  cwd: frontendDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    NEXT_PUBLIC_ENGINE_URL: engine.url,
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});