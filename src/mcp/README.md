# DevLens MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the DevLens code graph to AI agents as **24 MCP tools**. Works with TypeScript, JavaScript, Python, Go, Rust, and Java codebases (React/Next.js/Node, FastAPI/Flask/Django, Spring Boot, Gin/Echo, axum/actix/rocket). Bundled inside `@devlensio/cli` (no separate installation required).

---

## Why use the MCP server?

AI coding agents are powerful but blind — they read files one at a time with no sense of how your codebase fits together. The MCP server gives any MCP-compatible agent direct access to a pre-built, typed dependency graph of your TypeScript, JavaScript, Python, Go, Rust, or Java codebase.

Instead of your agent grepping and re-reading files every session, it queries the graph: "what depends on this?", "show me every route", "are there circular dependencies?", "what security issues exist?" — all answered in a few tokens.

Retrieval is lexical (BM25+ over a local index built from the graph), not embeddings. Every node is a document with six searchable fields (`name`, `nameparts`, `path`, `tech`, `biz`, `sec`) and identifiers outrank prose, so `find_symbols("createUser")` behaves the way a developer expects. There is no API key, no network call, and no vector database involved.

---

## Quick start

The repo must be analyzed first (`devlens analyze . --summarize`). The server then
answers questions about that graph.

**Claude Code:**

```bash
claude mcp add devlens -- devlens mcp
```

**Any MCP client** (Claude Desktop, Cursor, and others):

```json
{
  "mcpServers": {
    "devlens": {
      "command": "devlens",
      "args": ["mcp"]
    }
  }
}
```

> **Windows + Claude Desktop:** `{ "command": "cmd", "args": ["/c", "devlens", "mcp"] }`

Registered in the official MCP registry as **`io.github.devlensio/devlens`**.
For Streamable HTTP instead of stdio: `devlens mcp http -p 7000`.

---

## Available tools

### Start here

| Tool | What it does |
| :-- | :-- |
| `resolve_context` | **The front door.** One call returns a task-shaped packet: ranked nodes with one-line meanings, call flow, involved files, key code bodies, security flags, and an id map, all within a token budget |
| `blast_radius` | What breaks if a symbol changes, packed tight as files and node refs. A thin wrapper over `resolve_context` with `intent: "reference-list"` and a 1200-token budget |
| `find_symbols` | Cheap name/path/concept lookup over the BM25+ index. Returns nodeIds plus `file:line`, no graph structure, no source |

`resolve_context` leads the server instructions, so an agent reaches for it
first for almost any "where / how / what" question.

### Everything else

| Tool | What it does |
| :-- | :-- |
| `list_analyzed_repos` | List all repositories DevLens has analyzed |
| `get_repo_overview` | Repo fingerprint — framework, stats, central nodes, route count |
| `find_nodes` | Structured filter by name, type, file, folder, severity, or score (the filter-based sibling of `find_symbols`) |
| `get_nodes_in_path` | All nodes in a file or directory |
| `get_node` | Full detail for one node — summaries, callers, callees, connections |
| `get_summaries` | Batch-read summaries for multiple node IDs |
| `get_node_code` | Raw source code for a node |
| `get_blast_radius` | Upstream dependents as a structured result set (`blast_radius` is the packet-shaped version) |
| `get_khop` | Downstream dependencies — "what does this depend on?" |
| `get_subgraph` | Cohesive cluster around a seed node |
| `list_cycles` | Circular dependency groups |
| `get_security_issues` | Security findings ranked by severity then impact score. Returns the severity distribution and the assessed-node coverage, so zero findings reads against coverage instead of being mistaken for safe. Deterministic: reads the graph directly, no model call. Page with `offset` |
| `analyze` | Run the pipeline on a repo path and store the graph |
| `analyze_changes` | Difference between two analyzed commits + impact |
| `check_freshness` | Is the graph stale vs HEAD? (dirty, behind, summaries coverage) |
| `get_coverage` | Graph health report — summarized / total / by type |
| `architecture_brief` | One-call repo architecture brief — modules, routes, flows, health |
| `security_brief` | One-call prioritized security report: findings at or above the threshold, blast radius for highs, a ranked fix-first list, and the assessed-node coverage |
| `review_pr` | One-call PR review — diff + impact + test coverage + security delta |
| `onboarding_tour` | One-call onboarding skeleton — graph-derived tour for new devs |
| `get_context` | Legacy token-budgeted packet (keyword-seeded, JSON). Superseded by `resolve_context` |

Every tool shares the same underlying graph data — CLI and MCP outputs never drift because they use the same `src/core/` code.

### Tool schemas (new tools)

