/// <reference types="bun" />
import http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { initConfig, storage } from "devlensio";
import { registerTools } from "./tools.js";
import * as q from "../core/queries.js";

const INSTRUCTIONS = [
  "WHAT THIS IS",
  "DevLens gives you a precomputed structural graph of a TypeScript/JavaScript/React/Next.js/Node.js",
  "codebase. Nodes (components, hooks, functions, routes, stores) are connected by typed edges",
  "(CALLS, IMPORTS, READS_FROM, etc.). Every node carries a TECHNICAL summary (what the code does),",
  "a BUSINESS summary (what it means for the product), and a SECURITY assessment (severity + notes).",
  "",
  "HOW TO USE THIS CONTEXT (read this carefully)",
  "Treat DevLens as your primary way to understand the codebase — query it BEFORE opening files.",
  "Use it to: locate where a feature lives, learn what a piece of code does, assess the impact and",
  "risk of a change before editing, trace how data/control flows between modules, find circular",
  "dependencies, and do security review. A node summary is ~50 tokens; the underlying file is",
  "~2000. So ALWAYS prefer summaries, and only call get_node_code for raw source when a summary is",
  "genuinely not enough (e.g. you must see exact logic to edit it). Pass `limit`, `radius`, and",
  "`include` to keep every response small.",
  "",
  "START HERE: resolve_context",
  "resolve_context is the front door and the cheapest first call for almost any question. Give it",
  "your task in plain words and an optional intent (pinpoint, reference-list, flow, overview,",
  "concept, security-audit, exploratory). It returns a task-shaped packet: ranked nodes with",
  "one-line meanings, call flow, involved files, key code bodies, security flags, and an id map,",
  "all within a token budget. blast_radius(symbol) is a cheap impact wrapper; find_symbols(query)",
  "is a cheap name lookup when you only need nodeIds plus file:line. Each response carries",
  "provenance (commit, analyzedAt, hasGit) so you can tell how fresh the graph is; a response may",
  "set needsReanalyze=true, in which case ask the user to run `devlens analyze`.",
  "",
  "GRAPHS, COMMITS, AND FRESHNESS",
  "Every tool is keyed by a `graphId`, and each graph is tied to a specific commit. A repo must be",
  "analyzed before you can query it. Before relying on a graph, check the user's working state:",
  "  - If the code matches the latest committed graph, just query it directly.",
  "  - If the user has UNCOMMITTED changes (they are working ahead of the latest commit), the",
  "    structure on disk may differ from the stored graph. Re-run `analyze` on the working tree to",
  "    refresh the STRUCTURAL graph (nodes/edges/blast-radius), but you do NOT need to re-summarize:",
  "    summaries are expensive to regenerate, so reuse the summaries from the last committed graph",
  "    and only treat newly added/changed nodes as 'no summary yet'. Structure is cheap; meaning is",
  "    expensive — refresh structure, inherit summaries.",
  "    (Note: triggering working-tree analysis from inside a session becomes available once the",
  "    DevLens CLI is packaged into DevLens OSS. Until then, analyze runs against whatever is on disk.)",
  "",
  "RECOMMENDED WORKFLOW",
  "  1. resolve_context with your task — orient and answer in one call. Use find_symbols for cheap",
  "     lookups and blast_radius for change impact. Drill into specific nodes with get_node,",
  "     and reach for get_node_code last.",
  "  2. get_node / get_neighbors — full detail for one node or its local structure when the packet", 
  "     leaves a specific question open.",
  "  3. get_security_issues, list_cycles, analyze_changes — dedicated listings when the packet's",
  "     SEC section or flow is not enough.",
].join("\n");

// Build a fully-configured MCP server (tools + instructions). Factory form so the
// HTTP transport can create its own instance(s) later without duplicating setup.
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "devlens", version: "0.1.0" },
    { instructions: INSTRUCTIONS }
  );
  registerTools(server);

  // ── Resources (A1) — cacheable, host-managed discovery ──────────────────────

  server.registerResource(
    "repos",
    "devlens://repos",
    {
      description: "All analyzed DevLens graphs (graphId, repo path, framework, latest commit)",
      mimeType: "application/json",
    },
    async () => ({
      contents: [{ uri: "devlens://repos", mimeType: "application/json", text: JSON.stringify(q.listRepos()) }],
    })
  );

  server.registerResource(
    "graph-meta",
    new ResourceTemplate("devlens://graph/{graphId}/meta", { list: undefined }),
    {
      description: "Metadata for one graph — fingerprint, commit list, summarized commits",
      mimeType: "application/json",
    },
    async (_uri, params) => {
      const graphId = Array.isArray(params.graphId) ? params.graphId[0] : params.graphId;
      const meta = storage.getGraphMeta(graphId);
      return {
        contents: [{ uri: `devlens://graph/${graphId}/meta`, mimeType: "application/json", text: JSON.stringify(meta ?? { error: "not found" }) }],
      };
    }
  );

  return server;
}

// stdout is the JSON-RPC channel for the stdio transport. initConfig() and the
// engine pipeline log via console.log → stdout, which corrupts that stream.
// Redirect stray logging to stderr. Done at START time, not module load, so that
// importing this module from the CLI does not globally hijack the CLI's stdout.
function redirectStdoutLogsToStderr(): void {
  console.log = (...args: unknown[]) => console.error(...args);
  console.info = (...args: unknown[]) => console.error(...args);
  console.debug = (...args: unknown[]) => console.error(...args);
}

// Foreground stdio MCP server — what an editor/MCP client spawns per session.
export async function startMcpStdio(): Promise<void> {
  redirectStdoutLogsToStderr();
  await initConfig();

  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[devlens-mcp] server running on stdio");
}

// Foreground Streamable HTTP MCP server — for a shared/background instance.
// Run in the foreground; background it with your own process manager (pm2,
// systemd, nohup, &). Stateless mode: a fresh server+transport per request, so
// there is no session state to manage and no registry needed.
export async function startMcpHttp(opts: { port: number }): Promise<void> {
  await initConfig();

  // Session id → transport. A session is created on the initialize request and
  // reused for that client's subsequent requests (tool calls, SSE stream).
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== "/mcp" && req.url !== "/") {
      res.writeHead(404).end();
      return;
    }

    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // GET (open SSE stream) / DELETE (terminate) for an existing session.
      if (req.method === "GET" || req.method === "DELETE") {
        const existing = sessionId ? transports.get(sessionId) : undefined;
        if (!existing) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Unknown or missing session id" }, id: null }));
          return;
        }
        await existing.handleRequest(req, res);
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }

      const body = await readJsonBody(req);
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        // No session yet — must be an initialize request. Create a session.
        if (!isInitializeRequest(body)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session id; expected initialize" }, id: null }));
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) transports.delete(transport!.sessionId);
        };
        const server = buildMcpServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error("[devlens-mcp:http] request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
      }
    }
  });

  httpServer.listen(opts.port, () => {
    console.error(`[devlens-mcp] Streamable HTTP server on http://localhost:${opts.port}/mcp`);
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : undefined;
}

// Allow `bun src/mcp/index.ts` to keep working standalone.
if (import.meta.main) {
  startMcpStdio().catch((err) => {
    console.error("[devlens-mcp] fatal:", err);
    process.exit(1);
  });
}