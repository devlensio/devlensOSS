# DevLens MCP reference

The complete DevLens **MCP tool** catalog, grouped by purpose, the node/edge vocabulary of the graphs (including the per-language differences), plus the methodology for using them well. Read this when you need a tool not covered by a specific `/devlens` subcommand, or to understand the toolset.

Tools appear as `mcp__plugin_devlens_devlens__<name>`; below they're named by the short `<name>`. Every tool takes a `graphId` (default: the graph for the cwd) and most accept an optional `commitHash`. Read each tool's own schema for its full parameters.

## How to use the graph well (read first)

DevLens is a **kit of graph queries** — the quality of an answer comes from orchestrating them, not from dumping the whole graph into context. A node summary is ~50 tokens; the file it describes is ~2000. So the goal is a thorough, well-structured answer built from cheap, targeted queries — never a brute-force node dump you never synthesized.

The order that produces good architecture/diagram/explain output:

1. **Orient cheap first** — `get_repo_overview`: language/framework fingerprint, `routeCount`, total node/edge counts, and the highest-scoring (most central) nodes. These exact counts anchor your output. Start here, always.
2. **Discover modules from the graph, not from path strings** — `get_subgraph` on each top central node returns the *cohesive cluster* that node belongs to: its siblings plus the edges internal to that cluster. These clusters **are** the codebase's real bounded contexts/modules. Merge the clusters from several central seeds into a deduped module model. This is the single most underused tool and the key to architecture that beats a raw LLM.
3. **Enumerate entry points & backbone by type** — `find_nodes` with `nodeTypes`: `ROUTE` for every language, plus the language's backbone set — `STATE_STORE`/`HOOK`/`COMPONENT` for JS/TS; `CLASS`/`METHOD`/`FUNCTION` for Python/Java; `STRUCT`/`INTERFACE`/`METHOD`/`FUNCTION` for Go; `ENUM`/`STRUCT`/`TRAIT`/`IMPL_BLOCK`/`METHOD`/`FUNCTION` for Rust (targeted, with a sensible `limit`). Map them onto the modules from step 2.
4. **Draw real edges, not guessed ones** — `get_blast_radius` (upstream: who depends on this) and `get_khop` (downstream: what this depends on) on each module's central node give the *actual* inter-module data/control flow. Each result carries `viaEdge` (the edge type) and `hop`. Use these to render connections; never invent edges.
5. **Label from meaning** — `get_summaries` (business + technical) for module centers, routes, and the backbone nodes. Describe each module/node by *what it does*, never by its name alone.
6. **Overlay structure-health** — `list_cycles` (tangled modules) and `get_security_issues` (risk), applied as overlays on the model you've built.
7. **Reach for source last** — `get_node` (summary) before `get_node_code` (raw source, expensive).

**Comprehensiveness via hierarchy, not omission.** On a large repo, give a clean *module-level* answer that accounts for every route and every bounded node set — for JS/TS that's routes + stores + hooks; for Python/Java/Go/Rust it's routes + classes/methods/structs/traits/functions — cites exact counts from `get_repo_overview`, and represents long tails explicitly ("+N more", with a drill-down command offered). A thorough, structured answer is the bar; an exhaustive raw list is not.

## Node & edge types

- **Node types (full union):** COMPONENT, HOOK, FUNCTION, STATE_STORE, UTILITY, CLASS, METHOD, INTERFACE, ENUM, STRUCT, MODULE, TRAIT, IMPL_BLOCK, PACKAGE, ROUTE, FILE, TEST, STORY, THIRD_PARTY (GHOST = internal placeholder). `MODULE` and `PACKAGE` are **reserved** — declared in the type system but not emitted by any language yet.
- **Edge types (the `viaEdge` field on traversal results):** `CALLS`, `IMPORTS`, `READS_FROM`, `WRITES_TO`, `PROP_PASS`, `EMITS`, `LISTENS`, `WRAPPED_BY`, `GUARDS`, `HANDLES`, `TESTS`, `USES`, `NEXTJS_API_CALL`, `NAVIGATES_TO`, `IMPLEMENTS`, `EXTENDS`. `EXPORTS` and `THROWS` are **reserved** (declared, not emitted).
- Compact node refs carry `score` (centrality) and `severity` (none|low|medium|high); traversal results (`get_node` callers/callees, `get_blast_radius`/`get_khop` nodes) additionally carry **`viaEdge`** and `hop`. Use these to encode meaning + risk, not just structure.

