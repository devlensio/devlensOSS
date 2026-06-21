import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as q from "../core/queries.js";
import { ok, fail } from "./helpers.js";

// Adapters: run a core query and wrap the result as an MCP content block.
// All query logic lives in src/core/queries.ts so the CLI shares it verbatim.
const run = (fn: () => unknown) => {
  try {
    return ok(fn());
  } catch (e) {
    return fail((e as Error).message);
  }
};
const runAsync = async (fn: () => Promise<unknown>) => {
  try {
    return ok(await fn());
  } catch (e) {
    return fail((e as Error).message);
  }
};

export function registerTools(server: McpServer) {

  //  1. list_analyzed_repos
  server.registerTool(
    "list_analyzed_repos",
    {
      description: "List repositories DevLens has already analyzed. Returns each graphId, repo path, framework, and commit count. Call this first to discover what graphs exist — every other tool needs a graphId.",
      inputSchema: {},
    },
    async () => run(() => q.listRepos())
  );

  //  2. get_repo_overview
  server.registerTool(
    "get_repo_overview",
    {
      description: "High-level orientation for one repo: framework/language fingerprint, route count, and the highest-scoring (most central) nodes. Use this instead of reading package.json or scanning directories.",
      inputSchema: {
        graphId: z.string().describe("Graph id from list_analyzed_repos"),
        commitHash: z.string().optional().describe("Defaults to latest commit"),
      },
    },
    async ({ graphId, commitHash }) => run(() => q.repoOverview(graphId, commitHash))
  );

  //  3. find_nodes
  server.registerTool(
    "find_nodes",
    {
      description: "Search/filter nodes in a graph. Returns COMPACT refs (id, name, type, path, score, 1-line summary) — not source. Combine filters (AND). Use nodeIds for an exact batch fetch. Results are score-ranked and capped by `limit` (default 25).",
      inputSchema: {
        graphId: z.string(),
        name: z.string().optional().describe("Substring match on node name"),
        nodeIds: z.array(z.string()).optional().describe("Exact ids to resolve; ignores other filters"),
        nodeTypes: z.array(z.string()).optional().describe("e.g. COMPONENT, HOOK, FUNCTION, ROUTE"),
        filePath: z.string().optional().describe("Nodes in exactly this file"),
        dir: z.string().optional().describe("Nodes under this folder (prefix)"),
        minScore: z.number().optional(),
        severity: z.enum(["low", "medium", "high"]).optional().describe("Min security severity"),
        limit: z.number().optional().describe("Default 25"),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, commitHash, ...filters }) => run(() => q.findNodes(graphId, filters, commitHash))
  );

  //  4. get_nodes_in_path
  server.registerTool(
    "get_nodes_in_path",
    {
      description: "List all nodes in a specific FILE or FOLDER. Pass a file path for one file's nodes, or a folder path for everything beneath it (recursive). Great for orienting in an unfamiliar area of the codebase.",
      inputSchema: {
        graphId: z.string(),
        path: z.string().describe("A file (src/api/users.ts) or folder (src/api)"),
        nodeTypes: z.array(z.string()).optional(),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, path: p, nodeTypes, commitHash }) => run(() => q.nodesInPath(graphId, p, nodeTypes, commitHash))
  );

  //  5. get_node
  server.registerTool(
    "get_node",
    {
      description: "Full detail for ONE node: metadata, callers (who depends on it), callees (what it calls), and its technical/business/security summaries. Returns precomputed summaries (~50 tokens) instead of source — use this before opening a file. `include` selects which sections; default = everything. `edgeTypes` filters callers/callees by edge kind.",
      inputSchema: {
        graphId: z.string(),
        nodeId: z.string(),
        include: z.array(z.enum(["metadata", "callers", "callees", "technical", "business", "security"]))
          .optional().describe("Default: all sections"),
        edgeTypes: z.array(z.string()).optional().describe("Restrict callers/callees to these edge types"),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, nodeId, include, edgeTypes, commitHash }) =>
      run(() => q.getNodeDetail(graphId, nodeId, include, edgeTypes, commitHash))
  );

  //  6. get_summaries
  server.registerTool(
    "get_summaries",
    {
      description: "Batch-fetch summaries for many nodes at once. Pass the nodeIds (e.g. from a blast-radius result) and get their technical/business/security summaries in one call — far cheaper than reading each file. `include` defaults to all three.",
      inputSchema: {
        graphId: z.string(),
        nodeIds: z.array(z.string()),
        include: z.array(z.enum(["technical", "business", "security"])).optional(),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, nodeIds, include, commitHash }) => run(() => q.getSummariesFor(graphId, nodeIds, include, commitHash))
  );

  //  7. get_node_code
  server.registerTool(
    "get_node_code",
    {
      description: "Raw source code for a node. EXPENSIVE in tokens — only call when the summary from get_node is not enough. Returns the exact line range from the analyzed commit.",
      inputSchema: {
        graphId: z.string(),
        nodeId: z.string(),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, nodeId, commitHash }) => run(() => q.getNodeCodeFor(graphId, nodeId, commitHash))
  );

  //  8. get_security_issues
  server.registerTool(
    "get_security_issues",
    {
      description: "List nodes flagged with a security concern at or above `minSeverity` (default 'low'), ranked by severity then score. Each entry includes the security summary. Use for security review without scanning the whole codebase.",
      inputSchema: {
        graphId: z.string(),
        minSeverity: z.enum(["low", "medium", "high"]).optional(),
        limit: z.number().optional().describe("Default 50"),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, minSeverity, limit, commitHash }) => run(() => q.securityIssues(graphId, minSeverity, limit, commitHash))
  );

  //  9. get_blast_radius — upstream dependents
  server.registerTool(
    "get_blast_radius",
    {
      description: "Impact analysis: the UPSTREAM nodes that depend on the target (who calls/uses it). Answers 'if I change this node, what could break'. Each result carries its hop distance. `radius` defaults to 2; when omitted and the direct (hop-1) fanout is >=100, it returns hop-1 only and sets truncated=true — re-call with an explicit `radius` to traverse deeper, uncapped.",
      inputSchema: {
        graphId: z.string(),
        nodeId: z.string(),
        radius: z.number().optional().describe("Hops to traverse. Default 2 (capped); explicit value is uncapped."),
        edgeTypes: z.array(z.string()).optional().describe("Restrict traversal to these edge types"),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, nodeId, radius, edgeTypes, commitHash }) => run(() => q.blastRadius(graphId, nodeId, radius, edgeTypes, commitHash))
  );

  //  10. get_khop — downstream dependencies
  server.registerTool(
    "get_khop",
    {
      description: "Dependency expansion: the DOWNSTREAM nodes the target calls/uses, out to `radius` hops. Answers 'what does this node depend on'. Same radius/cap behavior as get_blast_radius (default 2, capped at hop-1 fanout >=100 unless radius is explicit).",
      inputSchema: {
        graphId: z.string(),
        nodeId: z.string(),
        radius: z.number().optional().describe("Hops to traverse. Default 2 (capped); explicit value is uncapped."),
        edgeTypes: z.array(z.string()).optional().describe("Restrict traversal to these edge types"),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, nodeId, radius, edgeTypes, commitHash }) => run(() => q.kHop(graphId, nodeId, radius, edgeTypes, commitHash))
  );

  //  11. get_subgraph — cohesive cluster around a node
  server.registerTool(
    "get_subgraph",
    {
      description: "Return the cohesive cluster (feature/module) that the seed node belongs to: its sibling nodes plus the edges internal to that cluster. Use to understand the bounded context around a node without pulling the whole graph.",
      inputSchema: {
        graphId: z.string(),
        seedNodeId: z.string(),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, seedNodeId, commitHash }) => run(() => q.subgraph(graphId, seedNodeId, commitHash))
  );

  //  12. list_cycles — cyclic dependency groups
  server.registerTool(
    "list_cycles",
    {
      description: "List groups of nodes that form cyclic dependencies (circular imports/calls). Useful for spotting refactor hotspots and tangled modules. Each group lists the participating nodes.",
      inputSchema: {
        graphId: z.string(),
        commitHash: z.string().optional(),
      },
    },
    async ({ graphId, commitHash }) => run(() => q.cycles(graphId, commitHash))
  );

  //  13. analyze — run the pipeline on a repo path and store the graph
  server.registerTool(
    "analyze",
    {
      description: "Analyze a repository at a local path (or GitHub URL) into a DevLens graph and persist it. Returns the graphId, commit, and compact stats — NOT the node dump. Run this once before using the query tools on a new repo.",
      inputSchema: {
        path: z.string().describe("Local repo path or GitHub URL"),
        isGithubRepo: z.boolean().optional().describe("Default false"),
      },
    },
    async ({ path: repoPath, isGithubRepo }) => runAsync(() => q.analyzeRepo(repoPath, isGithubRepo ?? false))
  );

  //  14. analyze_changes — diff two commits + blast radius of what changed
  server.registerTool(
    "analyze_changes",
    {
      description: "Compare two analyzed commits and report what changed (added/removed/code-changed/score-changed nodes). For added and code-changed nodes it also computes the upstream blast radius so you can see the impact of the change set. Both commits must already be analyzed.",
      inputSchema: {
        graphId: z.string(),
        from: z.string().describe("Older commit hash"),
        to: z.string().describe("Newer commit hash"),
        radius: z.number().optional().describe("Blast-radius hops for changed nodes. Default 1."),
      },
    },
    async ({ graphId, from, to, radius }) => run(() => q.analyzeChanges(graphId, from, to, radius))
  );
}