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
  "codebase. Nodes (components, hooks, functions, routes, stores) are connected by typed edges.",
  "Every node carries TECHNICAL, BUSINESS and SECURITY summaries, and tool responses are plain",
  "line-oriented text (no JSON to parse).",
  "",
  "ROUTING RULE (important)",
  "For ANY where-is-it / how-does-it-work / what-does-this-mean / who-depends-on-it question, call",
  "resolve_context FIRST — do not start with grep/read. The packet answers in one call what would",
  "otherwise cost several grep+read rounds. Grep only for exact-string sweeps DevLens cannot do",
  "(e.g. finding every literal occurrence of a string constant).",
  "",
  "THE FIVE TOOLS",
  "  resolve_context(task, intent?)  — THE front door: ranked nodes with one-line meanings, call flow,",
  "      involved files, code bodies of the top 10 nodes, security flags, id map. Start here.",
  "  find_symbols(query)             — cheap BM25F lookup; ranked nodeIds with path:line refs.",
  "  get_node(node, include?)        — one node's summaries/callers/callees; include=['code'] for source.",
  "  impact(target|from+to)          — what breaks if this changes (upstream) / what it depends on",
  "      (downstream) / commit-range diff impact.",
  "  repo(action)                    — list / analyze / freshness / health for the graph itself.",
  "",
  "NO graphId NEEDED: the graph is resolved from your working folder. Pass repoPath only if several",
  "repos are analyzed and the folder is ambiguous.",
  "",
  "FRESHNESS",
  "If the user has UNCOMMITTED changes, node/line data may lag the working tree. Structure refresh is",
  "cheap, summaries are expensive: run repo(action='analyze') to refresh structure and inherit old",
  "summaries for unchanged nodes; treat newly added nodes as 'no summary yet'.",
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