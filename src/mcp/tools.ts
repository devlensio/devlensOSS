import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as q from "../core/queries.js";
import { textOut, failText } from "./helpers.js";
import { compactCodeLines } from "./packetRender.js";

// mcp-compact-test: the 24-tool surface is consolidated to FIVE tools.
//
//   resolve_context  — the answer packet (all intents; includes code bodies)
//   find_symbols     — cheap BM25F symbol lookup (compact refs)
//   get_node         — one node's detail, code opt-in
//   impact           — blast radius / k-hop / commit-range changes, merged
//   repo             — graph lifecycle: list / analyze / freshness / health
//
// Two structural changes vs main:
//   1. NO graphId parameter anywhere. The graph is resolved from the working
//      folder (the graph index stores each graph's repoPath); `repoPath` is an
//      optional disambiguator. This kills the list_analyzed_repos discovery
//      call, which measured 15k chars in the dub benchmark.
//   2. ALL responses are plain line-oriented text (no JSON envelope, no
//      pretty-printing, no escaping). Cloud parity: one text block, errors are
//      "ERROR <code>: <message>" + a TRY line.

interface GraphEntry {
  graphId: string;
  repoPath: string;
  framework?: string;
  language?: string;
  latestCommit?: string;
  commitCount?: number;
}

const normPath = (p: string) => p.replace(/\/+$/, "");

function resolveGraph(repoPath?: string): GraphEntry {
  const graphs = q.listRepos() as unknown as GraphEntry[];
  if (!graphs || graphs.length === 0) {
    throw new q.DevLensError("NO_GRAPHS", "No analyzed graphs exist yet. Use repo(action='analyze', path='<repo folder>') first.", "repo", { action: "analyze" });
  }
  const target = normPath(repoPath ?? process.cwd());
  const base = target.split("/").filter(Boolean).pop() ?? target;
  const hit =
    graphs.find((g) => normPath(g.repoPath) === target) ??                       // exact
    graphs.find((g) => {                                                          // nested either way
      const rp = normPath(g.repoPath);
      return target.startsWith(rp + "/") || rp.startsWith(target + "/");
    }) ??
    graphs.find((g) => normPath(g.repoPath).endsWith("/" + base));                // folder name
  if (hit) return hit;
  if (graphs.length === 1) return graphs[0];
  throw new q.DevLensError(
    "GRAPH_AMBIGUOUS",
    `No analyzed graph matches "${target}". Analyzed repos:\n` +
      graphs.map((g) => `- ${g.repoPath}`).join("\n") +
      `\nPass repoPath to disambiguate, or run repo(action='analyze').`,
    "repo",
    { action: "list" }
  );
}

const runText = (fn: () => string) => {
  try {
    return textOut(fn());
  } catch (e) {
    if (e instanceof q.DevLensError) {
      return failText(e.message, e.code, e.suggestedTool, e.suggestedArgs);
    }
    return failText((e as Error).message);
  }
};
const runTextAsync = async (fn: () => Promise<string>) => {
  try {
    return textOut(await fn());
  } catch (e) {
    if (e instanceof q.DevLensError) {
      return failText(e.message, e.code, e.suggestedTool, e.suggestedArgs);
    }
    return failText((e as Error).message);
  }
};

// ── text renderers ───────────────────────────────────────────────────────────

