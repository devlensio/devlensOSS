import type { Command } from "commander";
import * as q from "../../core/queries.js";
import type { Severity, SummaryKind } from "../../mcp/helpers.js";
import { withGlobalFlags } from "../options.js";
import { emit, die } from "../output.js";
import { resolveGraphId } from "../graphResolve.js";

// Run a core query and emit, converting thrown errors into a clean exit.
const run = (fn: () => unknown) => {
  try {
    emit(fn());
  } catch (e) {
    die((e as Error).message);
  }
};

const intOr = (v: string | undefined, d?: number) => (v === undefined ? d : parseInt(v, 10));

// All read/query commands. Thin adapters over src/core/queries.ts — identical
// logic to the MCP tools, so CLI and agent output never diverge.
export function registerQueryCommands(program: Command): void {
  withGlobalFlags(
    program
      .command("overview")
      .description("Repo fingerprint, stats, and most-central nodes")
      .option("-g, --graph <id>", "graph id (default: graph for cwd)")
      .option("-c, --commit <hash>", "commit hash")
      .action((o) => run(() => q.repoOverview(resolveGraphId(o.graph), o.commit)))
  );

  withGlobalFlags(
    program
      .command("top-nodes")
      .description("Highest-scoring (most central) nodes")
      .option("-g, --graph <id>")
      .option("-l, --limit <n>", "max nodes", "25")
      .option("-c, --commit <hash>")
      .action((o) => run(() => q.topNodes(resolveGraphId(o.graph), intOr(o.limit, 25), o.commit)))
  );

  withGlobalFlags(
    program
      .command("find-nodes")
      .description("Search / filter nodes (compact refs, not source)")
      .argument("[name]", "substring match on node name")
      .option("-g, --graph <id>")
      .option("-t, --type <types...>", "node types (COMPONENT, HOOK, FUNCTION, ROUTE, ...)")
      .option("-f, --file <path>", "nodes in exactly this file")
      .option("-d, --dir <path>", "nodes under this folder (prefix)")
      .option("--node-ids <ids...>", "exact node ids to fetch")
      .option("--min-score <n>")
      .option("--severity <sev>", "min security severity (low|medium|high)")
      .option("-l, --limit <n>", "max results", "25")
      .option("-c, --commit <hash>")
      .action((name, o) =>
        run(() =>
          q.findNodes(
            resolveGraphId(o.graph),
            {
              name,
              nodeIds: o.nodeIds,
              nodeTypes: o.type,
              filePath: o.file,
              dir: o.dir,
              minScore: o.minScore ? parseFloat(o.minScore) : undefined,
              severity: o.severity as Severity | undefined,
              limit: intOr(o.limit, 25),
            },
            o.commit
          )
        )
      )
  );

  withGlobalFlags(
    program
      .command("nodes-in-path")
      .description("All nodes in a file or folder")
      .argument("<path>", "file or folder path")
      .option("-g, --graph <id>")
      .option("-t, --type <types...>")
      .option("-c, --commit <hash>")
      .action((p, o) => run(() => q.nodesInPath(resolveGraphId(o.graph), p, o.type, o.commit)))
  );

  withGlobalFlags(
    program
      .command("get-node")
      .description("Full detail for one node: summaries, callers, callees")
      .argument("<nodeId>")
      .option("-g, --graph <id>")
      .option("-i, --include <sections...>", "metadata|callers|callees|technical|business|security")
      .option("-e, --edge-types <types...>")
      .option("-c, --commit <hash>")
      .action((nodeId, o) =>
        run(() => q.getNodeDetail(resolveGraphId(o.graph), nodeId, o.include as q.NodeInclude[] | undefined, o.edgeTypes, o.commit))
      )
  );

  withGlobalFlags(
    program
      .command("get-summaries")
      .description("Batch summaries for a list of node ids")
      .argument("<nodeIds...>")
      .option("-g, --graph <id>")
      .option("-i, --include <kinds...>", "technical|business|security")
      .option("-c, --commit <hash>")
      .action((nodeIds, o) =>
        run(() => q.getSummariesFor(resolveGraphId(o.graph), nodeIds, o.include as SummaryKind[] | undefined, o.commit))
      )
  );

  withGlobalFlags(
    program
      .command("node-code")
      .description("Raw source for a node (EXPENSIVE — prefer get-node)")
      .argument("<nodeId>")
      .option("-g, --graph <id>")
      .option("-c, --commit <hash>")
      .action((nodeId, o) => run(() => q.getNodeCodeFor(resolveGraphId(o.graph), nodeId, o.commit)))
  );

  withGlobalFlags(
    program
      .command("blast-radius")
      .description("Upstream dependents (impact) of a node")
      .argument("<nodeId>")
      .option("-g, --graph <id>")
      .option("-r, --radius <n>", "hops (default 2, capped; explicit value uncapped)")
      .option("-e, --edge-types <types...>")
      .option("-c, --commit <hash>")
      .action((nodeId, o) =>
        run(() => q.blastRadius(resolveGraphId(o.graph), nodeId, intOr(o.radius), o.edgeTypes, o.commit))
      )
  );

  withGlobalFlags(
    program
      .command("khop")
      .description("Downstream dependencies of a node")
      .argument("<nodeId>")
      .option("-g, --graph <id>")
      .option("-r, --radius <n>", "hops (default 2, capped; explicit value uncapped)")
      .option("-e, --edge-types <types...>")
      .option("-c, --commit <hash>")
      .action((nodeId, o) =>
        run(() => q.kHop(resolveGraphId(o.graph), nodeId, intOr(o.radius), o.edgeTypes, o.commit))
      )
  );

  withGlobalFlags(
    program
      .command("subgraph")
      .description("Cohesive cluster around a seed node")
      .argument("<seedNodeId>")
      .option("-g, --graph <id>")
      .option("-c, --commit <hash>")
      .action((seed, o) => run(() => q.subgraph(resolveGraphId(o.graph), seed, o.commit)))
  );

  withGlobalFlags(
    program
      .command("cycles")
      .description("Cyclic dependency groups")
      .option("-g, --graph <id>")
      .option("-c, --commit <hash>")
      .action((o) => run(() => q.cycles(resolveGraphId(o.graph), o.commit)))
  );

  withGlobalFlags(
    program
      .command("security")
      .description("Nodes flagged with security concerns")
      .option("-g, --graph <id>")
      .option("--min-severity <sev>", "low|medium|high", "low")
      .option("-l, --limit <n>", "max results", "50")
      .option("-c, --commit <hash>")
      .action((o) =>
        run(() => q.securityIssues(resolveGraphId(o.graph), o.minSeverity as Severity, intOr(o.limit, 50), o.commit))
      )
  );

  withGlobalFlags(
    program
      .command("diff")
      .description("Diff two commits + blast radius of what changed")
      .argument("<from>", "older commit hash")
      .argument("<to>", "newer commit hash")
      .option("-g, --graph <id>")
      .option("-r, --radius <n>", "blast-radius hops for changed nodes", "1")
      .action((from, to, o) => run(() => q.analyzeChanges(resolveGraphId(o.graph), from, to, intOr(o.radius, 1))))
  );
}