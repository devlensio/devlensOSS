# DevLens plugin — the `/devlens` Agent Skill

This is the Claude Code plugin that ships the **DevLens Agent Skill**: one `/devlens` command (with subcommands) that teaches an AI agent how to query a precomputed code graph (nodes, typed edges, technical/business/security summaries) for JavaScript, TypeScript, React, Next.js, and Node.js codebases — instead of grepping and reading whole files.

The skill drives the **bundled DevLens MCP server** (registered automatically by this plugin) and orchestrates its tools — discovering real modules from graph clusters, tracing typed edges, and reading precomputed summaries.

---

## Install

**Claude Code (plugin):**

```text
/plugin marketplace add devlensio/devlensOSS
/plugin install devlens@devlensio
```

Commands are namespaced: `/devlens:devlens <subcommand>`.

**Any agent (npx installer — Claude Code, Cursor, Kilo, opencode, pi):**

```bash
npx @devlensio/skill install
```

Clean commands: `/devlens <subcommand>`. See [../../packages/skill-installer/README.md](../../packages/skill-installer/README.md).

> The DevLens MCP server ships inside `@devlensio/cli` and is launched on demand via `npx -y @devlensio/cli mcp` — the plugin registers it for you, so no separate global install is required. (Generating summaries still uses an LLM provider you configure once via the CLI: `devlens init`.)

---

## Subcommands

| Command | What it does | Example |
| :-- | :-- | :-- |
| `/devlens` | List subcommands + point at the full tool reference | `/devlens` → Shows available commands |
| `/devlens init` | Bootstrap: ensure the MCP is connected, configure a provider, analyze the repo | `/devlens init` → Sets up DevLens for this repo |
| `/devlens architecture` | Comprehensive system brief — stack, modules, all routes/stores/hooks, patterns, edges, security posture, risks | `/devlens architecture` → "Next.js 15, 3 modules (auth/anime/user), 12 routes, 4 stores" |
| `/devlens diagram [architecture\|cluster\|flow\|deps]` | Mermaid diagram (node-type shapes, typed edges, severity badges) — saved + optionally rendered | `/devlens diagram flow login` → Mermaid sequence diagram tracing login → auth handler → API → store |
| `/devlens summary [technical\|functional\|security] <target>` | On-demand summaries for a node/file/folder | `/devlens summary security src/api/` → Security assessment for all API handlers |
| `/devlens security-analysis [low\|medium\|high]` | Prioritized security findings with exploit notes + reach | `/devlens security-analysis high` → "2 issues: SQL injection (reach: 14 nodes), missing CSRF" |
| `/devlens explain [path]` | Quick in-chat onboarding walkthrough + a ranked "read these first" learning path | `/devlens explain src/auth/` → Walks through login flow, session management, role guards |
| `/devlens onboard` | Generate a saved `ONBOARDING.md` — setup/run, architecture, key flows, reading path | `/devlens onboard` → Writes ONBOARDING.md to repo root |
| `/devlens tech-debt` | Circular dependencies, coupling hotspots, god-files | `/devlens tech-debt` → "3 cycles, Navbar has 28 dependents" |
| `/devlens impact <symbol\|file>` | Blast radius (what breaks) + k-hop (what it needs) | `/devlens impact checkAuth` → "8 dependents across auth guard, middleware, protected routes" |
| `/devlens find <name\|path>` | Locate where something lives (compact node refs) | `/devlens find Button` → "3 results in src/ui/Button.tsx, src/ui/IconButton.tsx, tests/" |
| `/devlens changes [range]` | Explain recent work / a commit range / a merge conflict, by functionality | `/devlens changes yesterday` → "3 files, added analytics tracking, fixed rate-limiting bug" |
| `/devlens guard [target]` | Warn before editing high-value / high-blast-radius nodes | `/devlens guard` → "⚠️ authMiddleware (score 9.1) has 22 dependents" |

---

## Structure

```
plugins/devlens/
├── .claude-plugin/plugin.json    # plugin manifest (name, version, license, mcpServers)
└── skills/devlens/
    ├── SKILL.md                  # dispatcher: MCP check + freshness guard + routing
    ├── reference.md              # MCP tool catalog + "how to use the graph well" + CLI map
    └── commands/*.md             # one traversal recipe per subcommand
```

The plugin's `.claude-plugin/plugin.json` declares the DevLens MCP server under `mcpServers`, so installing the plugin auto-registers it. Its tools surface to the agent as `mcp__plugin_devlens_devlens__<tool>`.

`skills/devlens/` is the **single source of truth** — the `@devlensio/skill` npx installer bundles a copy of it at publish time. The plugin's `version` (in `plugin.json`) gates `/plugin update`; bump it via `node scripts/set-skill-version.mjs <ver>` from the repo root.

---

## How a skill works

When invoked, `SKILL.md` loads into the agent's context. It:

1. Confirms the **DevLens MCP** is connected
2. Runs a **graph-freshness guard** (analyze if needed; never summarize without permission)
3. Routes the subcommand to its recipe in `commands/`, which the agent reads and executes by calling the DevLens MCP tools

Each recipe teaches a **traversal methodology** — orient cheaply, discover modules from graph clusters (`get_subgraph`), draw real edges (`get_blast_radius`/`get_khop`), label from summaries — so results are comprehensive *and* synthesized, not brute-force node dumps.