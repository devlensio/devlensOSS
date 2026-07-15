---
name: devlens
description: Understand a Typescript/Javascript/React/Next.js/Node codebase with the DevLens MCP — query a precomputed graph of nodes (components, hooks, functions, routes) and typed edges, each carrying technical/business/security summaries, instead of grepping and reading whole files. Use PROACTIVELY — reach for this BEFORE grepping/Glob/reading files whenever you need to locate, understand, or assess the impact of TS/JS/React/Next.js/Node code, not only when DevLens is named. Triggers: exploring an unfamiliar repo, orienting before an edit, "where does X live", "what calls/uses X", "what breaks if I change Y", "how does X work", "explain this codebase", "draw the architecture", "is this secure", "find circular dependencies", or any impact/security/architecture/onboarding review.
argument-hint: "[init|architecture|diagram|summary|security-analysis|explain|onboard|tech-debt|impact|find|changes|guard]"
allowed-tools: mcp__plugin_devlens_devlens__list_analyzed_repos, mcp__plugin_devlens_devlens__get_repo_overview, mcp__plugin_devlens_devlens__find_nodes, mcp__plugin_devlens_devlens__get_nodes_in_path, mcp__plugin_devlens_devlens__get_node, mcp__plugin_devlens_devlens__get_summaries, mcp__plugin_devlens_devlens__get_node_code, mcp__plugin_devlens_devlens__get_security_issues, mcp__plugin_devlens_devlens__get_blast_radius, mcp__plugin_devlens_devlens__get_khop, mcp__plugin_devlens_devlens__get_subgraph, mcp__plugin_devlens_devlens__list_cycles, mcp__plugin_devlens_devlens__analyze, mcp__plugin_devlens_devlens__analyze_changes, Read, Write, Bash(git *)
---

# DevLens — codebase intelligence via the DevLens MCP

DevLens precomputes a structural graph of a repo: nodes (components, hooks, functions, routes, stores) joined by typed edges (CALLS, IMPORTS, READS_FROM, …), each carrying a **technical** summary, a **business/functional** summary, and a **security** assessment. You query it through the **DevLens MCP tools** — not by reading files.

**Tool names.** The DevLens MCP server is bundled with this plugin and registers automatically. Its tools appear to you as `mcp__plugin_devlens_devlens__<name>`. Throughout these recipes a tool is named by its short `<name>` (e.g. `get_subgraph`, `find_nodes`, `get_blast_radius`); call the matching `mcp__plugin_devlens_devlens__…` tool. Every tool is keyed by a `graphId` (and optionally a `commitHash`); read each tool's own description for its parameters.

**Why this saves tokens:** a node summary is ~50 tokens; the underlying file is ~2000. Querying summaries, and using `get_blast_radius`/`get_khop`/`get_subgraph` to fetch only the relevant slice, costs a fraction of reading files. Reach for raw source (`get_node_code`) only as a last resort.

**Standing rule — prefer summaries when available:** whenever a node has a technical or business summary, read it (`get_node` / `get_summaries`) to understand the code **instead of opening the file** — it is far cheaper and usually enough. Fall back to `get_node_code` or reading the file only when no summary exists (structure-only graph) or the summary is genuinely insufficient to act. This applies to every subcommand below.

## Pre-flight check — the `list_analyzed_repos` reflex

**Before calling `Read`, `Grep`, or `Glob` on a javascrip/Typescript based TS/JS/React/Next.js/Node repo to *understand* something**, check whether DevLens has the repo analyzed. This check takes ~1 second and ~100 tokens, and it saves you from fan-out file reads that cost 10–40× more.

**When you should fire this check** — if the user wants to understand the repo, or if you need to read the Repository to understand the structure, architecture, impact radius, connectivity, functionality, or technicality of the Repo, use devlens for this task first.

**The check itself (one call, cached for the session):**
1. Call `list_analyzed_repos`. If this repo appears → use DevLens tools. If not → fall back to file tools, and note that `/devlens init` can analyze the repo.

