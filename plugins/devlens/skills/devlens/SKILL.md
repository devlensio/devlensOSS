---
name: devlens
description: Understand a TS/JS/React/Next.js/Node codebase with the DevLens CLI — query a precomputed graph of nodes (components, hooks, functions, routes) and typed edges, each carrying technical/business/security summaries, instead of grepping and reading whole files. Use when exploring an unfamiliar repo, before editing code, or for requests like "where does X live", "what breaks if I change Y", "explain this codebase", "draw the architecture", "is this secure", "find circular dependencies", or impact/security/architecture review.
argument-hint: "[init|architecture|diagram|summary|security-analysis|explain|tech-debt|impact|find]"
allowed-tools: Bash(devlens *), Bash(git *), Bash(npm *), Bash(npx *)
---

# DevLens — codebase intelligence via the `devlens` CLI

DevLens precomputes a structural graph of a repo: nodes (components, hooks, functions, routes, stores) joined by typed edges (CALLS, IMPORTS, READS_FROM, …), each carrying a **technical** summary, a **business/functional** summary, and a **security** assessment. Query it with the `devlens` CLI **before** opening files.

**Why this saves tokens:** a node summary is ~50 tokens; the underlying file is ~2000. Querying summaries, and using `blast-radius`/`khop` to fetch only the relevant slice, costs a fraction of reading files. Always pass `--json`. Reach for raw source (`node-code`) only as a last resort.

## Step 1 — Ensure the CLI exists
Run `devlens --version`. If it is missing: `npm install -g @devlensio/cli` (corporate proxy? see the install note — set `NODE_EXTRA_CA_CERTS`).

## Step 2 — Graph freshness guard (ALWAYS run before any query)
Determine state:
- Current commit: `git rev-parse HEAD`
- Dirty? `git status --porcelain` (any output = uncommitted/untracked changes)
- Existing graphs: `devlens status --json` → find the entry whose `repoPath` is this repo; read its `latestCommit` and `summarizedCommits`.

Then apply, in order:

1. **Worktree is dirty** → re-analyze the working tree **every run** so structure matches disk:
   `devlens analyze . --latest --json`
   This replaces the stored graph with the latest uncommitted-worktree graph. **Structure only — do NOT summarize.** Existing summaries are inherited for unchanged nodes; new/changed nodes simply have none yet. Then proceed.
2. **Clean worktree AND a graph for the current commit exists** (`latestCommit` == `git HEAD`) → use it directly.
   - If the chosen subcommand needs summaries (architecture, explain, security-analysis, summary) and the graph has none for this commit (`summarizedCommits` is 0 / doesn't cover it), **STOP and ask the user for permission to summarize** before running `devlens analyze . --summarize --json`. If they decline, continue structure-only and say what's limited.
3. **Clean worktree AND no graph for the current commit** → create the structural graph first:
   `devlens analyze . --json`
   Then **ask the user whether to summarize this commit** (`devlens analyze . --summarize --json`). Proceed structure-only if they decline.

**Golden rule:** structural `analyze` may run automatically; **`--summarize` requires explicit user permission every time** — it costs LLM calls. Never summarize silently.

## Step 3 — Route to the subcommand
You were invoked as `/devlens $ARGUMENTS`. Take the first word (`$0`) as the subcommand and read the matching recipe, then follow it exactly:

| Subcommand | Recipe |
| :-- | :-- |
| `init` | `${CLAUDE_SKILL_DIR}/commands/init.md` |
| `architecture` | `${CLAUDE_SKILL_DIR}/commands/architecture.md` |
| `diagram` | `${CLAUDE_SKILL_DIR}/commands/diagram.md` |
| `summary` | `${CLAUDE_SKILL_DIR}/commands/summary.md` |
| `security-analysis` | `${CLAUDE_SKILL_DIR}/commands/security-analysis.md` |
| `explain` | `${CLAUDE_SKILL_DIR}/commands/explain.md` |
| `tech-debt` | `${CLAUDE_SKILL_DIR}/commands/tech-debt.md` |
| `impact` | `${CLAUDE_SKILL_DIR}/commands/impact.md` |
| `find` | `${CLAUDE_SKILL_DIR}/commands/find.md` |

- **No argument** (bare `/devlens`): briefly list the subcommands above with one line each, and point to `${CLAUDE_SKILL_DIR}/reference.md` for the full CLI catalog and when to use each command. Do not run analysis.
- **Unknown argument**: say so and show the subcommand list.
- When **auto-invoked** (the user didn't type `/devlens`), pick the subcommand that matches their request (e.g. "is this secure?" → security-analysis; "draw the architecture" → diagram).

Every query command accepts `-g <graphId>` (defaults to the graph for the cwd) and `-c <commit>`. Default to the cwd graph unless the user specifies otherwise.
