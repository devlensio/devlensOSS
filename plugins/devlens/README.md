# DevLens plugin — the `/devlens` Agent Skill

This is the Claude Code plugin that ships the **DevLens Agent Skill**: one `/devlens` command (with subcommands) that teaches an AI agent how to query a precomputed code graph (nodes, typed edges, technical/business/security summaries) instead of grepping and reading whole files. The skill drives the **bundled DevLens MCP server** (registered automatically by this plugin) and orchestrates its tools — discovering real modules from graph clusters, tracing typed edges, and reading precomputed summaries.

## Install

**Claude Code (plugin):**
```text
/plugin marketplace add devlensio/devlensOSS
/plugin install devlens@devlensio
```
→ commands are namespaced: `/devlens:devlens <subcommand>`.

**Any agent (npx installer — Claude Code, Cursor, Kilo, opencode, pi):**
```bash
npx @devlensio/skill install
```
→ clean commands: `/devlens <subcommand>`. See [../../packages/skill-installer/README.md](../../packages/skill-installer/README.md).

> The DevLens MCP server ships inside `@devlensio/cli` and is launched on demand via `npx -y @devlensio/cli mcp` — the plugin registers it for you, so no separate global install is required. (Generating summaries still uses an LLM provider you configure once via the CLI: `devlens init`.)

## Subcommands

| Command | What it does |
| :-- | :-- |
| `/devlens` | List subcommands + point at the full tool reference. |
| `/devlens init` | Bootstrap: ensure the MCP is connected, configure a provider, analyze the repo. |
| `/devlens architecture` | Comprehensive system brief — stack, modules, all routes/stores/hooks, patterns, edges, security posture, risks. |
| `/devlens diagram [architecture\|cluster\|flow\|deps]` | Mermaid diagram (node-type shapes, typed edges, severity badges) — saved + optionally rendered. |
| `/devlens summary [technical\|functional\|security] <target>` | On-demand summaries for a node/file/folder. |
| `/devlens security-analysis [low\|medium\|high]` | Prioritized security findings with exploit notes + reach. |
| `/devlens explain [path]` | Quick in-chat onboarding walkthrough + a ranked "read these first" learning path. |
| `/devlens onboard` | Generate a saved `ONBOARDING.md` — setup/run, architecture, key flows, reading path, glossary, "where to change things". |
| `/devlens tech-debt` | Circular dependencies, coupling hotspots, god-files. |
| `/devlens impact <symbol\|file>` | Blast radius (what breaks) + k-hop (what it needs). |
| `/devlens find <name\|path>` | Locate where something lives (compact node refs). |
| `/devlens changes [range]` | Explain recent work / a commit range / a merge conflict, by functionality. |
| `/devlens guard [target]` | Warn before editing high-value / high-blast-radius nodes (defaults to current uncommitted changes). |

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

## How a skill works

When invoked, `SKILL.md` loads into the agent's context. It confirms the **DevLens MCP** is connected, runs a **graph-freshness guard** (analyze if needed; never summarize without permission), then routes the subcommand to its recipe in `commands/`, which the agent reads and executes by calling the DevLens MCP tools. Each recipe teaches a **traversal methodology** — orient cheaply, discover modules from graph clusters (`get_subgraph`), draw real edges (`get_blast_radius`/`get_khop`), label from summaries — so results are comprehensive *and* synthesized, not brute-force node dumps.