Treat `list_analyzed_repos` the way you treat `git log` — a reflex, not a deliberate choice. Call it once per session, cache the `graphId`, and reuse it for every subsequent query. **Do not ask the user's permission to run this check**; it's automatic.

---

## When to reach for DevLens vs. plain file tools (routing policy)
On a TS/JS/React/Next.js/Node repo, **DevLens is the default way to understand code** — querying the graph is cheaper and more accurate than grepping. Reach for DevLens (don't `Grep`/`Glob`/`Read` first) whenever you need to:
- **Locate** — "where is X", which file/component/route/hook/store handles something → `find_nodes` / `get_nodes_in_path`.
- **Understand** — what a function/component/module does before relying on or editing it → `get_node` / `get_summaries` (summary first, source last).
- **Assess impact** — "what breaks if I change Y", who calls/uses X, what X depends on → `get_blast_radius` / `get_khop`.
- **Orient before an edit** — getting your bearings in an unfamiliar area → `get_repo_overview` / `get_subgraph`.
- **Review** — architecture, security, tech-debt, cycles, onboarding → the matching subcommand.

This is the fix for "grepping for every little task": don't fan out `Grep`/`Read` to reconstruct what a node does or who depends on it — **one graph query (a ~50-token summary) replaces several greps and full-file reads.**

Use plain `Read`/`Grep`/`Glob` instead when:
- You already know the exact file and the task is small and localized (a typo, a one-liner, a rename in a known spot).
- You need the **literal current bytes to edit** — once DevLens tells you *where* and *what*, pull the file to make the change (DevLens decides where/what; file tools make the edit).
- The repo isn't TS/JS/React/Node, or no graph exists and the user doesn't want to analyze.
- You're searching things the graph doesn't model (config, docs, generated output, non-code assets).

Rule of thumb: **DevLens to decide *where* and *what*; file tools to make the actual change.** If you catch yourself about to grep to understand a TS/JS/Node symbol, query the graph instead.

## Step 1 — Ensure the DevLens MCP is connected
Call `list_analyzed_repos`. If it returns (even an empty list), the MCP is live — proceed. If the tool is **not available** (no `mcp__plugin_devlens_devlens__*` tools), the DevLens MCP isn't connected: tell the user and stop. To enable it, they can reinstall/enable this plugin, or register the server directly:
```
claude mcp add devlens -- npx -y @devlensio/cli mcp
```
(The MCP ships inside the `@devlensio/cli` package, so no separate install is needed once registered.)

## Step 2 — Graph freshness guard (ALWAYS run before any query)
Determine state:
- Current commit: `git rev-parse HEAD`
- Dirty? `git status --porcelain` (any output = uncommitted/untracked changes)
- Existing graphs: `list_analyzed_repos` → find the entry whose repo path is this repo; note its graphId and latest analyzed commit. `get_repo_overview` on that graphId reports its commit coverage.

**Resolve `graphId` and freshness ONCE per session, then reuse.** `list_analyzed_repos` returns every analyzed repo (a large payload) — call it once, cache the graphId and `latestAnalyzedAt`, and pass that graphId to every subsequent tool. Do **not** re-call `list_analyzed_repos` (or re-run the freshness guard) before each query; that re-reads the full repo list for no new information. Re-resolve only if the user switches repos or you re-`analyze`.

Then apply, in order:

1. **Worktree is dirty** → re-analyze the working tree so structure matches disk: call `analyze` with this repo's path. This refreshes the **structure only** — existing summaries are inherited for unchanged nodes; new/changed nodes simply have none yet. Then proceed.
2. **Clean worktree AND a graph for the current commit exists** → use it directly.
   - If the chosen subcommand needs summaries (architecture, explain, security-analysis, summary) and the graph has none for this commit, **STOP and ask the user for permission to summarize** before re-running `analyze` with summarization enabled. If they decline, continue structure-only and say what's limited.
3. **Clean worktree AND no graph for the current commit** → call `analyze` (structure only) first, then **ask the user whether to summarize this commit**. Proceed structure-only if they decline.

**Golden rule:** structural `analyze` may run automatically; **summarizing requires explicit user permission every time** — it costs LLM calls. Never summarize silently.

## Step 3 — Route to the subcommand
You were invoked as `/devlens $ARGUMENTS`. Take the first word (`$0`) as the subcommand and **read the matching recipe file in full, then follow it exactly.**

**How to use the graph well (applies to every subcommand).** These tools are a kit — the quality of your answer comes from *orchestrating them*, not from dumping the whole graph. Before writing any recipe's output, internalize the methodology in `${CLAUDE_SKILL_DIR}/reference.md` → **"How to use the graph well"**. In short:
- **Orient cheap first** with `get_repo_overview` (framework, route count, top central nodes). Let its exact counts anchor your output.
- **Discover real modules from the graph**, not from directory-name guesses: `get_subgraph` on central seed nodes returns the cohesive clusters that *are* the codebase's bounded contexts.
- **Draw real connections** with `get_blast_radius` (upstream) and `get_khop` (downstream) — never invent edges.
- **Describe by meaning** using `get_summaries` (business + technical) — label things by what they *do*, not by their names.
- **Overlay health** with `list_cycles` and `get_security_issues`.
- **Be comprehensive through hierarchy, not omission.** On a large repo, give a clean module-level answer that accounts for every route/store/module and represents long tails explicitly (e.g. "+N more"), with drill-down offered — rather than enumerating raw node lists you never synthesized. Cite the exact counts from `get_repo_overview`. A thorough, well-structured answer is the goal; a brute-force node dump is not.
- **Scope to the question.** A scoped ask ("how does *streaming* work", a path) is not a whole-repo tour — seed from the named subsystem's cluster (`get_subgraph`) and stay there. Reserve the full sweep for genuinely whole-repo requests; over-traversing a scoped question drains the budget the write-up needs.
- **Output discipline — the data is wasted if the write-up is garbled.** (1) **Lead with the exclusives** a raw LLM can't produce: in-scope **security severity flags are a mandatory call-out**, describe relationships by their **edge type**, and rank by **centrality**. (2) **No hand-drawn ASCII diagrams** — they break and truncate; use Markdown tables or Mermaid blocks, or defer to `/devlens diagram`. (3) **Protect the synthesis budget**: collect efficiently (batch `get_summaries`, don't over-traverse), then write deliberately — a few sections written cleanly beats every section truncated.

