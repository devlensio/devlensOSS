/// <reference types="bun" />
import { initConfig } from "devlensio";
import { router } from "./router.js";

export const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
};

export async function startServer(opts: { port?: number; repoPath?: string } = {}): Promise<void> {
    const port = opts.port ?? parseInt(process.env.PORT ?? "3000", 10);
    console.log("DevLens starting Up...");
    await initConfig();

    Bun.serve({
        port,
        idleTimeout: 60,
        async fetch(req: Request) {
            // All routing (including OPTIONS → 204) goes through router.
            // CORS is stamped here onto every response, including error responses.
            const res = await router(req);
            const headers = new Headers(res.headers);
            for (const [key, value] of Object.entries(CORS_HEADERS)) {
                headers.set(key, value);
            }
            return new Response(res.body, { status: res.status, headers });
        },
        error(err: Error) {
            return Response.json(
                { success: false, error: err.message ?? "Internal server error" },
                {
                    status: 500,
                    headers: CORS_HEADERS,
                }
            );
        },
    });
    console.log(`\n✅ DevLens server running on http://localhost:${port}`);
    console.log(`   Health check: http://localhost:${port}/api/health\n`);
}

// Allow `bun src/server/index.ts` to keep working standalone.
if (import.meta.main) {
    startServer().catch((err) => {
        console.error("❌ DevLens failed to start:", err);
        process.exit(1);
    });
}

