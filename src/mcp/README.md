# DevLens MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the DevLens code graph to AI agents as **14 MCP tools**. Works with JavaScript, TypeScript, React, Next.js, and Node.js codebases. Bundled inside `@devlensio/cli` — no separate installation required.

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
| `analyze_changes` | Difference between two analyzed commits + impact |

Every tool shares the same underlying graph data — CLI and MCP outputs never drift because they use the same `src/core/` code.

---

## Architecture

```
src/mcp/
├── index.ts        # Transport setup (stdio / HTTP) + server factory
├── tools.ts        # 14 tool definitions (thin adapters over src/core)
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