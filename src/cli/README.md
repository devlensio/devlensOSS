# `@devlensio/cli` — The DevLens CLI

[![npm](https://img.shields.io/npm/v/@devlensio/cli?color=cb3837&logo=npm)](https://www.npmjs.com/package/@devlensio/cli)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-f9f1e1?logo=bun)](https://bun.sh)

The command-line interface for [DevLens](https://github.com/devlensio/devlensOSS) — a codebase visualizer that turns any TypeScript, JavaScript, Python, Go, Rust, or Java repo into a queryable graph with functional summaries, technical summaries, and security analysis on every node.

---

## Install

```bash
npm install -g @devlensio/cli
```

**No Node.js?** Use the standalone binary (one command, no dependencies):

```bash
curl -fsSL https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.ps1 | iex
```

The compiled binary embeds the Go, Rust, and Java extractors plus the pure-Python module, so all six languages work out of the box. The only runtime requirements on the user's machine are `git` and — for Java — a JVM 17+, and for Python — a `python3` (3.11+) on `PATH`.

---

## Quick Start

```bash
# 1. Inspect a repo (fast — language, manifest, deps; no analysis yet)
devlens detect .

# 2. Configure your LLM provider (only needed for AI summaries)
devlens init

# 3. Analyze a repo
cd your-project
devlens analyze . --summarize

# 3. Explore
devlens overview
devlens top-nodes
devlens find-nodes -t COMPONENT
```

---

## Command reference

### Analyze & set up

| Command | What it does |
|---------|--------------|
| `devlens detect [path] [--deps]` | Inspect a repo **before** analyzing — language, manifest, dependency count, source files, git state |
| `devlens analyze [path] [--summarize] [--force-summarize]` | Build the graph (add `--summarize` to also generate summaries) |
| `devlens summarize [target] [--force-summarize] [--model <m>] [--provider <p>]` | (Re)generate technical/business/security summaries (`target` = repo path or graph id) |
| `devlens init` | First-time setup — configure the LLM provider interactively |
| `devlens doctor` | Environment health check — git, storage, LLM provider + API key, and **all extractor runtimes** (go/rust/java/python) |
| `devlens status` | Which repos are analyzed, their language + summary coverage |
| `devlens config …` | Show / update LLM provider config (see [Configuration](#configuration)) |
| `devlens repos` | List analyzed repositories |
| `devlens graphs list` / `devlens graphs delete <graphId>` | Manage stored graphs |

### Explore & understand

| Command | What it does |
|---------|--------------|
| `devlens overview` | Big picture — language, framework, stats, central nodes |
| `devlens top-nodes [-l <n>]` | Highest-scoring (most central) nodes |
| `devlens find-nodes [name] [-t <type…>] [-f <file>] [-d <dir>] [--min-score <n>] [--severity <sev>] [-l <n>]` | Search / filter nodes — by name, type, file, folder, score, severity |
| `devlens nodes-in-path <path> [-t <type…>]` | All nodes in a file or folder |
| `devlens get-node <nodeId>` | Full detail for one node — summaries, callers, callees |
| `devlens get-summaries <ids…>` | Batch-read summaries for multiple nodes |
| `devlens node-code <nodeId>` | Raw source for a node (EXPENSIVE — prefer `get-node`) |

### Impact & quality

| Command | What it does |
|---------|--------------|
| `devlens blast-radius <nodeId> [-r <n>]` | Upstream dependents — what breaks if I change this? |
| `devlens khop <nodeId> [-r <n>]` | Downstream dependencies — what does this depend on? |
| `devlens subgraph <seedNodeId>` | The cohesive cluster around a seed node |
| `devlens cycles` | Cyclic dependency groups |
| `devlens diff <from> <to> [-r <n>]` | Diff two commits + blast radius of what changed |
| `devlens check-freshness` | Is the graph stale vs HEAD (dirty, behind, missing summaries)? |
| `devlens coverage` | Graph health — summarized / total / by type / model |

### Security

| Command | What it does |
|---------|--------------|
| `devlens security [--min-severity low|medium|high] [-l <n>]` | Nodes flagged with security concerns |
| `devlens security-brief [--min-severity …] [--budget <n>]` | One-call security report — findings + blast radius + fix-first ordering |

### One-call briefs (AI-driven)

| Command | What it does |
|---------|--------------|
| `devlens architecture [--budget <n>] [--max-routes <n>] [--max-modules <n>]` | Architecture brief — modules, routes, flows, health |
| `devlens review-pr <from> <to> [--radius <n>] [--budget <n>]` | PR review packet — diff + impact + tests + security delta |
| `devlens onboard-tour [--budget <n>] [--max-modules <n>] [--max-flows <n>]` | Onboarding skeleton — modules, routes, flows, glossary, gotchas |
| `devlens get-context <query> [--intent explain|architecture|impact|security] [--focus <id|path>] [--hops 1|2] [--budget <n>]` | Token-budgeted context packet — keyword-seeded retrieval + traversal + assembly |

### Integrations

| Command | What it does |
|---------|--------------|
| `devlens mcp` | Run the MCP server over stdio (for editor / MCP-client integration) |
| `devlens mcp http -p <port>` | Run the MCP server over Streamable HTTP (default port 7000) |
| `devlens serve -p <port>` | Start the backend API (default port 3000) |

---

## Using DevLens with each language

DevLens auto-detects the language from your repo's manifests and framework files — you never pass a `--language` flag. The node types you query for depend on the language and framework detected.

| Language | Detected from | Frameworks understood | Node types in the graph |
| :-- | :-- | :-- | :-- |
| **TypeScript / JavaScript** | `package.json`, `tsconfig.json` | React, Next.js (app & pages), Express/Hono/Fastify, React Router, TanStack Router | `COMPONENT`, `HOOK`, `STATE_STORE`, `UTILITY`, `CLASS`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST`, `STORY` |
| **Python** | `pyproject.toml`, `requirements.txt`, `setup.py` | FastAPI, Flask, Django (+DRF), SQLAlchemy / Django ORM, Celery, Pydantic | `CLASS`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST` |
| **Java** | `pom.xml`, `build.gradle` | Spring Boot (controllers, JPA, Spring Data repositories) | `CLASS`, `METHOD`, `INTERFACE`, `ENUM`, `ROUTE`, `FILE`, `TEST` |
| **Go** | `go.mod` | net/http, Gin, Echo, chi, Fiber, GORM, database/sql | `STRUCT`, `INTERFACE`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST` |
| **Rust** | `Cargo.toml` | axum, actix-web, rocket, utoipa, Diesel | `ENUM`, `STRUCT`, `TRAIT`, `IMPL_BLOCK`, `METHOD`, `FUNCTION`, `ROUTE`, `FILE`, `TEST` |

All languages additionally produce a `THIRD_PARTY` node for external imports.

### Examples by language

```bash
# TypeScript / React
devlens detect .                                   # -> language: typescript, framework: next
devlens find-nodes -t COMPONENT                    # every React component
devlens find-nodes -t HOOK                         # every hook
devlens nodes-in-path src/components/

# Python / FastAPI
devlens detect .                                   # -> language: python, framework: fastapi
devlens find-nodes -t ROUTE                        # every @app.get/post route
devlens find-nodes -t CLASS --min-score 7          # high-importance classes

# Java / Spring Boot
devlens find-nodes -t ROUTE                        # every @RestController mapping
devlens find-nodes -t INTERFACE                    # interfaces (Java only)

# Go
devlens find-nodes -t STRUCT                       # structs (Go only)
devlens find-nodes -t INTERFACE                    # Go interfaces
devlens find-nodes -t FUNCTION

# Rust
devlens find-nodes -t TRAIT                        # traits (Rust only)
devlens find-nodes -t IMPL_BLOCK                   # impl blocks (Rust only)
devlens find-nodes -t STRUCT
```

`ROUTE`, `CALLS`, `IMPLEMENTS`, `READS_FROM`, and `WRITES_TO` edges are resolved per-language, so `architecture`, `overview`, and `blast-radius` are meaningful across all six languages.

---

## When to use each command

### New to a codebase (onboarding)

| Command | When | Example |
|---------|------|---------|
| `devlens detect .` | Before analyzing — confirm language + framework cheaply | `devlens detect ./my-app` |
| `devlens analyze . --summarize` | First time exploring a repo — build the graph + AI summaries | `devlens analyze ./my-app --summarize` |
| `devlens overview` | Start here — the big picture | `devlens overview` |
| `devlens top-nodes` | Find the most important code | `devlens top-nodes --limit 10 --json` |
| `devlens nodes-in-path <path>` | Understand everything in a folder at once | `devlens nodes-in-path src/components/` |
| `devlens onboard-tour` | One-call onboarding skeleton | `devlens onboard-tour --max-modules 8` |

### Finding things

| Command | When | Example |
|---------|------|---------|
| `devlens find-nodes <name>` | You know the name but not where it lives | `devlens find-nodes Button` |
| `devlens find-nodes -t ROUTE` | Find every route in the app | `devlens find-nodes -t ROUTE` |
| `devlens find-nodes -f <file>` | See all nodes in a specific file | `devlens find-nodes -f src/app/layout.js` |
| `devlens find-nodes --min-score 7` | Only high-importance nodes | `devlens find-nodes --min-score 7` |
| `devlens find-nodes --severity high` | Nodes with high-severity security flags | `devlens find-nodes --severity high` |
| `devlens get-node <nodeId>` | Full detail on one node | `devlens get-node "src/auth/login.ts::login"` |
| `devlens get-summaries <ids...>` | Batch-read summaries | `devlens get-summaries id1 id2 id3` |
| `devlens node-code <nodeId>` | Raw source (expensive — prefer get-node) | `devlens node-code "src/auth/login.ts::login"` |

### Understanding impact before changing

| Command | When | Example |
|---------|------|---------|
| `devlens blast-radius <nodeId>` | **Before refactoring** — what breaks if I change this? | `devlens blast-radius "src/auth/login.ts::login"` |
| `devlens blast-radius <nodeId> -r 3` | Widen the blast radius | `devlens blast-radius "src/store/user.js::useUserStore" -r 3` |
| `devlens khop <nodeId>` | What does this depend on? | `devlens khop "src/api/anime.js::getAnime"` |
| `devlens subgraph <nodeId>` | The cohesive cluster around a node | `devlens subgraph "src/components/Navbar.jsx"` |
| `devlens cycles` | Circular dependencies before they bite | `devlens cycles` |
| `devlens diff <from> <to>` | Compare two analyzed commits | `devlens diff abc123 def456` |
| `devlens check-freshness` | Is the graph stale vs HEAD? | `devlens check-freshness` |
| `devlens get-context <query>` | Token-budgeted context for an agent | `devlens get-context "how does auth work"` |

### Security reviews

| Command | When | Example |
|---------|------|---------|
| `devlens security` | All flagged security issues | `devlens security` |
| `devlens security --min-severity high` | Only critical + high | `devlens security --min-severity high` |
| `devlens security-brief` | One-call ranked report with fix ordering | `devlens security-brief --min-severity medium` |
| `devlens security --json` | Machine-readable for dashboards | `devlens security --json` |

### Setup & maintenance

| Command | When | Example |
|---------|------|---------|
| `devlens init` | First run — configure the LLM provider | `devlens init` |
| `devlens doctor` | Something broken? Check environment health | `devlens doctor` |
| `devlens config` | Show configuration with all saved providers | `devlens config` |
| `devlens config set` | Interactive provider setup | `devlens config set` |
| `devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash` | Non-interactive scripting | `devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key sk-...` |
| `devlens config --active openai:deepseek` | Switch active provider | `devlens config --active openai:deepseek` |
| `devlens config --remove anthropic:anthropic` | Remove a saved provider | `devlens config --remove anthropic:anthropic` |
| `devlens status` | Show analyzed + summarized graphs | `devlens status` |
| `devlens repos` | List analyzed repositories | `devlens repos` |
| `devlens graphs list` | List stored graphs | `devlens graphs list` |
| `devlens graphs delete <graphId>` | Delete a graph | `devlens graphs delete abc-123` |

---

## Real-world workflows

### Onboarding a new developer

```bash
devlens detect .                                   # confirm language + framework
devlens init                                       # configure the LLM provider
devlens analyze . --summarize                      # build graph + summaries
devlens overview                                   # big picture
devlens top-nodes --limit 10                       # most important code
devlens nodes-in-path src/auth/                    # understand a module
devlens get-summaries "src/auth/login.ts::login" "src/auth/register.ts::register"
devlens cycles                                     # architectural debt
```

### Before a risky refactor

```bash
devlens blast-radius "src/store/user.ts::useUserStore"   # what depends on it
devlens khop "src/store/user.ts::useUserStore"           # what it depends on
devlens get-node "src/store/user.ts::useUserStore"       # full node detail
devlens security --min-severity medium                   # security in the area
```

### CI pipeline integration

```bash
devlens status --json                          # graph freshness
devlens check-freshness --json                 # stale vs HEAD?
devlens cycles --json                          # new circular deps
devlens security --min-severity high --json    # critical security issues
devlens coverage --json                        # summary coverage
```

### Exploring a large codebase

```bash
devlens overview                                # start broad
devlens nodes-in-path src/components/player/    # narrow to a feature
devlens get-node "src/components/player/VideoPlayer.tsx::VideoPlayer"
devlens blast-radius "src/components/player/VideoPlayer.tsx::VideoPlayer" -r 3
devlens security --json > security-audit.json   # export for reporting
```

---

## Configuration

### Provider model: protocol + brand identity

DevLens splits provider configuration into two fields:

- **`--provider`** — the wire protocol (`openai` or `anthropic`). Routes to the correct SDK.
- **`--provider-name`** — the brand identity (e.g. `deepseek`, `my-custom-gateway`). Picks base URL + key rules from the built-in catalog.

Models are **never hardcoded** — they are fetched live from each provider's `/models` endpoint. A custom model can always be typed manually as a fallback.

### Supported providers

All providers are sourced from the built-in catalog — no hardcoded lists in the CLI. Models are discovered at runtime:

| Provider | Protocol | Notes |
| :-- | :-- | :-- |
| OpenAI | openai | `devlens config --provider openai --provider-name openai --model gpt-4o-mini --api-key <key>` |
| Anthropic | anthropic | `devlens config --provider anthropic --provider-name anthropic --model claude-haiku-4-5 --api-key <key>` |
| DeepSeek | openai | `devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key <key>` |
| OpenRouter | openai | `devlens config --provider openai --provider-name openrouter --model deepseek-v4-flash --api-key <key>` |
| Gemini | openai | `devlens config --provider openai --provider-name gemini --model gemini-2.0-flash --api-key <key>` |

Custom endpoints (any OpenAI- or Anthropic-compatible API) can be added through the interactive flow or by editing `~/.devlens/providers.json`.

### Interactive config flow

```bash
devlens config set                          # interactive picker
devlens config set --provider-name deepseek # pre-filled; cursor lands on matching provider
```

The interactive flow: pick a provider (or "Custom…") → enter API key → optionally override base URL → **fetch models live** and search/pick one → set batch size → save.

### Non-interactive (scripting) path

```bash
devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key sk-...
```

When `--set` is NOT used, flags write directly without prompts. `--model` is required in this mode.

### Multi-provider management

```bash
devlens config                          # view all providers (active marked with ★)
devlens config --active openai:deepseek # switch active provider
devlens config --remove anthropic:anthropic # remove (refused if active)
```

### Custom providers

```bash
devlens config set                                     # → select "Custom…"
devlens config --provider openai --provider-name my-gateway --model my-model --base-url http://localhost:8080/v1 --api-key sk-...
```

---

## Global options

Available on every command:

| Flag | What it does |
|:--|:--|
| `--json` | Machine-readable JSON output (for scripts, CI) |
| `-v, --verbose` | Diagnostic output (timestamps, traces, progress counts) |
| `--quiet` | Suppress all non-error output (only errors + final result) |
| `-h, --help` | Show help |

Query commands additionally accept:

| Flag | What it does |
|:--|:--|
| `-g, --graph <id>` | Target a specific graph (default: graph for the current directory) |
| `-c, --commit <hash>` | Target a specific commit in the graph |

Verbosity levels:
- **Default**: clean human output — banner, colored step headers, spinners during long ops.
- **`-v` / `--verbose`**: adds timestamps, request/response shapes, per-node token usage.
- **`--quiet`**: only errors and the final result.
- **`--json`**: structured JSON on stdout (stderr for diagnostics); ANSI colors dropped when piped.

---

## Architecture

```
src/cli/
├── index.ts            # Entrypoint — registers all commands, shows banner
├── preload.ts          # First import — materialises embedded extractors, sets DEVLENS_EXTRACTORS_DIR
├── options.ts          # Global flags (--json, --verbose, --quiet)
├── output.ts           # Central output layer — TTY-aware, spinners, colors, step()
├── graphResolve.ts     # Resolves current directory → graph ID
├── jobRunner.ts        # Progress streaming for long jobs
├── extractors.ts       # Materialises embedded go/rust/java/python extractors; PYTHONPATH wiring
├── extractorAssets.ts  # Resolves embedded artifacts from ./embedded/active.js
├── embedded/           # Per-platform go/rust wrappers + java jar + python zip (bun-embedded)
└── commands/
    ├── analyze.ts      # analyze & summarize with spinner phases
    ├── summarize.ts    # summarize (repo path or graph id)
    ├── detect.ts       # fast language/framework/manifest/deps detection
    ├── config.ts       # Config management — interactive picker, multi-provider, catalog
    ├── init.ts         # First-time setup
    ├── doctor.ts       # Health check — git, storage, provider, extractor runtimes
    ├── status.ts       # Analyzed / summarized graphs
    ├── repos.ts        # repos
    ├── graphs.ts       # graphs list|delete
    ├── serve.ts        # backend API server
    ├── mcp.ts          # mcp stdio|http
    └── query.ts        # all read/query commands (overview, find-nodes, …, get-context)
```

CLI and MCP share `src/core/` — they never drift.

---

## Development

```bash
# Run any command from source (no build needed)
bun src/cli/index.ts <command> [args]

# Build native binaries (all 5 targets)
bun run build:binaries
```

---

## Related packages

| Package | What it is |
| :-- | :-- |
| [`devlensio`](https://www.npmjs.com/package/devlensio) | The core analysis engine (AST → graph → scores → summaries) |
| [`@devlensio/skill`](https://www.npmjs.com/package/@devlensio/skill) | Agent Skill — `/devlens` commands for Claude Code, Cursor, Kilo |
| `@devlensio/cli-<platform>` | Platform-specific binaries (darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64) |

---

## License

AGPL-3.0. Part of the [DevLens](https://github.com/devlensio/devlensOSS) project.
