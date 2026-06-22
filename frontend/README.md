# `frontend` — the DevLens Web UI

An interactive codebase-graph visualizer built with **Next.js 15** and **Cytoscape**. It talks to the DevLens backend API (`src/server`, started by `devlens serve` or `bun run dev`) and renders the analyzed graph: a force-directed canvas with per-node detail, search/filter, commit-diff overlay, and a security panel.

## Stack

- **Next.js 15** (App Router) + **React 19**
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

From the repo root (recommended — starts the backend **and** the frontend together):

```bash
bun install
bun run dev
```

Or run just the frontend (expects the backend already running):

```bash
cd frontend
bun run dev        # next dev
```

Open the printed URL, paste the **absolute path** to a repo (it must have a root `package.json`), and click **Analyze**.

## Scripts

| Script | Does |
| :-- | :-- |
| `bun run dev` | `next dev` — hot-reloading dev server |
| `bun run build` | `next build` — production build |
| `bun run start` | `next start` — serve the production build |
| `bun run lint` | `eslint` |

## Backend

The UI is a client of the backend API in [`../src/server`](../src/server), which runs the [`devlensio`](https://www.npmjs.com/package/devlensio) analysis pipeline and streams job progress over SSE. Graphs are persisted under `~/.devlens` and shared with the CLI and MCP server.
