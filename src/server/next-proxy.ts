import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Live Next.js server integration.
 *
 * The web UI is built as a real Next.js server (`next build` → `next start`) so
 * that dynamic routes like `/graph/<any graph id>` render on demand. We spawn
 * that Next server on an internal port and proxy non-API traffic to it from the
 * single public Bun port. `/api/*` stays in the Bun router (unchanged), so the
 * MCP / skills / health endpoints are unaffected.
 */

const isBunRuntime = typeof Bun !== "undefined";

/** Poll a Next server until it answers the root path (timeout in ms). */
async function waitUntilReady(base: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + "/");
      if (res.status < 500) return;
      lastErr = new Error(`Next returned HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Next.js server did not become ready on ${base}: ${String(lastErr)}`);
}

export interface NextServerHandle {
  /** Internal port the Next server is listening on. */
  port: number;
  /** Base URL of the internal Next server (http://127.0.0.1:<port>). */
  base: string;
  /** Stop the spawned Next server. */
  stop: () => void;
}

export interface SpawnNextOptions {
  /** Directory containing the built Next app (`frontend/`, with a `.next` dir). */
  cwd: string;
  /** Port for the Next server to bind internally (defaults to 3001). */
  port?: number;
  /** Optional host to bind (default 127.0.0.1 so it is not exposed publicly). */
  hostname?: string;
  /** Extra args passed to `next` (e.g. ["--turbo"]). */
  extraArgs?: string[];
  /** Override the binary used to launch `next` (defaults to `bunx next start`). */
  nextCmd?: string[];
  /** Time (ms) to wait for readiness. */
  readyTimeout?: number;
}

/**
 * Start a production Next server in `cwd`. Returns a handle + a `stop()`.
 */
export async function spawnNextServer(opts: SpawnNextOptions): Promise<NextServerHandle> {
  const cwd = path.resolve(opts.cwd);
  const port = opts.port ?? 3001;
  const hostname = opts.hostname ?? "127.0.0.1";

  if (!fs.existsSync(path.join(cwd, ".next", "BUILD_ID"))) {
    throw new Error(
      `No Next.js build found in "${cwd}" (missing .next/BUILD_ID). ` +
        `Build the frontend first: cd frontend && bun run build (or \`bun run build:ui\` at the repo root).`
    );
  }

  // Prefer an explicit command override; otherwise use bunx (works under bun and
  // Node). `next start` serves the production build that was made by `next build`.
  const args =
    opts.nextCmd ??
    (isBunRuntime ? ["bunx", "next", "start"] : ["npx", "next", "start"]);

  const nextArgs = [...args, "-p", String(port), "-H", hostname, ...(opts.extraArgs ?? [])];

  const child: ChildProcess = spawn(nextArgs[0], nextArgs.slice(1), {
    cwd,
    env: { ...process.env, PORT: String(port), HOSTNAME: hostname },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => (stdout += String(d)));
  child.stderr?.on("data", (d) => (stderr += String(d)));

  const base = `http://${hostname}:${port}`;

  const ready = waitUntilReady(base, opts.readyTimeout ?? 60_000).catch((err) => {
    try { child.kill("SIGKILL"); } catch { /* ignore */ }
    throw new Error(
      `Failed to start Next.js server.\nstdout:\n${stdout.slice(-1500)}\nstderr:\n${stderr.slice(-1500)}\nCaused by: ${err.message}`
    );
  });
  await ready;

  return {
    port,
    base,
    stop: () => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      // Give it a moment, then force-kill.
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } }, 3000).unref?.();
    },
  };
}

// Header names that are hop-by-hop and must not be forwarded verbatim.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Build a fetch handler that proxies a request to the internal Next server.
 * Returns the upstream Response, or null if the request should be handled by
 * the Bun router instead (i.e. `/api/*`).
 */
export function makeNextHandler(next: NextServerHandle): (req: Request) => Promise<Response | null> {
  return async function nextHandler(req: Request): Promise<Response | null> {
    const url = new URL(req.url);

    // The API is owned by the Bun router — never forward it to Next.
    if (url.pathname.startsWith("/api/")) return null;

    let body: BodyInit | null | undefined;
    const method = req.method;
    if (method === "GET" || method === "HEAD") {
      body = undefined;
    } else {
      body = await req.arrayBuffer();
    }

    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
    });
    // Tell Next the scheme (it may generate absolute URLs / cookies).
    const fwd = req.headers.get("x-forwarded-proto");
    if (!fwd) headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

    // The upstream and the proxy live on the same host — disable compression on
    // the local hop so Bun's fetch doesn't auto-decompress a body that we then
    // forward still labelled Content-Encoding: gzip/br (which would corrupt the
    // bytes the browser receives). We send compressed bytes back to the real
    // client through the `Accept-Encoding` the browser advertised on the request.
    headers.set("accept-encoding", "identity");

    try {
      const upstream = await fetch(next.base + url.pathname + url.search, {
        method,
        headers,
        body: body as BodyInit | undefined,
        redirect: "manual",
      });

      const resHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (!HOP_BY_HOP.has(key.toLowerCase())) resHeaders.set(key, value);
      });

      // Frame the body ourselves — drop any upstream content-encoding / length
      // that no longer matches the bytes we pass through (Bun may decompress
      // the upstream body, and we reframe it below).
      resHeaders.delete("content-encoding");
      resHeaders.delete("content-length");
      resHeaders.delete("connection");
      resHeaders.delete("keep-alive");
      resHeaders.delete("transfer-encoding");

      // The Next server is on an internal port; never leak that in Location.
      const location = resHeaders.get("location");
      if (location && location.includes(`:${next.port}`)) {
        resHeaders.set("location", location.replace(`:${next.port}`, ""));
      }

      const status = upstream.status;
      const response = new Response(upstream.body, { status, headers: resHeaders });

      // Buffering SSE: the API streams jobs via its own path (`/api/...`), so
      // Next responses here are normal HTML/RSC/static — safe to return as-is.
      return response;
    } catch (err) {
      console.error("[devlens web UI] proxy to Next failed:", err);
      return Response.json(
        { success: false, error: "web UI backend unavailable" },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
  };
}
