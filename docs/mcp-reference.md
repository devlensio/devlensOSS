# DevLens MCP Reference

This is the reference for the DevLens MCP surface: every tool, the packet format, the search index, and worked response examples. The root [README](../README.md) has the product overview and the install steps.

---

## Why use the MCP server?

AI coding agents are powerful but blind: they read files one at a time with no sense of how your codebase fits together. The MCP server gives any MCP-compatible agent direct access to a pre-built, typed dependency graph of your TypeScript, JavaScript, Python, Go, Rust, or Java codebase.

Instead of your agent grepping and re-reading files every session, it queries the graph: "what depends on this?", "how does auth work?", "what does this hook do?" — answered in a compact plain-text packet measured at roughly a third of the tokens of reading the code.

Retrieval is lexical (BM25+ over a local index built from the graph), not embeddings. Every node is a document with six searchable fields (`name`, `nameparts`, `path`, `tech`, `biz`, `sec`) and identifiers outrank prose, so `find_symbols("createUser")` behaves the way a developer expects. There is no API key, no network call, and no vector database involved.

---

## Quick start

The repo must be analyzed first (`devlens analyze . --summarize`). The server then answers questions about that graph. **No `graphId` is needed anywhere** — the server resolves the repo from your working folder.

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

Five tools. `resolve_context` is the front door and answers most questions in a single call; the other four cover lookup, drill-down, impact, and repo management.

| Tool | Key arguments | What it does |
| :-- | :-- | :-- |
| `resolve_context` | `task` (required), `intent?`, `focus?`, `tokenBudget?`, `repoPath?`, `commitHash?` | **The front door.** One call returns a task-shaped plain-text packet: an ANSWER line, ranked nodes with one-line meanings, call flow, involved files with matched-line snippets, and an id map — all within a token budget. Intents: `pinpoint`, `reference-list`, `flow`, `overview`, `concept`, `security-audit`, `exploratory` (default). The repo is resolved from the working folder. |
| `find_symbols` | `query` (required), `limit?` | Cheap symbol lookup by name, path fragment, or concept words (lexical BM25F). Returns ranked nodeIds with `file:line` — no code, no structure. |
| `get_node` | `node` (required), `include?`, `edgeTypes?` | Full detail for one node: technical/business/security summaries, callers, callees. Pass a nodeId from `resolve_context`/`find_symbols`, or a symbol name to auto-locate. `include=['code']` adds the raw source. |
| `impact` | `target?`, `direction?`, `radius?` — or `from`+`to` commits | Change impact. Default: upstream dependents of a symbol/node (what breaks if it changes); `direction='downstream'` reverses. `from`+`to` commit hashes switch to commit-range diff mode with per-change impact. Compact `file:line` refs. |
| `repo` | `action`: `list` \| `analyze` \| `freshness` \| `health` | Manage analyzed graphs: list repos, analyze a repo folder, compare the graph to the current HEAD, report summary coverage and circular-dependency groups. |

### Tool schemas

```ts
resolve_context({
  task: string,                    // the actual question, in plain words
  intent?: "pinpoint" | "reference-list" | "flow" | "overview"
         | "concept" | "security-audit" | "exploratory",   // default: exploratory
  focus?: string[],                // nodeIds, symbol names or filePaths to center on
  tokenBudget?: number,            // 500..100000
  repoPath?: string,               // only for multi-repo disambiguation
  commitHash?: string,             // defaults to latest analyzed commit
})
// => { graphId, commitHash, intent, budget, origin, approxTokens,
//      packet: string, provenance: { source, commitHash, analyzedAt, hasGit } }

find_symbols({ query: string, limit?: number })   // 1..25, default 10
// => { query, total, origin, needsReanalyze, commitHash,
//      symbols: [{ nodeId, name, type, filePath, startLine, endLine,
//                   relevance, exactMatch }] }

get_node({ node: string, include?: ("metadata" | "callers" | "callees"
          | "technical" | "business" | "security" | "code")[] })
// => summaries + callers + callees for one node; add "code" for raw source

impact({ target?: string, direction?: "upstream" | "downstream" | "both",
         radius?: number, from?: string, to?: string })
// => compact file:line dependents (or commit-diff impact)

repo({ action: "list" | "analyze" | "freshness" | "health", path?: string })
```

`find_symbols` is the cheap locator; `resolve_context` is the answer. If you find
yourself calling `find_symbols` twice, call `resolve_context` instead — it does
the lookup, the expansion, and the ranking in one call.

---

## Packet format

`resolve_context` returns **line format rather than JSON**, because the packet is
the wire format: JSON nested inside a text content block re-escapes its quotes on
the way out, which measured at roughly double the cost.

```
GRAPH 75cfc0a3eb67e178 @ 911466a3cb
ANSWER 3
ANSWER registerTools (symbol) — src/mcp/tools.ts:29
WHAT This code exposes a code intelligence backend to MCP agents.
CONFIDENCE closest match for "registerTools" is "tools.ts" — verify intent
NODES 23
N1 tools.ts file src/mcp/tools.ts:1-393  m:This file belongs to the MCP integration layer.
N3 registerTools function src/mcp/tools.ts:29-393  m:This code exposes a code intelligence backend to MCP agents.
FLOW 1
N3 -calls-> N4
FILES 2
src/mcp/tools.ts  N1,N3
  L29: export function registerTools(server: McpServer) {
SEC 0
IDMAP N1=src/mcp/tools.ts::tools.ts N3=src/mcp/tools.ts::registerTools
NEXT hint
```