### Node & edge types by language

Which node types actually exist in a graph depends on the repo's language (a graph is per-repo/per-language). Use this table when filtering `find_nodes` or describing a graph:

| Language | Emitted node types | Notes |
| :-- | :-- | :-- |
| TS/JS | COMPONENT, HOOK, FUNCTION, STATE_STORE, UTILITY, CLASS, METHOD, FILE, ROUTE, TEST, STORY, GHOST, THIRD_PARTY | deliberately NO INTERFACE/ENUM/STRUCT |
| Python | CLASS, METHOD, FUNCTION, FILE, ROUTE, TEST, THIRD_PARTY | CLASS = dataclasses/ABCs/pydantic too; MODULE = FILE node |
| Java | CLASS, METHOD, INTERFACE, ENUM, FILE, ROUTE, TEST, THIRD_PARTY | NO FUNCTION (Java has no top-level functions) |
| Go | FUNCTION, STRUCT, METHOD, INTERFACE, FILE, ROUTE, TEST, THIRD_PARTY | files are FILE nodes; package = FILE node |
| Rust | ENUM, STRUCT, TRAIT, IMPL_BLOCK, METHOD, FUNCTION, FILE, ROUTE, TEST, THIRD_PARTY | NO MODULE nodes (FILE = module), NO PACKAGE |

