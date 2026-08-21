# `frontend` — the DevLens Web UI

An interactive codebase-graph visualizer built with **Next.js 16** and **Cytoscape**. It talks to the DevLens backend API (`src/server`) and renders the analyzed graph: a force-directed canvas with per-node detail, search/filter, commit-diff overlay, and a security panel.

The graph view lives under a **dynamic route** (`/graph/[graphId]`), because a user analyzes new repos after installing DevLens — the graph id isn't known at build time. So the frontend is built and run as a **live Next.js server** (`next build` → `next start`), which renders *any* `/graph/<id>` on demand. `bun start` runs that live server on a single port (via a Bun proxy): `/api/*` is handled by the DevLens API router, and everything else is proxied to the Next server — so the UI and API stay on one port and graph navigation works for graphs created after startup.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Cytoscape** + `cytoscape-fcose` — graph canvas & force-directed layout
- **@tanstack/react-query** — server state / data fetching
- **highlight.js** + `html-react-parser` + `dompurify` — safe rendered source & summaries
- **react-toastify**, **react-icons** — UI chrome

## Layout

```
frontend/
├── app/            # App Router pages (home, graph view) + layout
├── components/     # UI — graph canvas, sidebar panels, node detail, filters
├── lib/            # API client, hooks, types, client-side graph algorithms
├── public/         # static assets
└── next.config.ts  # Next config
```

## What it shows

- **Interactive canvas** — force-directed layout, focus, zoom, pan; nodes colored/shaped by type.
- **Node detail panel** — technical + business summaries, security assessment, callers/callees, raw source, k-hop and blast-radius tools.
- **Sidebar panels** — project info, nodes, search, highlighted, files, commit diff, security issues.
- **Commit-diff overlay** — added / removed / moved / re-scored nodes across commits.
- **Live job streaming** — SSE-powered real-time progress while a repo is analyzed/summarized.

## Run

**Production — one command from the repo root** (`bun start` builds the frontend *only when there's no existing build*, then serves UI + API together on a single port; it auto-increments if busy):

```bash
bun install
bun start                # builds on first run, then serves API + Web UI on :3000
# → Web UI:  http://localhost:3000
```

`bun start` is **fast on repeat runs**: it skips the Next.js build when `frontend/.next` already exists (use `bun run start -- --rebuild` to force a fresh build, or `-- --port 4100` to pick a starting port).

The Web UI runs from the source tree via `bun start` — it is **not** bundled into the installed CLI binary (`devlens serve` is API-only; the Web UI is not part of the CLI distribution).

> Because the UI is a *live* Next server, opening `/graph/<any-new-graph-id>` (from the **Analyzed Repositories** cards, or directly) always renders the graph — even for repos analyzed after the server started.

**Development — hot-reloading** (backend on :3000, frontend on :3001):

```bash
# from the repo root (recommended): backend + frontend together
bun install && bun run dev

# or run just the frontend dev server (expects the backend already running)
cd frontend && bun run dev   # next dev
```

Open the printed URL, paste the **absolute path** to a repo (it must have a root `package.json`), and click **Analyze**.

> **API base URL:** in production the UI calls the API on the **same origin** (whatever port `bun start` chose), so no config is needed. In `next dev` it targets `http://localhost:3000` by default. Override with `NEXT_PUBLIC_ENGINE_URL` if the UI and API are on different origins.

## Scripts

| Script | Does |
| :-- | :-- |
| `bun run dev` | `next dev` — hot-reloading dev server (dev only) |
| `bun run build` | `next build` — production build (server mode, `frontend/.next`); served by `bun start` via a live Next server |
| `bun run lint` | `eslint` |
| *(repo root)* `bun run build:ui` | alias for `cd frontend && bun run build` |

## Backend

The UI is a client of the backend API in [`../src/server`](../src/server), which runs the [`devlensio`](https://www.npmjs.com/package/devlensio) analysis pipeline and streams job progress over SSE. Graphs are persisted under `~/.devlens` and shared with the CLI and MCP server.