| Section | Contents |
| :-- | :-- |
| `ANSWER` | The top-ranked node, shaped by intent, with a one-line meaning (`WHAT`) and a `CONFIDENCE` hedge when the query was ambiguous. Degrades gracefully when a node has no summary — it never fabricates. |
| `NODES` | `N<id> name type file:startLine-endLine  m:<micro-summary>` — short ids in rank order |
| `FLOW` | `from -edge_type-> to` between included nodes |
| `FILES` | `filePath  N1,N2` for the included nodes, plus `L<n>:` matched-line snippets when the query names a symbol |
| `CODE` | Source bodies for the top nodes (off by default; `get_node` with `include=['code']` covers drill-in). Controlled by `DEVLENS_PACKET_CODE=1`. |
| `SEC` | Security-relevant micro summaries |
| `IDMAP` | Short id → real node id, so the agent can call `get_node` without re-searching |
| `NEXT` | The recommended follow-up, including ambiguity retry syntax |

Details that matter in practice:

- **Micro summaries are extracted at pack time, not stored.** The renderer takes
  the first sentence of the business summary and clips it, stripping HTML tags on
  the way. Summaries themselves stay canonical and complete on disk. Structure-only
  graphs (no summaries) degrade gracefully: the packet says so instead of inventing.
- **`FILES` shows at most 8 entries**, with the rest named as pointer lines —
  nothing silently disappears.
- **The budget is intent-shaped** (1,500 tokens for symbol/reference-list,
  2,500 for overview/flow) with dynamic scaling by repo size. If a packet still
  exceeds the request, the renderer drops the lowest-ranked node and re-renders
  until it fits, and the `NEXT` line says what was cut.
- **`approxTokens` is reported on every response**, so the caller can see the cost
  without counting.

### Packet content toggles (environment)

| Variable | Default | Effect |
| :-- | :-- | :-- |
| `DEVLENS_PACKET_META` | on | Per-node `META` segment (kind, signature, visibility, return type) |
| `DEVLENS_PACKET_CODE` | off | Add source bodies to the packet (prefer `get_node` include code) |
| `DEVLENS_PACKET_RANKER` | rrf | `legacy` = pre-fusion additive ranking (diagnostic) |
| `DEVLENS_PACKET_ANSWER` | on | `0` omits the ANSWER section (diagnostic) |

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
`biz` 1, `sec` 0.5.

Lifecycle:

- **Built on analyze.** Every `devlens analyze` and `devlens summarize` run
  rebuilds the index for the commit it touched. Failure is non-fatal.
- **Built lazily on first search.** A graph created by an older CLI has no
  `.search.json`; the first search builds it from the commit JSON on the spot and
  the response is normal. Only if the commit file itself is missing does the tool
  report `needsReanalyze`.
- **Manual:** `devlens reindex [graphId] [commitHash] [--force]`, or
  `POST /api/reindex/:graphId` on the backend server.
- **Safe to delete.** The file is derived, never a source of truth, and is
  rebuilt on demand.

A corrupt or truncated index falls back to a lazy rebuild, and a search that
still finds nothing falls back to the older substring scorer. Quality degrades
in that order; a query never errors because of index state.

---

## Examples

### The common case: one call answers the question

```json
// resolve_context({ task: "how does user authentication work" })
//   ⇒ packet (line format): ANSWER names the auth entry node with a one-line
//     meaning, NODES ranks the auth cluster, FLOW shows the call path, FILES
//     lists the involved files with matched-line snippets. approxTokens and
//     provenance included. No graphId needed.
```

### Looking up a symbol cheaply

```json
// find_symbols({ query: "createUser", limit: 5 })
//   ⇒ { symbols: [{ nodeId: "src/server/users.ts::createUser", name: "createUser",
//                   type: "FUNCTION", filePath: "src/server/users.ts",
//                   startLine: 41, endLine: 88, relevance: 1, exactMatch: true }, ...] }
```

### What breaks if I change this

```json
// impact({ target: "createUser" })
//   ⇒ compact file:line list of upstream dependents (what breaks), or use
//     resolve_context with intent "reference-list" for the packet-shaped version.
```

### Getting started: orient on a repo

```json
// repo({ action: "list" })     ⇒ analyzed repos with graphIds and commits
// repo({ action: "freshness" }) ⇒ is the graph stale vs the working tree?
```

### Understanding a node

```json
// get_node({ node: "src/auth/login.ts::loginUser" })
//   ⇒ technical + business + security summaries, callers (who uses it) and
//     callees (what it calls) with edge types — without reading the source file.

// get_node({ node: "loginUser", include: ["code"] })
//   ⇒ adds the raw source for the node's range.
```

### Impact analysis before a refactor

```json
// resolve_context({ task: "what breaks if I change getPlanCapabilities", intent: "reference-list" })
//   ⇒ packet whose FILES lead with the importing/importer files and matched lines.
```

---

## Architecture

- **MCP layer** (`src/mcp/`): tool registration and plain-text rendering
  (`packetRender.ts`), shared packet contract (`packet-shape.ts`), stdio + HTTP
  transports, graph caching.
- **Query layer** (`src/core/queries.ts`): BM25F seed search, graph expansion,
  three-way rank fusion (lexical/structural/heuristic via RRF), intent shaping,
  packet packing. Shared with the CLI so outputs never drift.
- **Storage**: `~/.devlens/graphs/{graphId}/commits/{commitHash}.json` — plain
  JSON files, no database. The derived search index lives beside it.

## Development

```bash
# Run the stdio server from source
bun run src/mcp/index.ts

# Smoke-test the handshake
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' | bun run src/mcp/index.ts
```

## Related

- [Root README](../README.md) — product overview, install, benchmarks
- [Public benchmarks](./PUBLIC-BENCHMARKS.md) — methodology and full results
