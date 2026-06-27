# DevLens MCP reference

The complete DevLens **MCP tool** catalog, grouped by purpose, plus the methodology for using them well. Read this when you need a tool not covered by a specific `/devlens` subcommand, or to understand the toolset.

Tools appear as `mcp__plugin_devlens_devlens__<name>`; below they're named by the short `<name>`. Every tool takes a `graphId` (default: the graph for the cwd) and most accept an optional `commitHash`. Read each tool's own schema for its full parameters.

## How to use the graph well (read first)

DevLens is a **kit of graph queries** — the quality of an answer comes from orchestrating them, not from dumping the whole graph into context. A node summary is ~50 tokens; the file it describes is ~2000. So the goal is a thorough, well-structured answer built from cheap, targeted queries — never a brute-force node dump you never synthesized.

The order that produces good architecture/diagram/explain output:

1. **Orient cheap first** — `get_repo_overview`: framework fingerprint, `routeCount`, total node/edge counts, and the highest-scoring (most central) nodes. These exact counts anchor your output. Start here, always.
2. **Discover modules from the graph, not from path strings** — `get_subgraph` on each top central node returns the *cohesive cluster* that node belongs to: its siblings plus the edges internal to that cluster. These clusters **are** the codebase's real bounded contexts/modules. Merge the clusters from several central seeds into a deduped module model. This is the single most underused tool and the key to architecture that beats a raw LLM.
3. **Enumerate entry points & state by type** — `find_nodes` with `nodeTypes` for `ROUTE`, `STATE_STORE`, `HOOK` (targeted, with a sensible `limit` — not the whole node set). Map them onto the modules from step 2.
4. **Draw real edges, not guessed ones** — `get_blast_radius` (upstream: who depends on this) and `get_khop` (downstream: what this depends on) on each module's central node give the *actual* inter-module data/control flow. Each result carries `viaEdge` (the edge type) and `hop`. Use these to render connections; never invent edges.
5. **Label from meaning** — `get_summaries` (business + technical) for module centers, routes, and stores. Describe each module/node by *what it does*, never by its name alone.
6. **Overlay structure-health** — `list_cycles` (tangled modules) and `get_security_issues` (risk), applied as overlays on the model you've built.
7. **Reach for source last** — `get_node` (summary) before `get_node_code` (raw source, expensive).

**Comprehensiveness via hierarchy, not omission.** On a large repo, give a clean *module-level* answer that accounts for every route/store/module, cites exact counts from `get_repo_overview`, and represents long tails explicitly ("+N more", with a drill-down command offered). The depth comes from the traversal above, so nothing important is dropped. A thorough, structured answer is the bar; an exhaustive raw list is not.

## Node & edge types
- **Node types:** COMPONENT, HOOK, FUNCTION, STATE_STORE, UTILITY, ROUTE, FILE, TEST, STORY, THIRD_PARTY (GHOST = internal placeholder).
- **Edge types (the `viaEdge` field on traversal results):** CALLS, IMPORTS, READS_FROM, WRITES_TO, PROP_PASS, EMITS, LISTENS, WRAPPED_BY, GUARDS, HANDLES, TESTS, USES, NEXTJS_API_CALL.
- Compact node refs carry `score` (centrality), `severity` (none|low|medium|high) and a short `summary`; traversal results (`get_node` callers/callees, `get_blast_radius`/`get_khop` nodes) additionally carry **`viaEdge`** and `hop`. Use these to encode meaning + risk, not just structure.

**Cross-boundary impact via `NEXTJS_API_CALL` (high-value, often overlooked).** `NEXTJS_API_CALL` links a client node (a component/function that does `fetch`/`axios`) to the API `ROUTE` it hits. Because it **composes with `HANDLES`** (route definition → handler), a blast radius on an API route now climbs *past* the calling component to the **page route** that renders it. So `get_blast_radius` on `GET /api/...` answers "**which user-facing pages break if I change this endpoint?**" — a client↔server dependency the graph couldn't express before. When impact/architecture touches an API route, always look one hop past the component for the page route, and report that page→API coupling explicitly.

## Tool catalog

### Discovery & orientation
- **`list_analyzed_repos`** — repos DevLens has already analyzed (graphId, path, framework, commit count). Call first to find the graphId; every other tool needs one.
- **`get_repo_overview`** — framework/language fingerprint, route count, and the most central nodes for one repo. **Start every analysis here.**