```ts
resolve_context({
  graphId: string,
  task: string,                    // the actual question, in plain words
  intent?: "pinpoint" | "reference-list" | "flow" | "overview"
         | "concept" | "security-audit" | "exploratory",   // default: exploratory
  focus?: string[],                // nodeIds or filePaths to center on
  tokenBudget?: number,            // default scales with repo size
  includeSummaries?: boolean,      // default true
  commitHash?: string,             // default: latest analyzed commit
})
// => { graphId, commitHash, intent, budget, origin, approxTokens, nodeCount,
//      packet: string, provenance: { source, commitHash, analyzedAt, hasGit } }

blast_radius({ graphId: string, symbol: string, commitHash?: string })
// => the resolve_context envelope, intent "reference-list", budget 1200

find_symbols({
  graphId: string,
  query: string,                   // symbol, identifier, path fragment, concept words
  summaryType?: "technical" | "business" | "both",   // default: both
  limit?: number,                  // 1..25, default 10
  commitHash?: string,
})
// => { query, summaryType, total, origin, needsReanalyze, commitHash,
//      symbols: [{ nodeId, name, type, filePath, startLine, endLine,
//                   relevance, exactMatch }] }
```

`find_symbols` and `find_nodes` answer different questions: `find_symbols` ranks
by text relevance (BM25+ over summaries, so it finds concepts and paraphrase),
`find_nodes` filters structurally (exact type, exact file, score, severity) and is
better when the agent already knows the shape it wants.

---

## Packet format

`resolve_context` and `blast_radius` return line format rather than JSON, because
the packet is the wire format: JSON nested inside a text content block re-escapes
its quotes on the way out, which measured at roughly double the cost.

```
GRAPH 75cfc0a3eb67e178 @ 911466a3cb
NODES 23
N1 tools.ts file src/mcp/tools.ts:1-393  m:This file belongs to the MCP integration layer.
N3 registerTools function src/mcp/tools.ts:29-393  m:This code exposes a code intelligence backend to MCP agents.
FLOW 1
N3 -calls-> N4
FILES 2
src/mcp/tools.ts  N1,N3
CODE 1
-- N3 src/mcp/tools.ts:29-60
  export function registerTools(server: McpServer) {
    ...
SEC 0
IDMAP N1=src/mcp/tools.ts::tools.ts N2=... N3=src/mcp/tools.ts::registerTools
NEXT hint
```

| Section | Budget share | Contents |
| :-- | :-- | :-- |
| `NODES` | 45% | `name type file:startLine-endLine  m:micro-summary`, short ids `N1..` |
| `FLOW` | 8% | `from -edge_type-> to` between included nodes |
| `FILES` | 20% | `filePath  N1,N2` for the included nodes |
| `CODE` | 35% | Real source read from disk for the top nodes |
| `SEC` | 5% | Security-relevant micro summaries |
| `IDMAP` | 10% | Short id to real node id, capped at 20 nodes |
| `NEXT` | 2% | The recommended follow-up call |

Shares are ceilings, not quotas. Details that matter in practice:

- **Micro summaries are extracted at pack time, not stored.** The renderer takes
  the first sentence of the business summary and clips it to 110 characters,
  stripping HTML tags on the way. Summaries themselves stay canonical and
  complete on disk.
- **Static per-node metadata is dropped.** A node line carries identity,
  location, and one line of meaning. Nothing else.
- **`CODE` is read from the local working tree** at the recorded
  `startLine`/`endLine`, under a 2500 ms wall-clock guard and a 5-node cap. If a
  file moved or vanished, the section degrades and the `NEXT` line says so. Code
  retrieval never turns into a tool error.
- **The budget is dynamic**: `clamp(2000 + 600 × ceil(files / 1000), 1500, 32000)`
  tokens. A flat ceiling starves a 50k-file repo and overfeeds a 200-file one.
  If a packet still exceeds the request, the renderer drops the lowest-ranked
  node and re-renders until it fits.
- **`approxTokens` is reported on every response** (`ceil(length / 4)`), so the
  caller can see the cost without counting.

### Provenance and freshness

Every `resolve_context` response ends with a provenance block:

```json
{ "source": "commit", "commitHash": "911466a3...", "analyzedAt": "2026-09-28T...", "hasGit": true }
```

`source` is `"snapshot"` for a repo analyzed without git. A response may also
carry `needsReanalyze: true`, which means the graph has neither a search index
nor a commit file on disk: the agent should tell the user to run
`devlens analyze`, not treat it as an error.

---

## Search index

`find_symbols` and `resolve_context` read a derived index, one file per commit:

