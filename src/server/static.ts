import fs from "node:fs";
import path from "node:path";

// Static file serving for the web UI bundle (an `output: 'export'` build of
// `frontend/`). Serves files verbatim with correct MIME types and falls back to
// `index.html` for any unknown path so client-side routes (e.g. /graph/<id>)
// hydrate correctly regardless of the graph id — this is the SPA fallback.
//
// Returns a Response for a served asset, or null when the request should be
// handled elsewhere (missing bundle, non-GET, /api path, path traversal).

const MAX_CACHE_AGE = 60 * 60 * 24; // 1 day for hashed assets under /_next/static
const HTML_CACHE_AGE = 0; // never cache the shell

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

export interface StaticHandlerOptions {
  /** Index fallback target (default "index.html"). */
  indexFile?: string;
}

export function makeStaticHandler(uiDir: string, opts: StaticHandlerOptions = {}) {
  const root = path.resolve(uiDir);
  const indexFile = opts.indexFile ?? "index.html";

  // Guard: never serve a path that has not been built.
  if (!fs.existsSync(path.join(root, indexFile))) {
    return () => null;
  }

  return function serveStatic(req: Request): Response | null {
    // Only GET/HEAD are relevant for static assets.
    if (req.method !== "GET" && req.method !== "HEAD") return null;

    const url = new URL(req.url);
    const pathname = url.pathname;

    // Never let the static layer shadow the API. (When UI serving is enabled the
    // root `/` IS the UI, so it's served as index.html below; API-only mode has
    // no static handler and `/` returns the API welcome JSON.)
    if (pathname.startsWith("/api/")) return null;

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }

    // Resolve within root and block traversal.
    const target = path.normalize(path.join(root, decoded));
    if (target !== root && !target.startsWith(root + path.sep)) return null;

    let filePath = target;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, indexFile);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // SPA fallback: serve the app shell for client-side routes.
      filePath = path.join(root, indexFile);
      if (!fs.existsSync(filePath)) return null;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    const cacheControl =
      pathname.startsWith("/_next/") ? `public, max-age=${MAX_CACHE_AGE}, immutable` : `no-cache`;

    const file = Bun.file(filePath);
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  };
}