### Search & filter (compact refs, not source)
- **`find_nodes`** — search/filter nodes: `name` substring, `nodeTypes`, `filePath`, `dir`, `minScore`, `severity`, `nodeIds` for an exact batch. Score-ranked, capped by `limit` (default 25). Returns id, name, type, path, score, 1-line summary.
- **`get_nodes_in_path`** — every node in a specific file or folder (recursive for folders). Great for orienting in an unfamiliar area.

### Node detail
- **`get_node`** — full detail for ONE node: metadata, callers (who depends on it), callees (what it calls), and technical/business/security summaries. `include` selects sections (default all); `edgeTypes` filters callers/callees. Your main inspection tool — summaries before source.
- **`get_summaries`** — batch-fetch summaries for many `nodeIds` at once (`include`: technical|business|security). Far cheaper than reading each file; use it on blast-radius/khop result sets.
- **`get_node_code`** — raw source for a node. **Expensive — last resort**, only when a summary is genuinely not enough.

### Structure, traversal & impact
- **`get_subgraph`** — the cohesive cluster (feature/module) a seed node belongs to: its sibling nodes plus the edges internal to that cluster. Use to discover real module boundaries and to draw a module's internals. (Returns structured `{ clusterId, nodes, edges }` — the parseable cluster data the old CLI `subgraph` text output couldn't give.)
- **`get_blast_radius`** — **upstream** dependents: "if I change this, what breaks." `radius` defaults to 2 (capped when direct fan-out ≥100 and `radius` omitted → returns hop-1, `truncated=true`; re-call with an explicit `radius` to go deeper, uncapped). `edgeTypes` to focus. **Empty-result caveat:** zero/few callers means "none *in the graph*," which can be a coverage gap, not proof of safety — the real caller may be an un-extracted call site (e.g. a `fetch`/`axios` inside an object-literal method or config registry, or a URL used as an `src`/`href` rather than a fetch arg). Don't assert "nothing depends on this" from an empty blast radius; say "no graph-visible callers" and, if it matters, confirm with a quick targeted `Grep`.
- **`get_khop`** — **downstream** dependencies: "what this depends on." Same `radius`/`edgeTypes` behavior as blast-radius.
- **`list_cycles`** — groups of nodes forming cyclic dependencies (circular imports/calls). Refactor hotspots.

### Security
- **`get_security_issues`** — nodes flagged with a security concern at/above `minSeverity` (default low), ranked by severity then score, each with its security summary. `limit` defaults to 50; page through it for full coverage. For one node's security detail use `get_node` with `include: ["security"]`.

### Analysis & change
- **`analyze`** — analyze a repo at a local `path` (or GitHub URL) into a graph and persist it. Returns graphId + compact stats. Run once before querying a new repo, or to refresh structure on a dirty worktree. (Summarization is controlled by the user-permission flow in SKILL.md — never summarize silently.)
- **`analyze_changes`** — compare two analyzed commits (`from`, `to`) and report added/removed/code-changed/score-changed nodes, plus the upstream blast radius of the change set. Both commits must already be analyzed.

## Recommended flow
`get_repo_overview` → `get_subgraph` (modules) / `find_nodes`·`get_nodes_in_path` (locate) → `get_node` (inspect) → `get_blast_radius`/`get_khop` (impact) → `get_summaries` (batch meaning) → `list_cycles`/`get_security_issues` (overlays) → `get_node_code` (only if you must). Start broad and cheap; drill in; pull raw source last.

## CLI ↔ MCP mapping (for users driving the `devlens` CLI directly)
The CLI ships the same core, so each MCP tool has a CLI twin:

| MCP tool | CLI command |
| :-- | :-- |
| `list_analyzed_repos` | `devlens repos` |
| `get_repo_overview` | `devlens overview` |
| `find_nodes` | `devlens find-nodes` |
| `get_nodes_in_path` | `devlens nodes-in-path <path>` |
| `get_node` | `devlens get-node <id>` |
| `get_summaries` | `devlens get-summaries <ids…>` |
| `get_node_code` | `devlens node-code <id>` |
| `get_security_issues` | `devlens security` |
| `get_blast_radius` | `devlens blast-radius <id>` |
| `get_khop` | `devlens khop <id>` |
| `get_subgraph` | `devlens subgraph <id>` (CLI prints a text listing; the MCP tool returns structured JSON) |
| `list_cycles` | `devlens cycles` |
| `analyze` | `devlens analyze [path]` (`--summarize` for summaries) |
| `analyze_changes` | `devlens diff <from> <to>` |

Lifecycle/setup commands are CLI-only: `devlens init` (configure the summarization LLM provider), `devlens doctor` (environment health), `devlens status` (commit/summary coverage), `devlens config`, `devlens graphs list|delete`. `devlens mcp` runs the MCP server this plugin uses.
