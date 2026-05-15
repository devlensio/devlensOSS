<div align="center">

<img src="assets/logo_1.png" alt="DevLens Logo" width="120" />

<h1>DevLens</h1>

<p><strong>Codebase intelligent Graph Visualizer for TypeScript & JavaScript projects.</strong><br/>
Turn any repo into an interactive dependency graph — with AI summaries, importance scoring, and commit diffs. Runs entirely on your machine.</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015-black?logo=next.js)](https://nextjs.org)

**[Join the Cloud Waitlist →](https://devlens.io)**

---

[![DevLens Demo](assets/image.png)](https://youtu.be/6OMsk8lNv4c?si=wpYF80IcfuJpN_Gf)
*Click to watch the demo*

</div>

---

## Table of Contents

- [What is DevLens?](#what-is-devlens)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Performance](#performance)
- [Use Cases](#use-cases)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [DevLens Cloud](#devlens-cloud)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## What is DevLens?

AI coding tools like Cursor and Claude Code let you ship faster than ever — but that speed creates a new problem. **Codebases grow faster than anyone can understand them.** Developers merge code they didn't fully read. New hires drown in unfamiliar structure. Even authors forget why things are wired the way they are.

DevLens solves this by turning any React, Next.js, or Node.js repository into a **living, queryable map** of your codebase — so your team always knows what was built, how it connects, and why.

Point DevLens at any repository and it:

1. **Walks the AST** — extracts every component, hook, function, store, utility, and API route
2. **Builds a dependency graph** — maps all relationships: calls, imports, state reads/writes, prop passing, events, and route handling
3. **Scores every node** — ranks nodes by architectural importance using a multi-pass algorithm (no AI involved)
4. **Summarizes with LLMs** — generates a business summary and a technical summary for every node
5. **Renders an interactive graph** — explore, filter, search, and diff your codebase visually

Everything runs on your machine. Your code never leaves.

---

## Key Features

### Graph Engine

- **Full AST analysis** via ts-morph — components, hooks, functions, stores, utilities, files, and API routes
- **10 edge types** — `CALLS`, `IMPORTS`, `PROP_PASS`, `READS_FROM`, `WRITES_TO`, `EMITS`, `LISTENS`, `WRAPPED_BY`, `GUARDS`, `HANDLES`, `TESTS`, `USES`
- **State layer detection** — detects Redux, Zustand, Jotai, and custom hooks, then maps every component that reads or writes to each store
- **Importance scoring** — multi-pass algorithm considering complexity, fan-in, fan-out, and type bonuses
- **Route entry points** — detects Next.js app/pages router and Express/Fastify/Koa routes; BFS expansion from HTTP endpoints reveals full call chains
- **Commit-aware** — tracks multiple commits, smart summary reuse across branches via git history

### Summarization

- **Two summaries per node** — a business summary explaining what it does in product terms, and a technical summary explaining how it's implemented
- **Topological ordering** — leaf nodes are summarized first so each node's prompt includes its dependencies' summaries, producing richer and more accurate output
- **Checkpoint & resume** — pause, resume, or recover from crashes mid-summarization with zero data loss
- **MapReduce for large files** — files over 1,200 tokens are automatically split, mapped in parallel, and reduced to a final summary
- **Security analysis** — flags high/medium/low risk patterns per node
- **Smart reuse** — unchanged nodes between commits are never re-summarized; 90%+ of nodes are free on typical re-runs

### Frontend

- **Interactive Cytoscape canvas** — force-directed layout, node focus, zoom, pan
- **7 sidebar panels** — Project info, Nodes, Search, Highlighted, Files, Commit diff, Security issues
- **Node detail panel** — summaries, connections, source code, K-hops, and blast radius tools
- **Commit diff overlay** — visualize added, removed, moved, and re-scored nodes across commits
- **Deferred filter apply** — filter changes batch until you click Apply, preventing re-renders on large repos
- **Live job streaming** — SSE-powered real-time progress for analysis and summarization

---

## How It Works

```
Your Repo
    │
    ▼
[1] Fingerprint         Detect framework, language, router, state manager, databases
[2] Filesystem scan     Extract routes (Next.js app/pages, Express, Fastify, Koa)
[3] AST parse           ts-morph walks every .ts/.tsx/.js/.jsx file
[4] Edge detection      10 detectors run in parallel → dependency graph
[5] Scoring             Multi-pass importance scoring, noise filtering
[6] Save graph          Written to ~/.devlens/ — instant on re-open
[7] Summarize           Topologically ordered LLM calls with checkpoint/resume
    │
    ▼
Interactive Graph UI
```

---

## Performance

Real numbers from production repos:

| Metric | Value |
|--------|-------|
| Graph generation (499 nodes) | ~6–7 seconds |
| Graph generation (2,500 nodes) | ~20 seconds |
| Summarization (499 nodes) | ~5–6 minutes |
| Summarization (2,500 nodes) | ~20 minutes |
| Token usage — 499 node repo | < 1M tokens |
| Token usage — 2,500 node repo | ~2M tokens |
| Re-analysis (unchanged nodes reused) | 90%+ nodes free |
| Cost — 400 node repo with grok-4.1-fast | ~$0.30 |

---

## Use Cases

### Understanding AI-generated codebases

AI tools write code fast — but fast code becomes a black box. DevLens gives you a visual map of every component, how they connect, and what they do in plain English. You spend far fewer tokens understanding the codebase because the graph and summaries do the heavy lifting upfront.

### Onboarding new engineers

Drop a new hire into any codebase. They can explore the graph, read AI summaries of every module, and understand the architecture in hours instead of weeks. Knowledge transfer becomes a link, not a meeting.

### Blast radius & impact analysis

Before merging a PR, use blast radius analysis to see every node that could be affected by a change. Diff commits visually to see exactly what moved, what changed in importance score, and what was added or removed.

### Architecture audits

Surface high-importance nodes, identify security risks, find circular dependencies, and understand which files are true architectural bottlenecks — all in one view.

### Living documentation

Every node gets a business summary and a technical summary, generated automatically. Your codebase documents itself and stays up to date as your code changes.

### Security review

The security panel surfaces all high/medium/low risk nodes in one place with severity explanations. Filter by severity, search by file, click to inspect the source.

### Refactoring with confidence

Use K-hops to understand the neighbourhood of any node — what it calls and what calls it. Use blast radius to understand what breaks if you change it. Move fast without breaking things.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js 18+
- An LLM provider API key (see [Configuration](#configuration))

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/devlensio/devlensOSS.git
cd devlensOSS

# 2. Install all dependencies (engine + frontend + shared)
bun install

# 3. Configure environment (optional — can also be set in the UI)
cp .env.example .env
# Edit .env with your LLM provider settings

# 4. Start both servers
bun run dev
```

The engine starts at `http://localhost:3000` and the frontend at `http://localhost:3001`. Make sure both ports are available before starting.

Open `http://localhost:3001`, paste the absolute path to any React/Next.js/Node.js/Express repo (it must have a `package.json` in the root), and click **Analyze**.

### Quick start with Ollama (free, local)

```bash
# Install Ollama from https://ollama.ai
ollama pull qwen2.5-coder:7b

# In your .env:
LLM_PROVIDER=ollama
LLM_MODEL=qwen2.5-coder:7b

bun run dev
```

> **Note:** Local Ollama models are functional but slow — expect hours for large repos. For best results, use a fast hosted model like `grok-4.1-fast` via OpenRouter. Avoid free-tier OpenRouter models as they have rate limits too low for full summarization runs (free models don't work most of the times).

---

## Configuration

If you prefer not to set environment variables, open the Config panel in the navbar and enter your settings directly in the UI.

### Supported providers

| Provider | Recommended model | Notes |
|----------|------------------|-------|
| Ollama (local) | `qwen2.5-coder:7b` | Free, local, requires 8GB+ RAM. Slow on large repos. |
| OpenAI | `gpt-4o-mini` | Fast, cost-effective |
| Anthropic | `claude-haiku-4-5-20251001` | Excellent code understanding |
| OpenRouter | `grok-4.1-fast` | Access to 100+ models. Recommended for cost/quality balance. |

### Environment variables

```env
LLM_PROVIDER=openrouter       # ollama | openai | anthropic | openrouter
LLM_MODEL=grok-4.1-fast       # model name for the chosen provider
LLM_API_KEY=your_api_key      # not needed for ollama
LLM_BASE_URL=                 # optional custom base URL
```

---

## DevLens Cloud

A hosted cloud version is currently in development. It will include:

- **GitHub integration** — connect repos directly, no local clone needed
- **Shareable graphs** — share your graph with your team or make it public via a link
- **Team collaboration** — leave annotations on any node, track changes as a team
- **LLM interface** — ask anything about your codebase in plain English, answered using your graph and summaries
- **Semantic search** — vector search across all node summaries
- **PR review summaries** — automatic AI diff summaries on every pull request
- **Persistent storage** — graphs saved to the cloud, accessible from any device

**[Join the waitlist →](https://devlens.io)**

---

## Project Structure

```
devlens/
├── engine/                     # Bun server + analysis pipeline
│   └── src/
│       ├── server/             # HTTP handlers, SSE streaming, routing
│       ├── pipeline/           # Main analysis orchestration
│       ├── parser/             # ts-morph AST extraction
│       ├── graph/              # Edge detection (10 detectors)
│       ├── scoring/            # Importance scoring + noise filtering
│       ├── summarizer/         # LLM summarization, checkpoint system
│       ├── filesystem/         # Route detection (Next.js, Express, etc.)
│       ├── storage/            # File-based graph persistence
│       └── jobs/               # Job queue, concurrency, SSE events
└── frontend/                   # Next.js 15 UI
    └── src/
        ├── app/                # Pages (home, graph view)
        ├── components/graph/   # Canvas, sidebar, panels, filters
        └── lib/                # API client, hooks, types, algorithms
```

---

## Contributing

DevLens is actively under development. The core engine and frontend are functional, with a lot more planned.

If you find bugs, have feature ideas, or want to contribute — open an issue or PR. All contributions to this repo remain open source under AGPL v3.

I am working on detailed `CONTRIBUTING.md` and contribution guide will be added as the project matures. In the meantime, all contributions are welcome.

---

## License

DevLens is licensed under the [GNU Affero General Public License v3.0](LICENSE).

You are free to use, modify, and distribute DevLens. If you run a modified version as a hosted service, you must release your modifications under the same license.