Routing table:

| Subcommand | Recipe |
| :-- | :-- |
| `init` | `${CLAUDE_SKILL_DIR}/commands/init.md` |
| `architecture` | `${CLAUDE_SKILL_DIR}/commands/architecture.md` |
| `diagram` | `${CLAUDE_SKILL_DIR}/commands/diagram.md` |
| `summary` | `${CLAUDE_SKILL_DIR}/commands/summary.md` |
| `security-analysis` | `${CLAUDE_SKILL_DIR}/commands/security-analysis.md` |
| `explain` | `${CLAUDE_SKILL_DIR}/commands/explain.md` |
| `onboard` | `${CLAUDE_SKILL_DIR}/commands/onboard.md` |
| `tech-debt` | `${CLAUDE_SKILL_DIR}/commands/tech-debt.md` |
| `impact` | `${CLAUDE_SKILL_DIR}/commands/impact.md` |
| `find` | `${CLAUDE_SKILL_DIR}/commands/find.md` |
| `changes` | `${CLAUDE_SKILL_DIR}/commands/changes.md` |
| `guard` | `${CLAUDE_SKILL_DIR}/commands/guard.md` |

- **No argument** (bare `/devlens`): briefly list the subcommands above with one line each, and point to `${CLAUDE_SKILL_DIR}/reference.md` for the full tool catalog and when to use each. Do not run analysis.
- **Unknown argument**: say so and show the subcommand list.
- When **auto-invoked** (the user didn't type `/devlens`), pick the subcommand that matches their request (e.g. "is this secure?" → security-analysis; "draw the architecture" → diagram).

Every tool accepts `graphId` (default to the graph for the cwd) and an optional `commitHash`. Default to the cwd graph's latest commit unless the user specifies otherwise.
