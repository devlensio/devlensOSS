# `@devlensio/cli` — The DevLens CLI

[![npm](https://img.shields.io/npm/v/@devlensio/cli?color=cb3837&logo=npm)](https://www.npmjs.com/package/@devlensio/cli)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-f9f1e1?logo=bun)](https://bun.sh)

The command-line interface for [DevLens](https://github.com/devlensio/devlensOSS) — a codebase visualizer that turns any TypeScript / JavaScript / React / Next.js / Node.js repo into a queryable graph with functional summaries, technical summaries, and security analysis on every node.

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

---

## Quick Start

```bash
# 1. Set up your LLM provider
devlens init

# 2. Analyze a repo
cd your-project
devlens analyze . --summarize

# 3. Explore
devlens overview
devlens top-nodes
devlens find-nodes -t COMPONENT
```

---

## When to use each command

### New to a codebase (onboarding)

| Command | When | Example |
|---------|------|---------|
| `devlens analyze . --summarize` | First time exploring a repo — build the graph + AI summaries | `devlens analyze ./my-app --summarize` |
| `devlens overview` | Start here — see the big picture (framework, stats, central nodes) | `devlens overview` |
| `devlens top-nodes` | Find the most important code (highest architectural score) | `devlens top-nodes --limit 10 --json` |
| `devlens nodes-in-path <path>` | Understand everything in a folder at once | `devlens nodes-in-path src/components/` |

### Finding things

| Command | When | Example |
|---------|------|---------|
| `devlens find-nodes <name>` | You know the name but not where it lives | `devlens find-nodes Button` |
| `devlens find-nodes -t ROUTE` | Find every route in the app | `devlens find-nodes -t ROUTE` |
| `devlens find-nodes -f <file>` | See all nodes in a specific file | `devlens find-nodes -f src/app/layout.js` |
| `devlens find-nodes --min-score 7` | Only high-importance nodes | `devlens find-nodes --min-score 7` |
| `devlens find-nodes --severity high` | Find nodes with high-severity security flags | `devlens find-nodes --severity high` |
| `devlens get-node <nodeId>` | Full detail on one node (summaries, callers, callees) | `devlens get-node "src/auth/login.ts::login"` |
| `devlens get-summaries <ids...>` | Batch-read summaries for multiple nodes | `devlens get-summaries id1 id2 id3` |
| `devlens node-code <nodeId>` | Raw source code for a node (expensive — prefer get-node) | `devlens node-code "src/auth/login.ts::login"` |

### Understanding impact before changing

| Command | When | Example |
|---------|------|---------|
| `devlens blast-radius <nodeId>` | **Before refactoring** — what breaks if I change this? | `devlens blast-radius "src/auth/login.ts::login"` |
| `devlens blast-radius <nodeId> -r 3` | Widen the blast radius search | `devlens blast-radius "src/store/user.js::useUserStore" -r 3` |
| `devlens khop <nodeId>` | What does this depend on? (downstream deps) | `devlens khop "src/api/anime.js::getAnime"` |
| `devlens subgraph <nodeId>` | See the cohesive cluster around a node | `devlens subgraph "src/components/Navbar.jsx"` |
| `devlens cycles` | Find circular dependencies before they cause issues | `devlens cycles` |
| `devlens diff <from> <to>` | Compare two analyzed commits — what changed + impact | `devlens diff abc123 def456` |

### Security reviews

| Command | When | Example |
|---------|------|---------|
| `devlens security` | View all flagged security issues | `devlens security` |
| `devlens security --min-severity high` | Only critical + high severity | `devlens security --min-severity high` |
| `devlens security --json` | Machine-readable output for dashboards | `devlens security --json` |

### Integrations

| Command | When | Example |
|---------|------|---------|
| `devlens mcp` | Start the MCP server (for AI agent/editor integration) | `devlens mcp` |
| `devlens mcp http -p 7000` | Start MCP over HTTP | `devlens mcp http -p 7000` |
| `devlens serve` | Start the backend API (for the Web UI) | `devlens serve -p 3001` |

### Setup & maintenance

| Command | When | Example |
|---------|------|---------|
| `devlens init` | First run — configure LLM provider interactively | `devlens init` |
| `devlens doctor` | Something broken? Check environment health | `devlens doctor` |
| `devlens config` | Show configuration with all saved providers | `devlens config` |
| `devlens config set` | Interactive provider setup — pick from catalog, fetch live models | `devlens config set` |
| `devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash` | Non-interactive scripting (upserts into registry, marks active) | `devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key sk-...` |
| `devlens config --active openai:deepseek` | Switch active provider without re-entering credentials | `devlens config --active openai:deepseek` |
| `devlens config --remove anthropic:anthropic` | Remove a saved provider (refused if active — switch first) | `devlens config --remove anthropic:anthropic` |
| `devlens status` | Show analyzed + summarized graphs | `devlens status` |
| `devlens repos` | List all analyzed repositories | `devlens repos` |
| `devlens graphs list` | List stored graphs | `devlens graphs list` |
| `devlens graphs delete <graphId>` | Delete a specific graph | `devlens graphs delete abc-123` |

---

## Real-world workflows

### Onboarding a new developer

```bash
# 1. Configure an LLM provider for summaries
devlens init

# 2. Analyze the project with AI summaries
devlens analyze . --summarize

# 3. See the big picture
devlens overview

# 4. Find the most important code to learn first
devlens top-nodes --limit 10

# 5. Understand the auth module
devlens nodes-in-path src/auth/
devlens get-summaries "src/auth/login.ts::login" "src/auth/register.ts::register"

# 6. Check for architectural debt
devlens cycles
```

### Before a risky refactor

```bash
# 1. Find what depends on the code you're changing
devlens blast-radius "src/store/user.ts::useUserStore"

# 2. See what that code depends on
devlens khop "src/store/user.ts::useUserStore"

# 3. Get the full picture of the node
devlens get-node "src/store/user.ts::useUserStore"

# 4. Check all security concerns in the area
devlens security --min-severity medium
```

### CI pipeline integration

```bash
# Run in CI to catch regressions
devlens status --json                          # Check graph freshness
devlens cycles --json                          # Fail on new circular deps
devlens security --min-severity high --json    # Fail on critical security issues
devlens find-nodes --severity medium --json    # Log medium-severity flags

# Compare against the main branch graph
devlens diff main HEAD --json                  # What nodes changed in this PR?
```

### Exploring a large codebase

```bash
# Start broad
devlens overview

# Narrow to a feature area
devlens nodes-in-path src/components/player/
devlens find-nodes -t ROUTE | grep watch

# Drill into specific symbols
devlens get-node "src/components/player/VideoPlayer.tsx::VideoPlayer"
devlens blast-radius "src/components/player/VideoPlayer.tsx::VideoPlayer" -r 3

# Export for reporting
devlens security --json > security-audit.json
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
| Ollama (local) | openai | `devlens config --provider openai --provider-name ollama --model qwen2.5-coder:7b --base-url http://localhost:11434/v1` |
| OpenAI | openai | `devlens config --provider openai --provider-name openai --model gpt-4o-mini --api-key <key>` |
| Anthropic | anthropic | `devlens config --provider anthropic --provider-name anthropic --model claude-haiku-4-5 --api-key <key>` |
| DeepSeek | openai | `devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key <key>` |
| OpenRouter | openai | `devlens config --provider openai --provider-name openrouter --model deepseek-v4-flash --api-key <key>` |
| Gemini | openai | `devlens config --provider openai --provider-name gemini --model gemini-2.0-flash --api-key <key>` |
| Groq | openai | Uses Groq's OpenAI-compatible endpoint |
| Mistral | openai | Uses Mistral's OpenAI-compatible endpoint |
| xAI Grok | openai | Uses xAI's OpenAI-compatible endpoint |

Custom endpoints (any OpenAI- or Anthropic-compatible API) can be added through the interactive flow or by editing `~/.devlens/providers.json`.

### Interactive config flow

```bash
# Launch the interactive picker
devlens config set

# Or with pre-filled values (cursor lands on the matching provider, you still confirm)
devlens config set --provider-name deepseek
```

The interactive flow:
1. Pick a provider from the catalog (or choose "Custom…")
2. Enter API key (or leave empty to keep existing)
3. Optionally override the base URL
4. **Models are fetched live** from the provider's endpoint — search and pick one, or type a custom model
5. Set batch size
6. Config is saved and the provider becomes active

### Non-interactive (scripting) path

```bash
# Write directly — for CI, scripts, automation
devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash --api-key sk-...
```

When `--set` is NOT used, flags write directly without prompts. `--model` is required in this mode.

### Multi-provider management

You can keep multiple providers configured and switch between them:

```bash
# View all configured providers (active one marked with ★)
devlens config

# Switch active provider without re-entering credentials
devlens config --active openai:deepseek

# Remove a saved provider (refused if it's the active one)
devlens config --remove anthropic:anthropic
```

### Custom providers

Choose "Custom…" in the interactive flow (or use flags) to add any OpenAI- or Anthropic-compatible endpoint:

```bash
# Interactive
devlens config set
# → Select Custom… → enter name "my-gateway" → pick protocol → enter base URL → API key → model

# Non-interactive
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
| `-g <graphId>` | Target a specific graph (default: current directory) |
| `-c <commit>` | Target a specific commit in the graph |
| `-h, --help` | Show help |

Verbosity levels:
- **Default**: clean human output — banner, colored step headers, spinners during long ops (model fetch, summarization)
- **`-v` / `--verbose`**: adds timestamps, request/response shapes, per-node token usage
- **`--quiet`**: only errors and the final result — no spinners, no info lines
- **`--json`**: all output as structured JSON on stdout (stderr for diagnostics); ANSI colors automatically dropped when piped

---

## Architecture

```
src/cli/
├── index.ts           # Entrypoint — registers all commands, shows banner
├── options.ts         # Global flags (--json, --verbose, --quiet)
├── output.ts          # Central output layer — TTY-aware, spinners, colors, step()
├── graphResolve.ts    # Resolves current directory → graph ID
├── jobRunner.ts       # Progress streaming for long jobs
└── commands/
    ├── analyze.ts     # analyze & summarize with spinner phases
    ├── config.ts      # Config management — interactive picker, multi-provider, catalog
    ├── init.ts        # First-time setup
    ├── doctor.ts      # Health check — catalog, model fetch, multi-provider registry
    ├── status.ts      # Status
    ├── repos.ts       # repos
    ├── graphs.ts      # graphs list|delete
    ├── serve.ts       # backend API server
    ├── mcp.ts         # MCP server
    └── query.ts       # all query commands
```

CLI and MCP share `src/core/` — they never drift.

### Output layer

All styled output routes through `src/cli/output.ts`:

| Feature | Behaviour |
| :-- | :-- |
| `banner()` | Header box on startup and long commands — hidden under `--quiet` |
| `step(label, fn)` | Named phase wrapper with status icon (✓/✗) — extra detail under `-v` |
| `spinner(text)` | Animated indicator during async ops (model fetch, analysis) — suppressed in non-TTY or `--quiet` |
| `success/info/warn/error` | Colored one-liners on stderr — `info` hidden under `--quiet` |
| `emit(obj)` | Machine JSON on stdout when piped / `--json`; boxed card in TTY |
| ANSI colors | Automatically dropped when `!isTTY` — no color codes in piped output |
| TTY detection | Spinners, boxes, arrow-key pickers only activate in a TTY; non-TTY degrades gracefully |

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