# DevLens MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the DevLens code graph to AI agents as **21 MCP tools**. Works with JavaScript, TypeScript, React, Next.js, and Node.js codebases. Bundled inside `@devlensio/cli` — no separate installation required.

---

## Why use the MCP server?

AI coding agents are powerful but blind — they read files one at a time with no sense of how your codebase fits together. The MCP server gives any MCP-compatible agent direct access to a pre-built, typed dependency graph of your JavaScript, TypeScript, React, Next.js, or Node.js codebase.

Instead of your agent grepping and re-reading files every session, it queries the graph: "what depends on this?", "show me every route", "are there circular dependencies?", "what security issues exist?" — all answered in a few tokens.

---

## Quick start

```bash
# stdio mode (for editors/agents)
devlens mcp

# Streamable HTTP mode
devlens mcp http -p 7000
```

---

## Register in your MCP client

**Claude Code:**

```bash
claude mcp add devlens -- devlens mcp
```

**Any MCP client** (Claude Desktop, Cursor, etc.):

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

---

## Available tools

| Tool | What it does |
| :-- | :-- |
| `list_analyzed_repos` | List all repositories DevLens has analyzed |
| `get_repo_overview` | Repo fingerprint — framework, stats, central nodes, route count |
| `find_nodes` | Search/filter nodes by name, type, file, severity, or score |
| `get_nodes_in_path` | All nodes in a file or directory |
| `get_node` | Full detail for one node — summaries, callers, callees, connections |
| `get_summaries` | Batch-read summaries for multiple node IDs |
| `get_node_code` | Raw source code for a node |
| `get_blast_radius` | Upstream dependents — "what breaks if I change this?" |
| `get_khop` | Downstream dependencies — "what does this depend on?" |
| `get_subgraph` | Cohesive cluster around a seed node |
| `list_cycles` | Circular dependency groups |
| `get_security_issues` | Security-flagged nodes, ranked by severity |
| `analyze` | Run the pipeline on a repo path and store the graph |
| `analyze_changes` | Difference between two analyzed commits + impact |
| `check_freshness` | Is the graph stale vs HEAD? (dirty, behind, summaries coverage) |
| `get_coverage` | Graph health report — summarized / total / by type |
| `architecture_brief` | One-call repo architecture brief — modules, routes, flows, health |
| `security_brief` | One-call prioritized security report + blast radius for highs |
| `review_pr` | One-call PR review — diff + impact + test coverage + security delta |
| `onboarding_tour` | One-call onboarding skeleton — graph-derived tour for new devs |
| `get_context` | Token-budgeted context packet — keyword-seeded retrieval + traverse |

Every tool shares the same underlying graph data — CLI and MCP outputs never drift because they use the same `src/core/` code.

---

## Examples

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

Pull summaries, callers, and callees — without reading the source file:

```json
// get_node(graphId: "abc-123", nodeId: "src/auth/login.ts::loginUser")
//   ⇒ {
//       metadata: { name: "loginUser", type: "FUNCTION", filePath: "src/auth/login.ts:42-89", score: 8.1 },
//       callers: [{ id: "src/pages/login.tsx::LoginPage", viaEdge: "CALLS", score: 6.4 }],
//       callees: [{ id: "src/lib/api.ts::post", viaEdge: "CALLS" },
//                 { id: "src/store/auth.ts::useAuthStore", viaEdge: "CALLS" }],
//       technical: "Validates credentials, calls the auth API, updates the auth store on success",
//       business: "Handles user login — the primary authentication entry point",
//       security: { severity: "high", summary: "Plain-text password logged on validation failure" }
//     }

// get_summaries(graphId: "abc-123", nodeIds: ["src/auth/login.ts::loginUser", "src/store/auth.ts::useAuthStore"])
//   ⇒ [{ ...technical, business, security for each ... }]
```

### Impact analysis before a refactor

"What breaks if I change this?":

```json
// get_blast_radius(graphId: "abc-123", nodeId: "src/store/user.ts::useUserStore")
//   ⇒ {
//       count: 14,
//       results: [{ node: { name: "ProfilePage", score: 7.2 }, viaEdge: "CALLS", distance: 1 },
//                 { node: { name: "Navbar", score: 6.8 }, viaEdge: "READS_FROM", distance: 1 },
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

### Architecture & security reviews

```json
// list_cycles(graphId: "abc-123")
//   ⇒ [{ nodes: ["src/auth/guard.ts::requireAuth", "src/session/store.ts::sessionStore"], ...}]

// get_security_issues(graphId: "abc-123", minSeverity: "high")
//   ⇒ [{ name: "loginUser", severity: "high", filePath: "src/auth/login.ts:42",
//         securitySummary: "SQL injection risk — raw query concatenation" },
//       { name: "deleteAccount", severity: "high", filePath: "src/user/settings.tsx:120",
//         securitySummary: "No CSRF token on DELETE endpoint" }]
```

### Subgraph clusters — find bounded contexts

```json
// get_subgraph(graphId: "abc-123", seedNodeId: "src/components/Navbar.tsx::Navbar")
//   ⇒ { seed: "Navbar", nodes: ["Navbar", "NavLink", "AuthBadge", "SearchBar", "MobileMenu"],
//       edges: [{ from: "Navbar", to: "NavLink", type: "PROP_PASS" },
//               { from: "Navbar", to: "SearchBar", type: "CALLS" }] }
```

### Diff two commits

```json
// analyze_changes(graphId: "abc-123", from: "abc1234", to: "def5678")
//   ⇒ { added: [{ name: "AnalyticsTracker", score: 5.0 }],
//       removed: [{ name: "OldFeatureFlag", score: 1.2 }],
//       codeChanged: [{ name: "CheckoutForm", scoreDiff: +0.8 }] }
```

---

## Architecture

```
src/mcp/
├── index.ts        # Transport setup (stdio / HTTP) + server factory
├── tools.ts        # 21 tool definitions (thin adapters over src/core)
├── helpers.ts      # Shared Zod schemas + argument coercion
└── graphCache.ts   # LRU cache — avoids reloading graphs on every call
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

---

## Related

- [DevLens OSS](https://github.com/devlensio/devlensOSS) — the parent project
- [`@devlensio/cli`](https://www.npmjs.com/package/@devlensio/cli) — the CLI that bundles this server