**Edges by category:**
- **Every language:** `CALLS` (encoded in each node's `metadata.calls` — all languages populate it), `IMPORTS`, `HANDLES` (route → handler/service), `TESTS`, `READS_FROM`/`WRITES_TO` (data layer: SQLAlchemy/Django ORM, JPA repositories, GORM, Diesel, and DB/ORM stores generally).
- **OOP languages (Python/Java/Go/Rust, and TS/JS classes):** `EXTENDS` (class → base class/supertype), `IMPLEMENTS` (Python class → ABC/Protocol/base, Java class → interface, Go type → interface via structural typing, Rust impl → trait, TS/JS class → local class implementing a local class).
- **JS/TS-only:** `PROP_PASS`, `EMITS`, `LISTENS`, `WRAPPED_BY`, `GUARDS`, `USES`, `NEXTJS_API_CALL`, `NAVIGATES_TO` (and the STORY/GHOST node types).

**Cross-boundary impact via `NEXTJS_API_CALL` (JS/TS only, high-value).** `NEXTJS_API_CALL` links a client node (a component/function that does `fetch`/`axios`) to the API `ROUTE` it hits. Because it **composes with `HANDLES`** (route definition → handler), a blast radius on an API route now climbs *past* the calling component to the **page route** that renders it. So `get_blast_radius` on `GET /api/...` answers "**which user-facing pages break if I change this endpoint?**". When impact/architecture touches a JS/TS API route, always look one hop past the component for the page route, and report that page→API coupling explicitly. (For non-JS languages the equivalent is usually a `HANDLES`-only chain: API route → handler → service.)

## Tool catalog

### Discovery & orientation
- **`list_analyzed_repos`** — repos DevLens has already analyzed (graphId, path, **language**, framework, commit count). Call first to find the graphId; every other tool needs one.
- **`get_repo_overview`** — language/framework fingerprint, route count, and the most central nodes for one repo. **Start every analysis here.**

### Search & filter (compact refs, not source)
- **`find_nodes`** — search/filter nodes: `name` substring, `nodeTypes` (language-dependent — see the table above), `filePath`, `dir`, `minScore`, `severity`, `nodeIds` for an exact batch. Score-ranked, capped by `limit` (default 25). Returns id, name, type, path, score, 1-line summary.
- **`get_nodes_in_path`** — every node in a specific file or folder (recursive for folders). Great for orienting in an unfamiliar area.

### Node detail
- **`get_node`** — full detail for ONE node: metadata, callers (who depends on it), callees (what it calls), and technical/business/security summaries. `include` selects sections (default all); `edgeTypes` filters callers/callees. Your main inspection tool — summaries before source.
- **`get_summaries`** — batch-fetch summaries for many `nodeIds` at once (`include`: technical|business|security). Far cheaper than reading each file; use it on blast-radius/khop result sets.
- **`get_node_code`** — raw source for a node. **Expensive — last resort**, only when a summary is genuinely not enough.

### Structure, traversal & impact
- **`get_subgraph`** — the cohesive cluster (feature/module) a seed node belongs to: its sibling nodes plus the edges internal to that cluster. Use to discover real module boundaries and to draw a module's internals. (Returns structured `{ clusterId, nodes, edges }`.)
- **`get_blast_radius`** — **upstream** dependents: "if I change this, what breaks." `radius` defaults to 2 (capped when direct fan-out ≥100 and `radius` omitted → returns hop-1, `truncated=true`; re-call with an explicit `radius` to go deeper, uncapped). `edgeTypes` to focus. **Empty-result caveat:** zero/few callers means "none *in the graph*," which can be a coverage gap, not proof of safety — the real caller may be an un-extracted call site. Don't assert "nothing depends on this" from an empty blast radius; say "no graph-visible callers" and, if it matters, confirm with a quick targeted `grep`.
- **`get_khop`** — **downstream** dependencies: "what this depends on." Same `radius`/`edgeTypes` behavior as blast-radius.
- **`list_cycles`** — groups of nodes forming cyclic dependencies (circular imports/calls). Refactor hotspots.

### Security
- **`get_security_issues`** — nodes flagged with a security concern at/above `minSeverity` (default low), ranked by severity then score, each with its security summary (generated during summarization). `limit` defaults to 50; page through it for full coverage. For one node's security detail use `get_node` with `include: ["security"]`.

### Analysis & change
- **`analyze`** — analyze a repo at a local `path` (or GitHub URL) into a graph and persist it. Returns graphId + compact stats. Run once before querying a new repo, or refresh structure on a dirty worktree. (Summarization is controlled by the user-permission flow in SKILL.md — never summarize silently.)
- **`analyze_changes`** — compare two analyzed commits (`from`, `to`) and report added/removed/code-changed/score-changed nodes, plus the upstream blast radius of the change set. Both commits must already be analyzed.

### Freshness & coverage (the guard rails)
- **`check_freshness`** — one-shot graph-freshness report: `dirty` (uncommitted work), `behind` (HEAD ahead of graph), `stale`, and `summariesCoverage` (summarized/total/pct, whether THIS commit is summarized). **Run it before any composed workflow tool** (`architecture_brief`, `security_brief`, `review_pr`, `onboarding_tour`, `get_context`) — never answer against a stale graph.
- **`get_coverage`** — graph health: summarized/total per node type, which summary model was used. Useful for "how complete is this graph?".

### Composed workflow tools (one call replaces several)
These bundle the traversal methodology into a single token-budgeted call. They return `schemaVersion: 1` — verify it, and if a result's `schemaVersion !== 1`, **stop and warn the user the skill is out of date** with the installed DevLens.
- **`architecture_brief`** — one-call architecture packet: header stats, fingerprint, modules (clusters), **every** route + trace of its call path, stores/hooks (JS/TS), key flows, module connections, core nodes, cycles + security health. Use for `/devlens architecture`, and as the data source for `/devlens diagram architecture`.
- **`security_brief`** — one-call security report: all findings at/above `minSeverity`, blast-radius reach for high findings, and a ranked `fixTheseFirst`. Use for `/devlens security-analysis`.
- **`review_pr`** — one-call PR review between two analyzed commits: changed nodes with summaries, their blast-radius impact, TESTS coverage of changed nodes, security delta (new vs resolved), and a reviewer checklist. Use for `/devlens changes` when both commits are analyzed.
- **`onboarding_tour`** — one-call onboarding skeleton: modules, entry points, key flows, reading path, domain glossary, gotchas, and a `needsDisk` hint for what to read from disk (e.g. the package manifest, `.env.example`, README). Use for `/devlens onboard`.
- **`get_context`** — token-budgeted context packet for a free-text ask: keyword-seeds the graph (or uses `focus`/`seedNodeIds`/`intent`), traverses 1–2 hops, and assembles the relevant node summaries under a token budget. `intent` = explain|architecture|impact|security|generic (impact requires `focus`/`seedNodeIds`; security seeds from flagged nodes). Use for `/devlens explain` and general "how does X work" questions.

## Recommended flow
`get_repo_overview` → `get_subgraph` (modules) / `find_nodes`·`get_nodes_in_path` (locate) → `get_node` (inspect) → `get_blast_radius`/`get_khop` (impact) → `get_summaries` (batch meaning) → `list_cycles`/`get_security_issues` (overlays) → `get_node_code` (only if you must). Or use the composed tools to collapse several of these into one call. Start broad and cheap; drill in; pull raw source last.

## Language-aware notes (things that differ by language)

- **Python:** top-level code lives in `FUNCTION`/`CLASS`/`METHOD` nodes; third-party libs appear as `[pip]/<pkg>` THIRD_PARTY nodes (requires the repo's manifest deps to be in the third-party gate — the CLI/server does this automatically now); framework routes come from FastAPI/Flask/Django decorators & DRF routers (`HANDLES` → handler, class, or viewset CLASS).
- **Java:** classes + methods; Spring `@RestController` etc. → `ROUTE` + `HANDLES` to controllers; JPA `@Entity` → `READS_FROM`/`WRITES_TO` consumer→entity edges via Spring Data repositories.
- **Go:** `STRUCT`/`INTERFACE`/`FUNCTION`/`METHOD`; HANDLES → handler funcs for net/http/Gin/Echo/chi/Fiber; IMPLEMENTS is type-checked (`go/types`) — a type *implicitly* implementing an interface is a real `IMPLEMENTS` edge; GORM/`database/sql` → data edges.
- **Rust:** `STRUCT`/`ENUM`/`TRAIT`/`IMPL_BLOCK`/`METHOD`/`FUNCTION`; router macros (axum/actix/rocket/utoipa) → `ROUTE` + `HANDLES`; trait impls → `IMPLEMENTS`, supertraits → `EXTENDS`; Diesel → data edges.
- Resolving a node for `impact`/`explain` by name: use `find_nodes` — node ids look like `path/to/file.py::ClassName::method` (per-language separators in the id).

## Optional: driving the `devlens` CLI directly

The CLI ships the same core, so each MCP tool has a CLI twin, and everything supports `--json` for machine-readable output:

| MCP tool | CLI command |
| :-- | :-- |
| `list_analyzed_repos` | `devlens repos` |
| — (language/manifest probe) | `devlens detect [path]` |
| `get_repo_overview` | `devlens overview` |
| `find_nodes` | `devlens find-nodes [name]` |
| `get_nodes_in_path` | `devlens nodes-in-path <path>` |
| `get_node` | `devlens get-node <id>` |
| `get_summaries` | `devlens get-summaries <ids…>` |
| `get_node_code` | `devlens node-code <id>` |
| `get_security_issues` | `devlens security` |
| `get_blast_radius` | `devlens blast-radius <id>` |
| `get_khop` | `devlens khop <id>` |
| `get_subgraph` | `devlens subgraph <id>` |
| `list_cycles` | `devlens cycles` |
| `analyze` | `devlens analyze [path]` (`--summarize` for summaries) |
| `analyze_changes` | `devlens diff <from> <to>` |
| `check_freshness` | `devlens check-freshness` |
| `get_coverage` | `devlens coverage` |
| `architecture_brief` | `devlens architecture` |
| `security_brief` | `devlens security-brief` |
| `review_pr` | `devlens review-pr <from> <to>` |
| `onboarding_tour` | `devlens onboard-tour` |
| `get_context` | `devlens get-context "<question>"` |

Lifecycle/setup commands are CLI-only: `devlens init` (configure the summarization LLM provider), `devlens doctor` (environment health incl. per-extractor runtimes), `devlens status` (graphs + language + summary coverage), `devlens config`, `devlens graphs list|delete`, `devlens serve`. `devlens mcp` runs the MCP server this plugin uses.