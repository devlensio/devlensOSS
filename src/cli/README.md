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
| `devlens config` | View or update `~/.devlens/config.json` | `devlens config --set` |
| `devlens config --provider openrouter` | Switch LLM provider | `devlens config --provider openrouter --model mimo-v2.5 --api-key sk-...` |
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

Supported LLM providers for AI summarization:

| Provider | Recommended model | Setup |
| :-- | :-- | :-- |
| Ollama (local) | `qwen2.5-coder:7b` | `devlens config --provider ollama --model qwen2.5-coder:7b --base-url http://localhost:11434` |
| OpenAI | `gpt-4o-mini` | `devlens config --provider openai --model gpt-4o-mini --api-key <key>` |
| Anthropic | `claude-haiku-4-5` | `devlens config --provider anthropic --model claude-haiku-4-5 --api-key <key>` |
| OpenRouter | `mimo-v2.5` | `devlens config --provider openrouter --model mimo-v2.5 --api-key <key>` |
| Gemini | `gemini-2.0-flash` | `devlens config --provider gemini --model gemini-2.0-flash --api-key <key>` |

---

## Global options

Available on every command:

| Flag | What it does |
|:--|:--|
| `--json` | Machine-readable JSON output (for scripts, CI) |
| `-v, --verbose` | Diagnostic output |
| `-g <graphId>` | Target a specific graph (default: current directory) |
| `-c <commit>` | Target a specific commit in the graph |
| `-h, --help` | Show help |

---

## Architecture

```
src/cli/
├── index.ts           # Entrypoint — registers all commands
├── options.ts         # Global flags (--json, --verbose)
├── output.ts          # stdout vs stderr discipline
├── graphResolve.ts    # Resolves current directory → graph ID
├── jobRunner.ts       # Progress streaming for long jobs
└── commands/
    ├── analyze.ts     # analyze & summarize
    ├── config.ts      # config management
    ├── init.ts        # first-time setup
    ├── doctor.ts      # health check
    ├── status.ts      # status
    ├── repos.ts       # repos
    ├── graphs.ts      # graphs list|delete
    ├── serve.ts       # backend API server
    ├── mcp.ts         # MCP server
    └── query.ts       # all query commands
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