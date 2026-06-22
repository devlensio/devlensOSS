# `src/mcp` — the DevLens MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the DevLens graph to AI agents as **14 tools**. It's bundled into the `@devlensio/cli` binary and launched with `devlens mcp`.

> How to register and use it lives in the [root README](../../README.md#2--mcp-server). This file documents the **code**.

## Layout

```
src/mcp/
├── index.ts        # transports + server factory + bootstrap
├── tools.ts        # registerTools() — the 14 tool definitions (thin adapters over src/core)
├── helpers.ts      # shared zod schemas / arg coercion / shaping
└── graphCache.ts   # LRU cache of loaded graphs (avoids reloading per tool call)
```

## How it works

- **`buildMcpServer()`** (`index.ts`) creates an `McpServer` named `devlens`, attaches the usage **instructions** (how an agent should query the graph — overview first, prefer summaries, use blast-radius/k-hop, reach for raw code last), and calls `registerTools()`.
- **Two transports**, both in `index.ts`:
  - `startMcpStdio()` — what an editor/agent spawns per session (`devlens mcp`). It redirects `console.log`→stderr first, because stdout is the JSON-RPC channel.
  - `startMcpHttp({ port })` — a Streamable HTTP server at `/mcp` (`devlens mcp http`), with per-session transports keyed by `mcp-session-id`.
- **`tools.ts`** defines each tool as a thin adapter: validate args (zod, via `helpers.ts`) → call the matching **pure function in [`src/core`](../core)** → return the result. Because the CLI and these tools share `src/core`, **CLI ↔ MCP parity is guaranteed**.
- **`graphCache.ts`** keeps recently-loaded graphs in memory so repeated tool calls in a session don't reload from `~/.devlens`.

## The tools

`list_analyzed_repos`, `get_repo_overview`, `find_nodes`, `get_nodes_in_path`, `get_node`, `get_summaries`, `get_node_code`, `get_blast_radius`, `get_khop`, `get_subgraph`, `list_cycles`, `get_security_issues`, `analyze_changes`, and supporting tools — each mirrors a CLI query command.

## Develop

```bash
# run the stdio server from source
bun src/mcp/index.ts

# smoke-test the handshake
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | bun src/mcp/index.ts
```

## Add a tool

1. Add the pure query to `src/core` (so the CLI can use it too).
2. Register it in `tools.ts`: a zod input schema + a handler that calls the core function.
3. If it's a new capability, mention it in the server `instructions` in `index.ts` so agents know when to use it.
