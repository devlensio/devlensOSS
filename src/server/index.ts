/// <reference types="bun" />
import { initConfig } from "devlensio";
import { router } from "./router.js";
import { makeStaticHandler } from "./static.js";
import { spawnNextServer, makeNextHandler, type NextServerHandle } from "./next-proxy.js";

export const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
};

export interface ServerOptions {
    /** Port to listen on (incremented automatically if already in use). */
    port?: number;
    repoPath?: string;
    /** Path to a built web UI bundle (`output: 'export'` of frontend/). When
     *  provided (and non-empty) the server serves the static UI bundle on the
     *  same port alongside the API. Omit to run API-only (default). */
    uiDir?: string;
    /** Serve a LIVE Next.js server instead of a static bundle. This is the
     *  recommended mode (`bun start` from source): the
     *  frontend is built with `next build` and run with `next start`, so any
     *  dynamic route (e.g. `/graph/<id>`) renders on demand. `/api/*` still goes
     *  to the Bun router. Provide `frontendDir` (the frontend/ dir). */
    next?: { frontendDir: string; port?: number };
}

export function isPortInUse(err: unknown): boolean {
    const msg = err instanceof Error ? err.message || "" : String(err);
    return /address already in use|EADDRINUSE|cannot listen|listening on port|failed to start server|is port .* in use|EACCES|EADDRNOTAVAIL/i.test(
        msg
    );
}

export interface RunningServer {
    /** The port the server actually bound (after any auto-increment). */
    port: number;
    /** Whether UI static files are being served. */
    servingUi: boolean;
    stop: () => void;
}

// Max consecutive "in use" retries before giving up scanning and letting the OS
// pick a free ephemeral port (thereby avoiding an unbounded loop).
const MAX_PORT_TRIES = 20;

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
    const requested = opts.port ?? parseInt(process.env.PORT ?? "3000", 10);
    const uiDir = opts.uiDir ? opts.uiDir.trim() : "";
    const serveStatic = uiDir ? makeStaticHandler(uiDir) : null;

    // Spawn the live Next.js server (recommended UI mode) before binding the
    // public port, so dynamic routes like /graph/<id> work for any graph id.
    let nextServer: NextServerHandle | null = null;
    if (opts.next?.frontendDir) {
        nextServer = await spawnNextServer({
            cwd: opts.next.frontendDir,
            port: opts.next.port ?? requested + 1,
        });
        console.log(`   Next.js UI server  → ${nextServer.base}`);
    }
    const nextHandler = nextServer ? makeNextHandler(nextServer) : null;
    const servingUi = !!nextServer || !!serveStatic;

    console.log("DevLens starting up...");
    await initConfig();

    // Priority: live Next UI → static UI bundle → API router. Both UI handlers
    // skip `/api/*`, so the router always owns API traffic.
    const handleUi = async (req: Request): Promise<Response | null> => {
        if (nextHandler) return nextHandler(req);
        if (serveStatic) return serveStatic(req);
        return null;
    };

    let server: { port: number; stop: () => void } | null = null;
    let port = requested;
    let tries = 0;

    // ── Bind, auto-incrementing the port when one is taken ─────────────────
    for (;;) {
        try {
            const s = Bun.serve({
                port,
                idleTimeout: 60,
                async fetch(req: Request) {
                    const ui = await handleUi(req);
                    if (ui) return withCors(ui);
                    // …otherwise everything routes through the API router.
                    return withCors(await router(req));
                },
                error(err: Error) {
                    return Response.json(
                        { success: false, error: err.message ?? "Internal server error" },
                        { status: 500, headers: CORS_HEADERS }
                    );
                },
            });
            server = { port: s.port ?? requested, stop: () => s.stop(true) };
            break;
        } catch (err) {
            if (isPortInUse(err) && tries < MAX_PORT_TRIES) {
                tries++;
                port = requested + tries;
                continue;
            }
            if (isPortInUse(err)) {
                // Give up scanning; let the OS hand out a free ephemeral port.
                const s = Bun.serve({
                    idleTimeout: 60,
                    async fetch(req: Request) {
                        const ui = await handleUi(req);
                        if (ui) return withCors(ui);
                        return withCors(await router(req));
                    },
                    error(err2: Error) {
                        return Response.json(
                            { success: false, error: err2.message ?? "Internal server error" },
                            { status: 500, headers: CORS_HEADERS }
                        );
                    },
                });
                server = { port: s.port ?? 0, stop: () => s.stop(true) };
                break;
            }
            throw err;
        }
    }

    if (!server) throw new Error("could not bind a port");

    const bound = server.port;
    const portNote = bound !== requested ? ` (port ${requested} was in use — picked ${bound})` : "";
    const mode = servingUi ? (nextServer ? "API + live web UI" : "API + static web UI") : "API only";
    console.log(`\n✅ DevLens server running in "${mode}" mode on http://localhost:${bound}${portNote}`);
    if (servingUi) {
        console.log(`   Web UI:        http://localhost:${bound}`);
    }
    console.log(`   Health check:  http://localhost:${bound}/api/health\n`);

    return {
        port: bound,
        servingUi,
        stop: () => {
            nextServer?.stop();
            server?.stop();
        },
    };
}

function withCors(res: Response): Response {
    if (res.headers.get("Access-Control-Allow-Origin")) return res;
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
    }
    return new Response(res.body, { status: res.status, headers });
}

// Allow `bun src/server/index.ts` to keep working standalone (also used by
// `bun start` / `bun run dev:engine`).
// Usage: bun src/server/index.ts [--port <n>] [--ui-dir <path>]
if (import.meta.main) {
    const argv = process.argv.slice(2);
    const argVal = (flag: string) => {
        const i = argv.indexOf(flag);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
    };
    const port = argVal("--port");
    const uiDir = argVal("--ui-dir");
    // `--frontend-dir <dir>` enables the live Next.js UI mode (requires a built
    // frontend: `bun run build:ui`). Any non-API path is proxied to the Next
    // server so dynamic /graph/<id> routes render on demand.
    const frontendDir = argVal("--frontend-dir");
    startServer({
        port: port ? parseInt(port, 10) : undefined,
        uiDir,
        ...(frontendDir ? { next: { frontendDir } } : {}),
    }).catch((err) => {
        console.error("❌ DevLens failed to start:", err);
        process.exit(1);
    });
}