```
~/.devlens/graphs/{graphId}/commits/{commitHash}.search.json
```

The index is built with [MiniSearch](https://github.com/lucaong/minisearch)
(BM25+, per-field boosts) plus `stopword` and `wink-porter2-stemmer` for term
preparation. Default field boosts: `name` 3, `nameparts` 3, `path` 2, `tech` 1,
`biz` 1, `sec` 0.5. Passing `summaryType: "technical"` or `"business"` reweights
the prose fields toward that kind of summary.

Lifecycle:

- **Built on analyze.** Every `devlens analyze` and `devlens summarize` run
  rebuilds the index for the commit it touched. Failure is non-fatal.
- **Built lazily on first search.** A graph created by an older CLI has no
  `.search.json`; the first search builds it from the commit JSON on the spot and
  the response is normal. Only if the commit file itself is missing does the tool
  report `needsReanalyze`.
- **Manual:** `devlens reindex [graphId] [commitHash] [--force]`, or
  `POST /api/reindex/:graphId` and `POST /api/reindex` on the backend server.
- **Safe to delete.** The file is derived, never a source of truth, and is
  rebuilt on demand.

A corrupt or truncated index falls back to a lazy rebuild, and a search that
still finds nothing falls back to the older substring scorer. Quality degrades
in that order; a query never errors because of index state.

---

## Planned retirements (provisional)

The tool count is intentional for now and shrinking next. Cloud telemetry showed
zero to one calls across 32 runs for a set of tools that are all reachable
through `resolve_context`, and a tool nobody calls still costs schema tokens in
every turn of every session.

Candidates: `list_analyzed_repos`, `get_repo_overview`, `get_khop`,
`get_subgraph`, `get_nodes_in_path`, `get_summaries`, `list_cycles`,
`architecture_brief`, `security_brief`, `onboarding_tour`, `review_pr`,
`analyze`, `analyze_changes`, plus the legacy `get_context`.

**This list is provisional.** It is derived from cloud usage data, not OSS usage
data. The wrappers and the front door land first; retirement waits until OSS
per-tool call counts confirm it.

---

## Examples

### The common case: one call answers the question

```json
// resolve_context(graphId: "abc-123", task: "how does user authentication work")
//   ⇒ packet (line format) with the auth nodes ranked first, each with a
//      one-line meaning, plus FLOW between them, the files involved, and the
//      source of the top few nodes; approxTokens and provenance included
```

### Looking up a symbol cheaply

```json
// find_symbols(graphId: "abc-123", query: "createUser", limit: 5)
//   ⇒ { symbols: [{ nodeId: "src/server/users.ts::createUser", name: "createUser",
//                   type: "FUNCTION", filePath: "src/server/users.ts",
//                   startLine: 41, endLine: 88, relevance: 1, exactMatch: true }, ...] }
```

### What breaks if I change this

```json
// blast_radius(graphId: "abc-123", symbol: "createUser")
//   ⇒ a compact packet of dependent files and node refs, 1200-token budget
```

### Getting started — orient on a repo

First, find out what graphs are available and get the big picture:

```json
// list_analyzed_repos → returns [{ graphId, repoPath, framework, commitCount }]
//   ⇒ graphId: "abc-123", repo: "/home/user/my-app", framework: "Next.js"

// get_repo_overview(graphId: "abc-123")
//   ⇒ framework: "Next.js 15", routeCount: 12, totalNodes: 342,
//      topNodes: [{ name: "Layout", score: 9.2 }, { name: "authMiddleware", score: 8.7 }]
```

### Locating code

Find where things live, then drill into details:

```json
// find_nodes(graphId: "abc-123", name: "Button", nodeTypes: ["COMPONENT"])
//   ⇒ [{ id: "src/ui/Button.tsx::Button", name: "Button", type: "COMPONENT",
//         filePath: "src/ui/Button.tsx", score: 6.2,
//         summary: "Reusable button with loading, disabled, and variant states" }]

// get_nodes_in_path(graphId: "abc-123", path: "src/components/")
//   ⇒ [{ name: "Navbar", type: "COMPONENT" }, { name: "NavbarSkeleton", type: "COMPONENT" }, ...]
```

### Understanding a node

Pull summaries, callers, and callees, without reading the source file:

```json
// get_node(graphId: "abc-123", nodeId: "src/auth/login.ts::loginUser")
//   ⇒ {
//       metadata: { name: "loginUser", type: "FUNCTION", filePath: "src/auth/login.ts:42-89", score: 8.1 },
//       callers: [{ id: "src/pages/login.tsx::LoginPage", viaEdge: "CALLS", score: 6.4 }],
//       callees: [{ id: "src/lib/api.ts::post", viaEdge: "CALLS" },
//                 { id: "src/store/auth.ts::useAuthStore", viaEdge: "CALLS" }],
//       technical: "Validates credentials, calls the auth API, updates the auth store on success",
//       business: "Handles user login, the primary authentication entry point",
//       security: { severity: "high", summary: "Plain-text password logged on validation failure" }
//     }

// get_summaries(graphId: "abc-123", nodeIds: ["src/auth/login.ts::loginUser", "src/store/auth.ts::useAuthStore"])
//   ⇒ [{ ...technical, business, security for each ... }]
```

### Impact analysis before a refactor

`blast_radius` gives the compact answer. The structured tools are still there
when an agent needs machine-readable results with distances:

```json
// get_blast_radius(graphId: "abc-123", nodeId: "src/store/user.ts::useUserStore")
//   ⇒ {
//       count: 14,
//       results: [{ node: { name: "ProfilePage", score: 7.2 }, viaEdge: "CALLS", distance: 1 },
//                 { node: { name: "SettingsPanel", score: 5.1 }, viaEdge: "CALLS", distance: 2 },
//                 ...]
//     }

// get_khop(graphId: "abc-123", nodeId: "src/api/anime.ts::getAnimeList")
//   ⇒ {
//       count: 5,
//       results: [{ node: { name: "animeDb", type: "THIRD_PARTY" }, viaEdge: "CALLS", distance: 1 },
//                 { node: { name: "cacheHelper", type: "FUNCTION" }, viaEdge: "CALLS", distance: 1 }]
//     }
```

### Security reviews and diffs

```json
// get_security_issues(graphId: "abc-123", minSeverity: "high")
//   ⇒ { nodesTotal: 10346, nodesAssessed: 10342, assessedPct: 99, unassessed: 4,
//       findingsBySeverity: { high: 12, medium: 88, low: 93 },
//       matched: 12, returned: 12, truncated: false,
//       findings: [{ name: "loginUser", severity: "high", filePath: "src/auth/login.ts",
//                    lines: "42-78", score: 6,
//                    securitySummary: "SQL injection risk: raw query concatenation",
//                    technicalSummary: "Validates credentials and issues a session token" },
//                  { name: "deleteAccount", severity: "high", filePath: "src/user/settings.tsx",
//                    securitySummary: "No CSRF token on DELETE endpoint" }] }
//
// The counts are the point. If findingsBySeverity is empty but nodesAssessed is far below
// nodesTotal, the graph was not assessed rather than clean, and the response says so.

// analyze_changes(graphId: "abc-123", from: "abc1234", to: "def5678")
//   ⇒ { added: [{ name: "AnalyticsTracker", score: 5.0 }],
//       removed: [{ name: "OldFeatureFlag", score: 1.2 }],
//       codeChanged: [{ name: "CheckoutForm", scoreDiff: +0.8 }] }
```

---

## Architecture

```
src/mcp/
├── index.ts        # Transport setup (stdio / HTTP) + server factory + INSTRUCTIONS
├── tools.ts        # 24 tool definitions (thin adapters over src/core)
├── helpers.ts      # Shared Zod schemas + argument coercion
├── packetRender.ts # resolve_context packet: line format, section shares, budget
└── graphCache.ts   # LRU cache — avoids reloading graphs on every call

src/search/         # local BM25+ retrieval, shared by the CLI, the REST API, and MCP
├── tokenizer.ts    # identifier splitting, stopwords, stemming
├── searchEngine.ts # MiniSearch wrapper: fields, boosts, serialization
├── indexer.ts      # PipelineResult -> .search.json
├── indexManager.ts # index lifecycle, LRU cache, lazy build
└── query.ts        # searchSeeds(): channel merge + fallback scoring
```

---

## Development

```bash
# Run the stdio server from source
bun src/mcp/index.ts

# Smoke-test the handshake
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | bun src/mcp/index.ts
```

---

## Adding a new tool

1. Add the query function to `src/core/` (so the CLI can also use it).
2. Register it in `tools.ts`: a Zod input schema + handler that calls the core function.
3. If it's a new capability, mention it in the server instructions in `index.ts`.

Before adding a retrieval tool, check whether `resolve_context` with a different
`intent` already covers it. The tool list is being consolidated on purpose, and a
new tool is a permanent per-turn schema cost.

---

## Related

- [DevLens OSS](https://github.com/devlensio/devlensOSS) — the parent project
- [`@devlensio/cli`](https://www.npmjs.com/package/@devlensio/cli) — the CLI that bundles this server