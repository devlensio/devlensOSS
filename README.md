<div align="center">

<img src="assets/logo_1.png" alt="DevLens Logo" width="120" />

# DevLens

**Intelligent codebase visualizer.**

Turn any TypeScript, JavaScript, Python, Go, Rust, or Java repository into a living, queryable graph — every node carries a functional summary, a technical summary, and a security assessment.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm: @devlensio/cli](https://img.shields.io/badge/npm-%40devlensio%2Fcli-cb3837?logo=npm)](https://www.npmjs.com/package/@devlensio/cli)
[![npm: @devlensio/skill](https://img.shields.io/badge/npm-%40devlensio%2Fskill-cb3837?logo=npm)](https://www.npmjs.com/package/@devlensio/skill)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-f9f1e1?logo=bun)](https://bun.sh)

**[Join the DevLens Cloud Waitlist →](https://devlens.io)**

</div>

---

[![DevLens Demo](assets/image.png)](https://youtu.be/6OMsk8lNv4c?si=wpYF80IcfuJpN_Gf)

<p align="center"><em>Click the image to watch the demo</em></p>

---

## Table of Contents

- [What is DevLens?](#what-is-devlens)
- [Supported languages](#supported-languages)
- [Quick Start](#quick-start)
- [Screenshots](#screenshots)
- [Why it's faster & cheaper](#why-its-faster--cheaper)
- [Ways to use DevLens](#ways-to-use-devlens)
  - [Web UI](#web-ui--visual-exploration)
  - [CLI](#cli--terminal-power)
  - [Agent Skill — AI-Powered Understanding](#agent-skill--ai-powered-understanding)
  - [MCP Server — for any MCP-compatible AI agent](#mcp-server--for-any-mcp-compatible-ai-agent)
- [Configuration](#configuration)
- [What DevLens understands](#what-devlens-understands)
- [Benchmarks](#benchmarks)
- [Who is this for](#who-is-this-for)
- [How DevLens compares](#how-devlens-compares)
- [Repository layout](#repository-layout)
- [DevLens Cloud](#devlens-cloud)

---

## What is DevLens?

**DevLens turns a codebase into a pre-built dependency graph.** Instead of reading files one at a time, you (or your AI agent) query the graph: every component, class, function, route, struct, or trait is a **node**, and every connection is a **typed edge** (`CALLS`, `IMPORTS`, `HANDLES`, `IMPLEMENTS`, …). Each node carries:

- **Functional summary** — *what business purpose does this serve?*
- **Technical summary** — *how does it work?*
- **Security assessment** — *severity + explanation*

This is the difference between an AI that re-reads your whole repo every session and an AI that already knows the architecture — architecture reviews, impact analysis, security audits, and onboarding take **seconds, not hours**.

---

## Supported languages

DevLens parses **six languages with native parsers** (no regex, no tree-sitter) and understands their frameworks:

| Language | Frameworks / stacks the graph understands | What gets parsed |
| :-- | :-- | :-- |
| **TypeScript / JavaScript** | React, Next.js (app & pages router), Express/Hono/Fastify, React Router, TanStack Router, any Node | components, hooks, state stores, classes, methods, functions, routes |
| **Python** | FastAPI, Flask, Django (+DRF), SQLAlchemy / Django ORM, Celery, Pydantic | classes, methods, functions, routes, data models |
| **Java** | Spring Boot (controllers, JPA, Spring Data repositories) | classes, methods, interfaces, enums, routes |
| **Go** | net/http, Gin, Echo, chi, Fiber, GORM, database/sql | structs, interfaces, methods, functions, routes |
| **Rust** | axum, actix-web, rocket, utoipa, Diesel | structs, enums, traits, impl blocks, methods, functions, routes |

Each repo is analyzed with its language's own parser (Python `ast`, JavaParser, Go `go/ast` + `go/types`, Rust `syn`, TS compiler API), so edges are **real** — type-checked interfaces (`IMPLEMENTS`), framework routes (`HANDLES`), and ORM data layers (`READS_FROM`/`WRITES_TO`).

---

## Quick Start

**1. Install**

```bash
npm install -g @devlensio/cli
```

> **No Node.js?** Use the standalone binary installer (zero dependencies):
>
> **Linux / macOS:**
> ```bash
> curl -fsSL https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.sh | sh
> ```
>
> **Windows (PowerShell):**
> ```powershell
> irm https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.ps1 | iex
> ```

**2. Configure your AI provider** *(only needed if you want AI summaries — structure-only works offline)*

```bash
cd your-project
devlens init
```

**3. Analyze**

```bash
devlens analyze . --summarize
```

DevLens detects the language (TS/JS, Python, Go, Rust, Java) from your manifests, builds the graph, and summarizes every node.

**4. Explore**

```bash
devlens overview                # language, framework, stats, central nodes
devlens detect                  # "what is this repo?" — language, manifest, deps
devlens find-nodes -t ROUTE     # every route in the app
devlens architecture            # one-command architecture brief
devlens security                # security flags across the codebase
```

That's it. Want it in your AI agent instead? Jump to the [Agent Skill](#agent-skill--ai-powered-understanding).

---

## Screenshots

<div align="center">
<img src="assets/screenshot-graph.jpg" alt="Interactive graph explorer" width="48%" />
<img src="assets/screenshot-node.jpg" alt="Node inspector with summaries & security risk" width="48%" />
<br/><br/>
<img src="assets/screenshot-subgraph.jpg" alt="Focused node subgraph" width="48%" />
<img src="assets/screenshot-security.jpg" alt="Security findings" width="48%" />
<br/>
<em>Interactive graph explorer · node inspector with AI summaries & security risk · focused node subgraph · security findings</em>
</div>

---

## Why it's fast & cheaper

A node summary is **~50 tokens**. The file it describes is **~2,000**. Querying summaries and graph slices (`get_blast_radius`, `get_subgraph`) costs a fraction of reading files — humans get answers faster, and AI agents spend dramatically fewer tokens on the same task.

---

## Ways to use DevLens

Pick the interface that fits your workflow:

### <img src="assets/web-icon.svg" width="20" style="vertical-align: middle" /> Web UI — Visual Exploration

*For when you want to see your codebase laid out as an interactive graph.*

Open the Web UI, paste your repo path, and explore a force-directed canvas — click any node to see its summaries, callers, callees, and security flags. Search, filter, diff commits across versions.

```bash
git clone https://github.com/devlensio/devlensOSS.git
cd devlensOSS && bun install && bun run dev
```

### <img src="assets/cli-icon.svg" width="20" style="vertical-align: middle" /> CLI (`@devlensio/cli`) — Terminal Power

*For scripts, CI, and answers fast without leaving the terminal. Every command supports `--json` for piping into scripts, `-v/--verbose` for diagnostics, and `--quiet` for minimal output.*

```bash
npm install -g @devlensio/cli
```

**Analyze & summarize**

| Command | What it does |
|---------|--------------|
| `devlens detect [path]` | Inspect a repo **before** analyzing: language, manifest, dependency count, source files |
| `devlens analyze [path] [--summarize]` | Build the graph (optionally add AI summaries) |
| `devlens summarize [path]` | (Re)generate summaries for an analyzed repo |
| `devlens status` | Which repos are analyzed, their language + summary coverage |
| `devlens doctor` | Environment health check — git, storage, LLM provider, and **all 4 extractor runtimes** |

**Explore & understand**

| Command | What it does |
|---------|--------------|
| `devlens overview` | Big picture — language, framework, stats, central nodes |
| `devlens find-nodes <name>` | Search by name / type / file / severity (supports `-t ROUTE`, `-t CLASS`, `-t STRUCT` …) |
| `devlens nodes-in-path <path>` / `get-node <id>` / `get-summaries <ids…>` / `node-code <id>` | Drill into nodes — summaries before source |
| `devlens architecture` | One-call architecture brief — modules, routes, flows, health |

**Impact & quality**

| Command | What it does |
|---------|--------------|
| `devlens blast-radius <id>` | What breaks if I change this? (upstream dependents) |
| `devlens khop <id>` | What does it depend on? (downstream) |
| `devlens subgraph <seed>` | The cohesive cluster (module) a node belongs to |
| `devlens cycles` | Circular dependencies |
| `devlens security` / `security-brief` | Security findings, ranked with blast-radius reach |
| `devlens diff <from> <to>` / `review-pr` | Compare analyzed commits / full PR review packet |
| `devlens check-freshness` / `coverage` | Is the graph stale vs HEAD? What's summarized? |
| `devlens guard` | Warn before editing high-value / high-blast-radius nodes |

**Manage & integrate**

| Command | What it does |
|---------|--------------|
| `devlens config` | View / set LLM provider config (`~/.devlens/config.json`) |
| `devlens repos` | List analyzed repos |
| `devlens graphs list | delete` | Manage stored graphs |
| `devlens serve` | Start the HTTP API for the Web UI |
| `devlens mcp` | Run the MCP server (see below) |

> **Full reference:** [`src/cli/README.md`](src/cli/README.md) — every command with options and examples.

### <img src="assets/skill-icon.svg" width="20" style="vertical-align: middle" /> Agent Skill — AI-Powered Understanding

*The most powerful way to use DevLens. Your AI agent normally reads files one at a time — the DevLens Skill teaches it to query the pre-built graph instead.*

```bash
npx @devlensio/skill install
```

Then reload your tool and use `/devlens` in Claude Code, Cursor, Kilo, opencode, pi, or any AI coding agent:

| Command | What it does |
|---------|--------------|
| `/devlens init` | Connect MCP, configure provider, analyze the repo |
| `/devlens architecture` | Full system brief — stack, modules, routes, patterns, security posture |
| `/devlens explain [path]` | Onboard to a module or the whole repo — callers, callees, reading path |
| `/devlens diagram [type]` | Mermaid diagrams (architecture, cluster, flow, deps) with typed edges |
| `/devlens security-analysis [level]` | Prioritized security report with reach + fix-order |
| `/devlens impact <symbol>` | Blast radius — what breaks if you change this? |
| `/devlens tech-debt` | Cycles, coupling hotspots, god-files |
| `/devlens guard [target]` | Warn before editing high-risk code |
| `/devlens onboard` | Write a saved `ONBOARDING.md` for new devs |
| `/devlens find <name>` | Locate any component, class, function, struct, or route |
| `/devlens summary <kind> <target>` | On-demand technical / functional / security summary |
| `/devlens changes [range]` | Explain recent work or a merge conflict, by functionality |

> **Full reference:** [`packages/skill-installer/README.md`](packages/skill-installer/README.md) — all subcommands, install options, and supported AI tools.

### <img src="assets/cli-icon.svg" width="16" style="vertical-align: middle" /> MCP Server — for Any MCP-Compatible AI Agent

*Wire DevLens into any MCP client (Claude Code, Claude Desktop, IDE agents, …). The server is bundled inside the CLI and exposes **21 tools** covering discovery, search, traversal, security, and one-call workflow summaries.*

```bash
devlens mcp                       # stdio mode
claude mcp add devlens -- devlens mcp   # register in Claude Code
devlens mcp http -p 7000          # HTTP mode
```

Your agent can: list analyzed repos, get a repo overview (language + framework + stats), find nodes by name/type/severity, read summaries, trace blast radius / k-hop / subgraphs, find cycles, analyze a new repo, compare commits (`analyze_changes`), and generate whole-packet **architecture/security/PR-review/onboarding/context** outputs from one call.

> **Full reference:** [`src/mcp/README.md`](src/mcp/README.md) — tool catalog, registration, configuration.

---

## Configuration

Config lives in `~/.devlens/config.json` and is set via `devlens init` or `devlens config`.

| Provider | Recommended model | Notes |
| :-- | :-- | :-- |
| Ollama (local) | `qwen2.5-coder:7b` | Free, local, 8 GB+ RAM |
| OpenAI | `gpt-4o-mini` | Fast, cost-effective |
| Anthropic | `claude-haiku-4-5` | Best cost/quality for summaries |
| DeepSeek | `deepseek-v4-flash` | Strong code model |
| OpenRouter | `deepseek-v4-flash` or `mimo-v2.5` | Best cost/quality balance |
| Gemini | `gemini-2.0-flash` | Fast, large context |

```bash
# Interactive setup — picks from a catalog and fetches live model lists
devlens config --set

# Non-interactive scripting
devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key <key>

# Switch between saved providers without re-entering credentials
devlens config --active openai:deepseek

# Health check
devlens doctor
```

Models are discovered dynamically from each provider's `/models` endpoint — no hardcoded model lists. Custom OpenAI- or Anthropic-compatible endpoints can be added through the interactive flow. Summaries are **never generated silently** — the skill and CLI ask permission first; structure-only analysis needs no provider at all.

---

## What DevLens understands

**Node types (per language — a graph is per-repo/per-language):**

| Language | Node types in the graph |
| :-- | :-- |
| TS / JS | `COMPONENT`, `HOOK`, `STATE_STORE`, `UTILITY`, `CLASS`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST`, `STORY`, `THIRD_PARTY` |
| Python | `CLASS`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST`, `THIRD_PARTY` |
| Java | `CLASS`, `METHOD`, `INTERFACE`, `ENUM`, `ROUTE`, `FILE`, `TEST`, `THIRD_PARTY` |
| Go | `STRUCT`, `INTERFACE`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST`, `THIRD_PARTY` |
| Rust | `ENUM`, `STRUCT`, `TRAIT`, `IMPL_BLOCK`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST`, `THIRD_PARTY` |

**Edge types (the connections the graph draws):**
`CALLS`, `IMPORTS`, `READS_FROM`, `WRITES_TO`, `PROP_PASS`, `EMITS`, `LISTENS`, `WRAPPED_BY`, `GUARDS`, `HANDLES`, `TESTS`, `USES`, `NEXTJS_API_CALL`, `NAVIGATES_TO`, `IMPLEMENTS` (class → interface / trait / ABC), `EXTENDS` (class → base class).

`EXPORTS` and `THROWS` + node types `MODULE`/`PACKAGE` are **reserved** for future languages.

**Router awareness — routes are real graph nodes:**
Next.js (app & pages), React Router / TanStack Router / wouter, Express / Fastify / Hono / Koa, Django URLconf / DRF, Flask blueprints, `@RestController` (Spring), Gin / Echo / chi / HTTP handlers, axum / actix / rocket.

**Every node carries:** importance score + functional summary + technical summary + security assessment (when summarized).

---

## Benchmarks

*Tested across real-world tasks — architecture understanding, feature implementation, and bug finding — comparing the same model (DeepSeek V4 Flash, GLM 5.2, Kimi K2.6, Qwen 3.6) with and without DevLens.*

### Architecture understanding (full DevLens MCP)

<div align="center">
<img src="assets/01_arch_metrics.png" alt="Architecture benchmark — cost, tokens, steps comparison" width="90%" />
</div>

| Metric | Without DevLens | With DevLens | Improvement |
|--------|:--------------:|:------------:|:-----------:|
| Avg cost per query | $0.163 | **$0.075** | **54% cheaper** |
| Avg input tokens | 88,980 | **35,035** | **61% less** |
| Avg output tokens | 9,549 | **3,233** | **66% less** |
| Avg tool steps | 14.3 | **7.8** | **45% faster** |
| Structured output | 50% | **100%** | **2× more reliable** |
| Architectural debt found | 0% | **50%** | **Now discoverable** |

> Even the strongest tested model was **81% cheaper** ($0.0035 vs $0.0185) and used **83% fewer input tokens** with DevLens.

---

## Who is this for

- **Developers & teams** — onboard devs in hours not weeks, review PRs with impact context, catch circular deps and god-files, keep living documentation.
- **Engineering leaders** — bird's-eye architecture view, spot debt before it becomes a crisis, understand work across repos.
- **AI-augmented developers** — stop letting your agent burn tokens re-reading files; it queries the graph instead.

---

## How DevLens compares

The code-graph space has three notable open-source players. They share a goal — replace re-reading files with a precomputed graph — but differ in depth:

| Dimension | **DevLens** | **Graphify** | **GitNexus** |
| :-- | :-- | :-- | :-- |
| Parsing | **Native semantic parsers** (TS compiler, Python `ast`, `go/types`, JavaParser, `syn`) — type-resolved | tree-sitter (syntactic) | tree-sitter (syntactic, native bindings) |
| Edge quality | Type-checked `IMPLEMENTS`/`EXTENDS`, framework **routes** (Next.js/Django/Spring/Gin/axum…), **ORM data edges** (`READS_FROM`/`WRITES_TO`) | `EXTRACTED`/`INFERRED`/`AMBIGUOUS` tags | call chains, clusters, processes, `route_map` |
| Per-node AI summaries | ✅ Technical + business + **security** with severity | ❌ (LLM used for docs/concepts) | ❌ (embeddings for semantic query) |
| Security analysis | ✅ Per-node severity + blast-radius reach | ❌ | Partial (opt-in PDG/taint) |
| Agent integration | CLI + **21-tool MCP** + `/devlens` skill + Web UI | CLI + local skill | CLI + 17-tool MCP + skills + hooks (`AGENTS.md`) |
| Language coverage | TS/JS, Python, Java, Go, Rust | 12 code families + docs/images | Many (tree-sitter incl. Dart/Kotlin/Swift…) |
| License | **AGPL-3.0 — free, including commercial use** | Apache-2.0 | PolyForm Noncommercial (free non-commercial only) |
| Multi-user cloud | In development | No | Enterprise SaaS (paid) |

**In one line:** Graphify is great at compressing large mixed corpora for agents; GitNexus is built around agent-context tooling with embeddings and hooks; **DevLens is the semantic-depth option** — real type resolution, framework-aware routes and data edges, per-node AI summaries with security posture, and AGPL licensing you can use commercially. (Feature comparison from public sources, Aug 2026.)

---

## Repository layout

```
devlensOSS/
├── src/
│   ├── cli/                  # `devlens` CLI (commander program + commands)
│   ├── core/                 # Shared query core (CLI + MCP — never drift)
│   ├── mcp/                  # MCP server (stdio + HTTP) — 21 tools
│   └── server/               # HTTP API for the Web UI
├── frontend/                 # Next.js graph visualizer (Cytoscape)
├── plugins/devlens/          # Agent Skill source (Claude plugin)
├── packages/skill-installer/ # @devlensio/skill — the npx installer
├── bin/                      # Platform launcher
├── npm/<platform>/           # 5 prebuilt binary packages (darwin/linux/windows × arm64)
├── scripts/                  # Release tooling
└── server.json               # MCP registry manifest
```

The analysis engine (“native parsers + graph build”) ships as the separate [`devlensio`](https://www.npmjs.com/package/devlensio) package.

---

## DevLens Cloud

A hosted version is in development:

- **Shareable graphs** your whole team can access
- **Cross-repo navigation** — understand your entire org
- **Graphical context for AI agents** — smarter code review and analysis
- **No local setup**

**[Join the waitlist →](https://devlens.io)**

---

## License

AGPL-3.0. Part of the [`devlensio`](https://github.com/devlensio) family of tools.