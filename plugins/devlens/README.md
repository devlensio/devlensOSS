# DevLens plugin — the `/devlens` Agent Skill

This is the Claude Code plugin that ships the **DevLens Agent Skill**: one `/devlens` command (with subcommands) that teaches an AI agent how to drive the [DevLens CLI](https://www.npmjs.com/package/@devlensio/cli) — querying a precomputed code graph (nodes, typed edges, technical/business/security summaries) instead of grepping and reading whole files.

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

> Requires the CLI: `npm install -g @devlensio/cli`.

## Subcommands

| Command | What it does |
| :-- | :-- |
| `/devlens` | List subcommands + point at the full CLI reference. |
| `/devlens init` | Bootstrap: ensure the CLI, configure a provider, analyze the repo. |
| `/devlens architecture` | Comprehensive system brief — stack, modules, all routes/stores/hooks, patterns, edges, security posture, risks. |
| `/devlens diagram [architecture\|cluster\|flow\|deps]` | Mermaid diagram (node-type shapes, typed edges, severity badges) — saved + optionally rendered. |
| `/devlens summary [technical\|functional\|security] <target>` | On-demand summaries for a node/file/folder. |
| `/devlens security-analysis [low\|medium\|high]` | Prioritized security findings with exploit notes + reach. |
| `/devlens explain [path]` | Onboarding walkthrough + a ranked "read these first" learning path. |
| `/devlens tech-debt` | Circular dependencies, coupling hotspots, god-files. |
| `/devlens impact <symbol\|file>` | Blast radius (what breaks) + k-hop (what it needs). |
| `/devlens find <name\|path>` | Locate where something lives (compact node refs). |
| `/devlens changes [range]` | Explain recent work / a commit range / a merge conflict, by functionality. |
| `/devlens guard [target]` | Warn before editing high-value / high-blast-radius nodes (defaults to current uncommitted changes). |

## Structure

```
plugins/devlens/
├── .claude-plugin/plugin.json    # plugin manifest (name, version, license)
└── skills/devlens/
    ├── SKILL.md                  # dispatcher: freshness guard + token rules + routing
    ├── reference.md              # full CLI catalog + token economics
    └── commands/*.md             # one prescriptive recipe per subcommand
```

`skills/devlens/` is the **single source of truth** — the `@devlensio/skill` npx installer bundles a copy of it at publish time. The plugin's `version` (in `plugin.json`) gates `/plugin update`; bump it via `node scripts/set-skill-version.mjs <ver>` from the repo root.

## How a skill works

When invoked, `SKILL.md` loads into the agent's context. It first runs a **graph-freshness guard** (analyze if needed; never summarize without permission), then routes the subcommand to its recipe in `commands/`, which the agent reads and executes against the `devlens` CLI. Each recipe mandates full data collection and a complete output template, so results reflect the whole graph — not a sample.