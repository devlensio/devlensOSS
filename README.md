<div align="center">

<img src="assets/logo_1.png" alt="DevLens Logo" width="120" />

# DevLens

**Intelligent codebase visualizer.**

Turn any JavaScript, TypeScript, React, Next.js, or Node.js repo into a living, queryable map — with functional summaries, technical summaries, and security analysis on every node.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm: @devlensio/cli](https://img.shields.io/badge/npm-%40devlensio%2Fcli-cb3837?logo=npm)](https://www.npmjs.com/package/@devlensio/cli)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-f9f1e1?logo=bun)](https://bun.sh)

**[Join the DevLens Cloud Waitlist →](https://devlens.io)**

</div>

---

[![DevLens Demo](assets/image.png)](https://youtu.be/6OMsk8lNv4c?si=wpYF80IcfuJpN_Gf)

<p align="center"><em>Click the image to watch the demo</em></p>

---

## Table of Contents

- [About](#about)
- [Who is this for](#who-is-this-for)
- [Quick Start](#quick-start)
- [The Problem DevLens Solves](#the-problem-devlens-solves)
- [Benchmarks](#benchmarks)
- [Ways to Use DevLens](#ways-to-use-devlens)
  - [Web UI](#web-ui--visual-exploration)
  - [CLI](#cli--terminal-power)
  - [Agent Skill](#agent-skill--ai-powered-understanding)
  - [MCP Server](#mcp-server--for-any-mcp-compatible-ai-agent)
- [Configuration](#configuration)
- [What DevLens Understands](#what-devlens-understands)
- [Repository Layout](#repository-layout)
- [DevLens Cloud](#devlens-cloud)

---

## About

DevLens is a **codebase visualizer** for JavaScript, TypeScript, React, Next.js, and Node.js projects. It builds a typed dependency graph of every component, hook, function, route, and store — with AI-powered summaries on each node — so you can explore, understand, and analyze your architecture in seconds instead of hours.

> **What makes it different?** Instead of reading files one at a time, you (or your AI agent) query the pre-built graph. A node summary costs **~50 tokens** vs **~2,000 tokens** per file.

---

## Who Is This For

### Developers & Teams

- **Onboard new devs in hours, not weeks** — explore the graph instead of spelunking files.
- **Review PRs with full context** — see exactly what depends on each change.
- **Run impact analysis before refactoring** — "what breaks if I change this?"
- **Catch circular deps, god-files, and coupling hotspots** automatically.
- **Keep living documentation** — summaries stay fresh as code changes.

### Engineering Leaders

- **Get a bird's-eye view** of your entire codebase in seconds.
- **Spot architectural debt** before it becomes a crisis.
- **Understand what your team has been building** — even across repos.

### Students & Learners

- **See how real codebases are designed** — layers, patterns, data flow.
- **Understand why things are connected**, not just what each file does.
- **Learn architecture patterns** from production-grade projects.

### AI-Augmented Developers

Your agent burns tokens re-reading files it's seen before. DevLens gives it a graph to query instead.

> **Coming soon — DevLens Cloud:** Shareable graphs your whole team can access, cross-repo navigation, and giving graphical context to your AI agents for smarter code review and analysis — all without running anything locally.

---

## Quick Start

**1. Install**

```bash
npm install -g @devlensio/cli
```

> **No Node.js?** Use the one-command standalone binary installer:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.sh | sh
> ```

**2. Init**

```bash
cd your-project
devlens init
```

This sets up your LLM provider for AI summaries. Don't need AI? Skip this — structural analysis works offline.

**3. Analyze**

```bash
devlens analyze . --summarize
```

This builds a typed dependency graph of every component, hook, function, route, and store — with AI-powered summaries on each node.

**4. Explore**

```bash
devlens overview                  # big picture: framework, stats, central nodes
devlens find-nodes -t ROUTE       # find every route in the app
devlens security                  # see security flags across the codebase
```

---

## The Problem DevLens Solves

AI coding tools let you ship faster than ever — but that speed creates **AI debt**: code merged without understanding, agents re-discovering connections every session, new hires drowning in unfamiliar structure.

DevLens fixes this by pre-building a **typed dependency graph** of your entire codebase. Every node gets:

- **Functional summary** — what business purpose does this serve?
- **Technical summary** — how does it work?
- **Security assessment** — severity + explanation

Armed with this graph, you (or your AI agent) can understand the full architecture in **~50 tokens per node** instead of ~2,000 per file.

---

## Benchmarks

*Tested across real-world tasks — architecture understanding, feature implementation, and bug finding — comparing the same model (DeepSeek V4 Flash, GLM 5.2, Kimi K2.6, Qwen 3.6) with and without DevLens.*

### Architecture Understanding (4 models, full DevLens MCP)

<br /><br />

<div align="center">
<img src="assets/01_arch_metrics.png" alt="Architecture benchmark — cost, tokens, steps comparison" width="90%" />
</div>

<br /><br />

| Metric | Without DevLens | With DevLens | Improvement |
|--------|:--------------:|:------------:|:-----------:|
| Avg cost per query | $0.163 | **$0.075** | **54% cheaper** |
| Avg input tokens | 88,980 | **35,035** | **61% less** |
| Avg output tokens | 9,549 | **3,233** | **66% less** |
| Avg tool steps | 14.3 | **7.8** | **45% faster** |
| Structured architecture output | 50% | **100%** | **2× more reliable** |
| Architectural debt discovered | 0% | **50%** | **Now discoverable** |
| Avg cache hit rate | 75.2% | **83.7%** | **+8.5pp** |

<br /><br />

<div align="center">
<img src="assets/03_arch_savings_per_model.png" alt="Per-model savings" width="70%" />
<br /><br />
<img src="assets/02_arch_cache.png" alt="Cache hit rate comparison" width="70%" />
</div>

<br /><br />

> **Notable:** Even the strongest model (DeepSeek V4 Flash) was **81% cheaper** ($0.0035 vs $0.0185) and used **83% fewer input tokens** with DevLens.

### Feature Implementation & Bug Finding (DeepSeek V4 Flash)

*5 prompts across implementation and debugging tasks — DevLens graph context only (no per-node summaries).*

<br /><br />

<div align="center">
<img src="assets/04_prompt_metrics.png" alt="Prompt benchmark metrics" width="80%" />
</div>

<br /><br />

| Task | Input tokens saved | Cache improvement |
|------|:-----------------:|:-----------------:|
| Continue Watching feature | **24%** less input (56.8k vs 74.9k) | +5.2pp cache |
| Rate Limiting feature | **22%** less input (32.1k vs 41.1k) | +8.3pp cache |
| Error Handling audit | *(comparable)* | Comparable |
| Profile Bug trace | **32%** less input (36.9k vs 54.3k) | Similar |

### Quality Impact (Architecture Task)

<br /><br />

<div align="center">
<img src="assets/09_quality_comparison.png" alt="Quality comparison" width="80%" />
<br /><br />
<img src="assets/08_quality_matrix.png" alt="Quality matrix" width="80%" />
</div>

<br /><br />

When asked to explain a codebase's architecture:

| Capability | Without DevLens | With DevLens |
|-----------|:--------------:|:------------:|
| Produced structured output | 50% | **100%** |
| Referenced specific graph metrics | 0% | **100%** |
| Identified architectural debt | 0% | **50%** |
| Named specific important files | 75% | **100%** |

---

## Ways to Use DevLens

Pick the interface that fits your workflow.

### <img src="assets/web-icon.svg" width="20" style="vertical-align: middle" /> Web UI — Visual Exploration

*For when you want to see your codebase laid out as an interactive graph.*

Open the Web UI, paste your repo path, and explore a force-directed canvas — click any node to see its summaries, callers, callees, and security flags. Search, filter, diff commits across versions.

```bash
git clone https://github.com/devlensio/devlensOSS.git
cd devlensOSS && bun install && bun run dev
```

### <img src="assets/cli-icon.svg" width="20" style="vertical-align: middle" /> CLI (`@devlensio/cli`) — Terminal Power

*For scripts, CI, and when you want answers fast without leaving the terminal.*

```bash
npm install -g @devlensio/cli
```

| Command | Description | Example |
|---------|-------------|---------|
| `devlens analyze .` | Analyze a repository into a DevLens graph | `devlens analyze ./my-app --summarize` |
| `devlens overview` | Big picture — framework, stats, central nodes | `devlens overview` → "Next.js 15, 342 nodes, 12 routes, top node: Layout (9.2)" |
| `devlens blast-radius <nodeId>` | What breaks if I change this? | `devlens blast-radius "src/auth.ts::login"` → "14 dependents affected" |
| `devlens cycles` | Find circular dependencies | `devlens cycles` → Lists every circular import group |
| `devlens find-nodes -t <type>` | Filter nodes by type (ROUTE, COMPONENT, etc.) | `devlens find-nodes -t ROUTE` → Lists all 12 routes |
| `devlens find-nodes --severity high` | Find high-severity security issues | `devlens find-nodes --severity high` → "2 findings in auth module" |
| `devlens diff <from> <to>` | Compare two analyzed commits | `devlens diff abc123 def456` → "Added: AnalyticsTracker, Changed: CheckoutForm" |
| `devlens security` | List every security issue | `devlens security --min-severity high --json` |
| `devlens config` | View or update configuration | `devlens config --provider openrouter --model deepseek-v4-flash` |

Each command supports `--json` for piping into scripts and CI pipelines.

> **Full reference:** [`src/cli/README.md`](src/cli/README.md) — every command with examples and options.

### <img src="assets/skill-icon.svg" width="20" style="vertical-align: middle" /> Agent Skill (`@devlensio/skill`) — AI-Powered Understanding

*The most powerful way to use DevLens. Your AI agent normally reads files one at a time — the DevLens Skill teaches it to query the pre-built graph instead.*

```bash
npx @devlensio/skill install
```

Then reload your tool and use `/devlens` in Claude Code, Cursor, or Kilo:

| Command | Description | Example |
|---------|-------------|---------|
| `/devlens architecture` | Full system overview — stack, modules, routes, patterns | `/devlens architecture` → Returns structured report: framework, 12 routes, 3 modules, security posture |
| `/devlens security-analysis` | Prioritized security findings with exploit notes | `/devlens security-analysis high` → "SQL injection in loginUser (reach: 14 nodes)" |
| `/devlens impact <symbol>` | Blast radius — what breaks if you change this? | `/devlens impact loginUser` → "14 dependents across 3 modules" |
| `/devlens tech-debt` | Circular deps, coupling hotspots, god-files | `/devlens tech-debt` → "3 cycles, Navbar has 28 dependents" |
| `/devlens guard [target]` | Warn before editing high-risk code | `/devlens guard` → "⚠️ authMiddleware affects 22 dependents" |
| `/devlens onboard` | Generate `ONBOARDING.md` for new devs | `/devlens onboard` → Writes full onboarding doc to repo root |
| `/devlens explain [path]` | Understand a module with callers/callees | `/devlens explain src/api/` → Walks through all API handlers |
| `/devlens find <name>` | Locate any component, hook, or function | `/devlens find Button` → "3 matches across components and tests" |
| `/devlens changes [range]` | Explain what changed and its impact | `/devlens changes yesterday` → "3 files, 2 features, 1 bug fix" |
| `/devlens diagram [type]` | Mermaid diagrams of architecture or flows | `/devlens diagram architecture` → Generates layered module diagram |

> **Full reference:** [`packages/skill-installer/README.md`](packages/skill-installer/README.md) — all subcommands with examples, install options, and supported tools.

### <img src="assets/mcp-icon.svg" width="20" style="vertical-align: middle" /> MCP Server — For Any MCP-Compatible AI Agent

*Wire DevLens into any MCP client (Claude Desktop, IDE plugins, etc.). Bundled inside the CLI — exposes 14 tools over the Model Context Protocol.*

```bash
devlens mcp                       # stdio mode
claude mcp add devlens -- devlens mcp   # register in Claude Code
devlens mcp http -p 7000          # HTTP mode
```

Each MCP tool is a query into the pre-built graph — your agent can:
- `list_analyzed_repos` — see what repos are already analyzed
- `get_repo_overview` — framework, stats, route count at a glance
- `find_nodes` — search by name, type, file, severity, or score
- `get_blast_radius` — check impact before refactoring
- `get_security_issues` — rank all security findings
- `list_cycles` — find circular dependencies
- `analyze_changes` — diff two analyzed commits

> **Full reference:** [`src/mcp/README.md`](src/mcp/README.md) — tool reference, examples, registration, and configuration.

---

## Configuration

Config lives in `~/.devlens/config.json` — set via `devlens init` or `devlens config`.

| Provider | Recommended model | Notes |
| :-- | :-- | :-- |
| Ollama (local) | `qwen2.5-coder:7b` | Free, local, 8GB+ RAM |
| OpenAI | `gpt-4o-mini` | Fast, cost-effective |
| Anthropic | `claude-sonnet-5` | Excellent code understanding |
| OpenRouter | `deepseek-v4-flash` or `mimo-v2.5` | Best cost/quality balance |
| Gemini | `gemini-2.0-flash` | Fast, large context |

```bash
devlens config --provider openrouter --model deepseek-v4-flash --api-key <key>
```

---

## What DevLens Understands

**Node types:** `COMPONENT`, `HOOK`, `FUNCTION`, `STATE_STORE`, `UTILITY`, `FILE`, `ROUTE`, `TEST`, `STORY`, `THIRD_PARTY`

**Route types:** Next.js (app & pages), Express / Fastify / Koa, React Router / TanStack Router / wouter

**Edge types:** `CALLS`, `IMPORTS`, `READS_FROM`, `WRITES_TO`, `PROP_PASS`, `EMITS`, `LISTENS`, `WRAPPED_BY`, `GUARDS`, `HANDLES`, `TESTS`, `USES`, `NEXTJS_API_CALL`, `NAVIGATES_TO`

**Per node:** Importance score + functional summary + technical summary + security assessment

---

## Repository Layout

```
devlensOSS/
├── src/
│   ├── cli/                  # `devlens` CLI (commander program + commands)
│   ├── core/                 # Shared query core (CLI + MCP — never drift)
│   ├── mcp/                  # MCP server (stdio + HTTP), 14 tools
│   └── server/               # Backend API for the Web UI
├── frontend/                 # Next.js 15 graph visualizer (Cytoscape)
├── plugins/devlens/          # Agent Skill (Claude plugin source)
├── packages/skill-installer/ # @devlensio/skill — npx installer
├── bin/                      # npm launcher
├── npm/<platform>/           # 5 prebuilt binary packages
├── scripts/                  # Release tooling
└── server.json               # MCP registry manifest
```

The analysis engine lives in the separate [`devlensio`](https://www.npmjs.com/package/devlensio) package.

---

## DevLens Cloud

A hosted version is in development:

- **Shareable graphs** your whole team can access
- **Cross-repo navigation** — understand your entire org
- **Give graphical context to AI agents** for smarter code review and analysis
- **No local setup required**

**[Join the waitlist →](https://devlens.io)**
