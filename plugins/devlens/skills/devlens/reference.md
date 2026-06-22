# DevLens CLI reference

The complete `devlens` command catalog, grouped by purpose, with when/how to use each and the flags that matter. Read this when you need a command not covered by a specific `/devlens` subcommand, or to understand the tool.

## Token economics (read first)
DevLens exists to keep context small. A node **summary is ~50 tokens**; the **file it describes is ~2000**. So:
- Prefer **summaries** (`get-node`, `get-summaries`, `overview`) over reading files.
- Fetch only the **relevant slice** with `blast-radius` (upstream) / `khop` (downstream) instead of pulling whole directories.
- **Batch** with `get-summaries <id...>` rather than many `get-node` calls.
- Use `node-code` (raw source) **only** when a summary is genuinely insufficient to act.
- Always pass `--json` for machine-readable output you can parse.

## Global conventions
- `--json` — machine-readable output (use it).
- `-g, --graph <id>` — target a specific graph; defaults to the graph for the **cwd**.
- `-c, --commit <hash>` — query a specific commit.
- `-v, --verbose` — diagnostics.

## Lifecycle (create/maintain graphs)
- **`devlens init`** — first-time setup: configure the LLM provider used for summaries.
- **`devlens doctor`** — environment health (git, storage, LLM provider). Run when something fails.
- **`devlens analyze [path] [commitHash]`** — build/refresh the structural graph.
  - `--latest` — analyze the working tree including uncommitted changes (current default).
  - `--summarize` — also generate technical/business/security summaries. **Costs LLM calls — only with user permission.**
  - `--force-summarize` — re-summarize every node from scratch.
- **`devlens summarize [target] [commit]`** — run analysis then summarization (summaries only). Same permission rule.
- **`devlens status`** — per-graph `commits`, `latestCommit`, `summarizedCommits`. Best command to check freshness/summary coverage.
- **`devlens graphs list` / `devlens graphs delete <id>`** — manage stored graphs.
- **`devlens repos`** — list analyzed repositories (graphId, repoPath, framework, latestCommit).
- **`devlens config`** — show/update `~/.devlens/config.json`.

## Orient
- **`devlens overview`** — repo fingerprint (language, projectType, framework, router, stateManagement, dataFetching, databases, rawDependencies), stats, and the most-central nodes. **Start here.**
- **`devlens top-nodes -l <n>`** — highest-scoring (most central) nodes; the modules that matter most.

## Node & edge types
- **Node types (`-t`):** COMPONENT, HOOK, FUNCTION, STATE_STORE, UTILITY, ROUTE, FILE, TEST, STORY, THIRD_PARTY (GHOST = internal placeholder).
- **Edge types (`-e`, and the `viaEdge` field):** CALLS, IMPORTS, READS_FROM, WRITES_TO, PROP_PASS, EMITS, LISTENS, WRAPPED_BY, GUARDS, HANDLES, TESTS, USES.
- Compact node refs carry `severity` (none|low|medium|high) and a short `summary`; connection results (`get-node` callers/callees, `blast-radius`/`khop` nodes) carry **`viaEdge`** (the edge type) and `hop`. Use these to encode meaning + risk, not just structure.

## Find code (locate nodes — compact refs, not source)
- **`devlens find-nodes [name]`** — substring search on node name.
  - `-t, --type <types...>` — node types (see list above).
  - `-f, --file <path>` — nodes in exactly this file.
  - `-d, --dir <path>` — nodes under this folder (prefix).
  - `--node-ids <ids...>` — fetch exact ids.
  - `--min-score <n>`, `--severity <low|medium|high>`, `-l, --limit <n>` (default 25).
- **`devlens nodes-in-path <path>`** — every node in a file or folder (`-t` to filter by type).

## Understand (summaries & detail)
- **`devlens get-node <nodeId>`** — full detail for one node: summaries + callers + callees. Your main inspection tool.
  - `-i, --include <sections...>` — `metadata|callers|callees|technical|business|security` (narrow the payload).
  - `-e, --edge-types <types...>` — filter caller/callee edges.
- **`devlens get-summaries <nodeIds...>`** — batch summaries for many ids.
  - `-i, --include <kinds...>` — `technical|business|security`. (business == functional)
- **`devlens node-code <nodeId>`** — raw source. **Expensive — last resort.**

## Structure & impact
- **`devlens blast-radius <nodeId>`** — **upstream** dependents ("what breaks if I change this"). `-r, --radius <n>` (default 2, capped on huge fan-out; an explicit value is uncapped). `-e, --edge-types`.
- **`devlens khop <nodeId>`** — **downstream** dependencies ("what this needs"). Same `-r`/`-e`.
- **`devlens subgraph <seedNodeId>`** — the cohesive cluster around a node. ⚠️ `--json` is currently not honored (it prints a text cluster listing); for parseable structure use `khop`/`blast-radius`/`get-node` (which carry `viaEdge`).
- **`devlens cycles`** — cyclic dependency groups (`{total, cycles}`).
- **`devlens diff <from> <to>`** — changed nodes between two commits + blast radius of the changes. `-r, --radius <n>` (default 1).

## Security
- **`devlens security`** — nodes flagged with security concerns: `{total, issues:[{id,name,type,filePath,lines,score,summary,severity,securitySummary}]}`.
  - `--min-severity <low|medium|high>` (default low), `-l, --limit <n>` (default 50).
- For one node's security detail: **`devlens get-node <id> -i security`**.

## MCP
- **`devlens mcp`** — run the DevLens MCP server over stdio (default). `devlens mcp http -p <port>` for Streamable HTTP. The same graph powers both the CLI and MCP tools.

## Recommended flow
overview → find-nodes/nodes-in-path (locate) → get-node (inspect) → blast-radius/khop (impact) → get-summaries (batch) → node-code (only if you must). Start broad and cheap; drill in; pull raw source last.