function renderFindSymbols(res: Awaited<ReturnType<typeof q.findSymbols>>): string {
  const lines = [`SYMBOLS ${res.total}  query="${res.query}"${res.needsReanalyze ? "  NOTE: graph has no search index; run repo(action='analyze')" : ""}`];
  res.symbols.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.name} ${s.type.toLowerCase()} ${s.filePath}:${s.startLine}-${s.endLine} rel:${s.relevance}${s.exactMatch ? " exact" : ""}`);
  });
  if (res.total === 0) lines.push("(no matches — try a shorter query or different wording)");
  return lines.join("\n");
}

function renderGraphNode(
  res: ReturnType<typeof q.getNodeDetail> & { code?: string; codeSource?: string },
  filePath: string,
  span: string
): string {
  const lines: string[] = [];
  lines.push(`NODE ${res.name} ${String(res.type).toLowerCase()} ${filePath}:${span} score:${res.score}`);
  const meta = res.metadata as Record<string, unknown> | undefined;
  if (meta && Object.keys(meta).length) {
    lines.push(`METADATA ${JSON.stringify(meta)}`);
  }
  if (res.technicalSummary) lines.push(`TECHNICAL ${String(res.technicalSummary).replace(/\s+/g, " ").slice(0, 300)}`);
  if (res.businessSummary) lines.push(`BUSINESS ${String(res.businessSummary).replace(/\s+/g, " ").slice(0, 300)}`);
  const sec = res.security as { severity?: string; notes?: string } | undefined;
  if (sec) lines.push(`SECURITY ${sec.severity ?? "none"} ${sec.notes ? `— ${String(sec.notes).replace(/\s+/g, " ").slice(0, 200)}` : ""}`.trim());
  const refs = (arr: unknown, label: string) => {
    const list = Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [];
    if (!list.length) return;
    lines.push(`${label} ${list.length}`);
    for (const r of list.slice(0, 25)) {
      lines.push(`  ${r.name ?? r.id} ${String(r.type ?? "").toLowerCase()} ${r.filePath}:${r.lines ?? ""}${r.hop !== undefined ? ` hop:${r.hop}` : ""}${r.viaEdge ? ` via:${r.viaEdge}` : ""}`);
    }
    if (list.length > 25) lines.push(`  ... (+${list.length - 25} more)`);
  };
  refs(res.callers, "CALLERS");
  refs(res.callees, "CALLEES");
  if (res.code) {
    lines.push(`CODE ${filePath}:${span}`);
    const { text, total } = compactCodeLines(String(res.code).split("\n"), 120);
    lines.push(text);
    if (total > 120) lines.push(`(code capped at 120 compacted lines; call include=['code'] again or read ${filePath} for the rest)`);
  }
  return lines.join("\n");
}

function renderImpact(res: ReturnType<typeof q.blastRadius>, label: string): string {
  const lines = [
    `${label} ${res.count}  radius:${res.radiusUsed ?? "?"}${res.truncated ? " TRUNCATED (re-call with explicit radius for more)" : ""}`,
  ];
  for (const n of res.nodes as Array<Record<string, unknown>>) {
    lines.push(`${n.name ?? n.id} ${String(n.type ?? "").toLowerCase()} ${n.filePath}:${n.lines ?? ""} hop:${n.hop}${n.viaEdge ? ` via:${n.viaEdge}` : ""}`);
  }
  if (res.count === 0) lines.push("(no reachable nodes — the target may be isolated or the direction has no edges)");
  return lines.join("\n");
}

// ── tool registration ────────────────────────────────────────────────────────

export function registerTools(server: McpServer) {

  //  1. resolve_context — THE front door
  server.registerTool(
    "resolve_context",
    {
      description:
        "THE front door. For ANY where/how/what/who-depends-on question call this FIRST instead of grep. " +
        "One call returns a task-shaped packet: ranked nodes with one-line meanings, call flow, involved files, " +
        "code bodies of the top 10 nodes, security flags, and an id map, within a token budget. " +
        "Intents: pinpoint, reference-list, flow, overview, concept, security-audit, exploratory (default). " +
        "The repo is resolved from the working folder — no graphId needed.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        task: z.string().min(1).describe("The actual question or task, in plain words"),
        intent: z.enum(["pinpoint", "reference-list", "flow", "overview", "concept", "security-audit", "exploratory"]).optional().describe("Default exploratory"),
        focus: z.array(z.string()).optional().describe("nodeIds, symbol names or filePaths to center the packet on"),
        tokenBudget: z.number().optional().describe("500..100000; default scales with repo size. Code bodies ride on top of this budget."),
        repoPath: z.string().optional().describe("Only needed when several repos are analyzed and the working folder is ambiguous"),
        commitHash: z.string().optional().describe("Defaults to latest analyzed commit"),
      },
    },
    async ({ task, intent, focus, tokenBudget, repoPath, commitHash }) =>
      runText(() => {
        const { graphId } = resolveGraph(repoPath);
        const res = q.resolveContext(graphId, { task, intent, focus, tokenBudget }, commitHash) as Record<string, unknown>;
        return String(res.packet ?? "");
      })
  );

  //  2. find_symbols — cheap locator
  server.registerTool(
    "find_symbols",
    {
      description:
        "Cheap symbol lookup by name, path fragment, or concept words (lexical BM25F). " +
        "Returns ranked nodeIds with path:line refs — no code, no structure. " +
        "Use it to locate a symbol; use resolve_context when you need meaning, flow, or code.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        query: z.string().min(1).describe("Symbol name, identifier, path fragment, or concept words"),
        limit: z.number().optional().describe("1..25, default 10"),
        summaryType: z.enum(["technical", "business", "both"]).optional().describe("Which summaries to weight in ranking, default both"),
        repoPath: z.string().optional(),
        commitHash: z.string().optional(),
      },
    },
    async ({ query, limit, summaryType, repoPath, commitHash }) =>
      runText(() => {
        const { graphId } = resolveGraph(repoPath);
        return renderFindSymbols(q.findSymbols(graphId, { query, limit, summaryType }, commitHash));
      })
  );

  //  3. get_node — one node, code opt-in
  server.registerTool(
    "get_node",
    {
      description:
        "Full detail for ONE node: technical/business/security summaries, callers (who uses it), callees (what it calls). " +
        "Pass a nodeId from resolve_context/find_symbols, or a symbol name to auto-locate. " +
        "include=['code'] adds the raw source. Prefer this over reading whole files.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        node: z.string().min(1).describe("nodeId, or a symbol/file name to locate first"),
        include: z.array(z.enum(["metadata", "callers", "callees", "technical", "business", "security", "code"])).optional().describe("Default: summaries + callers + callees. Add 'code' for raw source."),
        edgeTypes: z.array(z.string()).optional().describe("Restrict callers/callees to these edge types"),
        repoPath: z.string().optional(),
        commitHash: z.string().optional(),
      },
    },
    async ({ node, include, edgeTypes, repoPath, commitHash }) =>
      runText(() => {
        const { graphId } = resolveGraph(repoPath);
        // Accept a raw nodeId, or locate by name via BM25F (exact matches win).
        const wantCode = include?.includes("code") ?? false;
        const inc = (include ?? ["metadata", "callers", "callees", "technical", "business", "security"])
          .filter((k) => k !== "code") as q.NodeInclude[];
        let detail: ReturnType<typeof q.getNodeDetail>;
        let filePath = "";
        let span = "";
        try {
          detail = q.getNodeDetail(graphId, node, inc, edgeTypes, commitHash);
          filePath = String(detail.filePath);
          span = String(detail.lines);
        } catch {
          const found = q.findSymbols(graphId, { query: node, limit: 1 }, commitHash);
          const hit = found.symbols[0];
          if (!hit) throw new q.DevLensError("NOT_FOUND", `No node matches "${node}" (tried id and symbol search).`, "find_symbols", { query: node });
          detail = q.getNodeDetail(graphId, hit.nodeId, inc, edgeTypes, commitHash);
          filePath = String(detail.filePath);
          span = String(detail.lines);
        }
        const out: Record<string, unknown> = { ...detail };
        if (wantCode) {
          const codeRes = q.getNodeCodeFor(graphId, String(detail.id), commitHash) as { code?: string; source?: string };
          out.code = codeRes.code;
          out.codeSource = codeRes.source;
        }
        return renderGraphNode(out as Parameters<typeof renderGraphNode>[0], filePath, span);
      })
  );

  //  4. impact — blast radius + k-hop + commit-range, merged
  server.registerTool(
    "impact",
    {
      description:
        "Change impact. Default: the UPSTREAM dependents of a symbol/node (what breaks if it changes); " +
        "direction='downstream' for what it depends on. radius controls hops (default 2; hub-fanout auto-caps at 1 unless explicit). " +
        "Pass from+to commit hashes instead of a target to diff two analyzed commits with per-change impact. " +
        "Returns compact file:line refs.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        target: z.string().optional().describe("nodeId, symbol name, or file path (required unless from/to given)"),
        direction: z.enum(["upstream", "downstream", "both"]).optional().describe("Default upstream (who depends on it). 'both' runs both traversals."),
        radius: z.number().optional().describe("Hops. Default 2, capped at hub fanout; explicit value is uncapped."),
        from: z.string().optional().describe("Older commit hash — commit-range diff mode"),
        to: z.string().optional().describe("Newer commit hash — commit-range diff mode"),
        diffRadius: z.number().optional().describe("Blast-radius hops for changed nodes in diff mode. Default 1."),
        repoPath: z.string().optional(),
        commitHash: z.string().optional(),
      },
    },
    async ({ target, direction, radius, from, to, diffRadius, repoPath, commitHash }) =>
      runText(() => {
        const { graphId } = resolveGraph(repoPath);
        if (from && to) {
          const changes = q.analyzeChanges(graphId, from, to, diffRadius ?? 1) as Record<string, unknown>;
          const lines = [`CHANGES ${from.slice(0, 10)}..${to.slice(0, 10)}`];
          for (const bucket of ["added", "removed", "codeChanged", "scoreChanged"] as const) {
            const arr = changes[bucket] as Array<Record<string, unknown>> | undefined;
            if (!arr?.length) continue;
            lines.push(`${bucket.toUpperCase()} ${arr.length}`);
            for (const c of arr.slice(0, 40)) {
              lines.push(`  ${c.name ?? c.id} ${String(c.type ?? "").toLowerCase()} ${c.filePath ?? ""}:${c.lines ?? c.startLine ?? ""}${c.blastRadius ? ` impact:${(c.blastRadius as Array<unknown>).length} dependents` : ""}`);
            }
          }
          return lines.join("\n");
        }
        if (!target) {
          throw new q.DevLensError("VALIDATION_FAILED", "impact needs `target` (symbol/nodeId/path) or a commit range (from+to).");
        }
        // Resolve target: nodeId, else symbol name, else file path.
        let nodeId = target;
        const dirs = direction ?? "upstream";
        const resolveId = (): string => {
          const found = q.findSymbols(graphId, { query: target, limit: 1 }, commitHash);
          const hit = found.symbols[0];
          if (!hit) throw new q.DevLensError("NOT_FOUND", `No node matches "${target}".`, "find_symbols", { query: target });
          return hit.nodeId;
        };
        const parts: string[] = [];
        const run1 = (dir: "upstream" | "downstream") => {
          try {
            const res = dir === "upstream"
              ? q.blastRadius(graphId, nodeId, radius, undefined, commitHash)
              : q.kHop(graphId, nodeId, radius, undefined, commitHash);
            parts.push(renderImpact(res, dir === "upstream" ? `UPSTREAM (dependents)` : "DOWNSTREAM (dependencies)"));
          } catch {
            nodeId = resolveId();
            const res = dir === "upstream"
              ? q.blastRadius(graphId, nodeId, radius, undefined, commitHash)
              : q.kHop(graphId, nodeId, radius, undefined, commitHash);
            parts.push(renderImpact(res, dir === "upstream" ? `UPSTREAM (dependents)` : "DOWNSTREAM (dependencies)"));
          }
        };
        if (dirs === "both") { run1("upstream"); run1("downstream"); }
        else run1(dirs);
        parts.unshift(`IMPACT ${target} → ${nodeId}`);
        return parts.join("\n");
      })
  );

  //  5. repo — graph lifecycle
  server.registerTool(
    "repo",
    {
      description:
        "Manage analyzed graphs. action='list' shows analyzed repos (one line each); action='analyze' indexes a repo folder " +
        "(run once per repo, or after large structural changes); action='freshness' compares the graph to the current HEAD; " +
        "action='health' reports summary coverage and circular-dependency groups. Repo resolved from the working folder when omitted.",
      annotations: { readOnlyHint: false, idempotentHint: false },
      inputSchema: {
        action: z.enum(["list", "analyze", "freshness", "health"]).describe("list | analyze | freshness | health"),
        path: z.string().optional().describe("For analyze: local repo path (or GitHub URL with isGithubRepo=true)"),
        isGithubRepo: z.boolean().optional().describe("For analyze: path is a GitHub URL"),
        repoPath: z.string().optional().describe("For freshness/health: disambiguate the graph"),
      },
    },
    async ({ action, path: analyzePath, isGithubRepo, repoPath }) =>
      action === "analyze"
        ? runTextAsync(async () => {
            if (!analyzePath) throw new q.DevLensError("VALIDATION_FAILED", "repo(action='analyze') needs path='<repo folder>'.");
            const res = await q.analyzeRepo(analyzePath, isGithubRepo ?? false) as Record<string, unknown>;
            const stats = (res.stats ?? {}) as Record<string, number>;
            return [
              `ANALYZED ${res.graphId ?? "?"}`,
              `repo ${analyzePath}  commit ${String(res.commitHash ?? "").slice(0, 10)}`,
              `nodes ${stats.totalNodesAfterFilter ?? "?"}  edges ${stats.totalEdgesAfterFilter ?? "?"}`,
            ].join("\n");
          })
        : runText(() => {
            const { graphId } = repoPath ? resolveGraph(repoPath) : { graphId: "" };
            if (action === "list") {
              const graphs = q.listRepos() as unknown as GraphEntry[];
              const lines = [`REPOS ${graphs.length}`];
              for (const g of graphs) {
                lines.push(`${g.graphId}  ${g.repoPath}  ${g.framework ?? g.language ?? ""}  commit:${String(g.latestCommit ?? "").slice(0, 10)}  graphs:${g.commitCount ?? 1}`);
              }
              return lines.join("\n");
            }
            if (!graphId) throw new q.DevLensError("VALIDATION_FAILED", `repo(action='${action}') needs repoPath to identify the graph (several repos analyzed).`, "repo", { action: "list" });
            if (action === "freshness") {
              const f = q.checkFreshness(graphId) as Record<string, unknown>;
              return [
                `FRESHNESS ${graphId}`,
                ...Object.entries(f).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`),
              ].join("\n");
            }
            // health
            const cov = q.getCoverage(graphId) as Record<string, unknown>;
            const cyc = q.cycles(graphId) as { total: number; cycles: Array<{ size: number; nodes: Array<{ name?: string; filePath?: string }> }> };
            const lines = [`HEALTH ${graphId}`];
            lines.push(`coverage: ${JSON.stringify(cov)}`);
            lines.push(`cycles: ${cyc.total}`);
            for (const c of cyc.cycles.slice(0, 5)) {
              lines.push(`  cycle(${c.size}): ${c.nodes.map((n) => n.name ?? n.filePath).join(" -> ")}`);
            }
            return lines.join("\n");
          })
  );
}
