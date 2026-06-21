/// <reference types="bun" />
import http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { initConfig } from "devlensio";
import { registerTools } from "./tools.js";

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
  "  1. list_analyzed_repos — find existing graphs and their graphId. If none exists for the repo",
  "     you care about, run `analyze` with its path first.",
  "  2. get_repo_overview — framework, routes, and the most central nodes. Orient here first.",
  "  3. find_nodes / get_nodes_in_path — locate the nodes relevant to your task by name, type,",
  "     file, or folder. Returns compact refs, not source.",
  "  4. get_node — full detail for one node: its summaries plus who calls it (callers) and what it",
  "     calls (callees). This is your main inspection tool.",
  "  5. get_blast_radius — UPSTREAM impact: what depends on a node ('if I change this, what breaks').",
  "     get_khop — DOWNSTREAM: what a node depends on. Both default to radius 2; when radius is",
  "     omitted and a node's direct fan-out is >=100 they return hop-1 only and set truncated=true —",
  "     re-call with an explicit `radius` to go deeper, uncapped.",
  "  6. get_summaries — batch-fetch summaries for a list of node ids (e.g. blast-radius results).",
  "  7. get_subgraph, list_cycles, get_security_issues, analyze_changes — cluster context, circular",
  "     dependencies, security review, and commit-to-commit impact.",
  "",
  "Rule of thumb: start broad and cheap (overview, find_nodes), drill into specific nodes with",
  "get_node, expand impact with blast_radius/khop, and reach for get_node_code last.",
].join("\n");

// Build a fully-configured MCP server (tools + instructions). Factory form so the
// HTTP transport can create its own instance(s) later without duplicating setup.
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "devlens", version: "0.1.0" },
    { instructions: INSTRUCTIONS }
  );
  registerTools(server);
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