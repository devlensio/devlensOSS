import type { NextConfig } from "next";

// DevLens ships its web UI as a REAL Next.js server (`next build` + `next start`),
// NOT a static export. This is intentional: the graph view lives under a
// dynamic route (`/graph/[graphId]`) that can point at ANY graph id a user
// analyzes after installation. A static `output: "export"` bundle can only
// pre-render the specific ids present in `generateStaticParams`, so navigating
// to `/graph/<some-new-id>` would change the URL but fail to render the graph
// (Next would have no RSC payload for it). A live Next server renders every
// `/graph/<id>` on demand, so graph clicks always work.
//
// `bun start` runs this server behind a single Bun port: `/api/*` stays in the
// Bun router, and everything else is
// proxied to this Next server (see src/server/next-proxy.ts and index.ts).
const nextConfig: NextConfig = {
  // The Navbar uses next/image (logo.png). Keep image optimization off so the
  // logo is served as a plain static asset (no server-side image pipeline).
  images: { unoptimized: true },

  // API is same-origin in production (served behind the same Bun port), so no
  // rewrites are needed — the browser calls `/api/*` and Bun's router handles it.
};

export default nextConfig;
