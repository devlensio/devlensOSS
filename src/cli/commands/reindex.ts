import type { Command } from "commander";
import { storage } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, die, success, isJsonMode } from "../output.js";
import { buildIndex } from "../../search/indexer.js";
import { writeIndex, invalidate, isIndexedOnDisk } from "../../search/indexManager.js";

// devlens reindex [<graphId>] [<commitHash>] [--force]
// Rebuilds the derived .search.json index without re-running analysis.
// No graphId: every graph's latest commit. With graphId only: all commits of
// that graph. commitHash narrows to a single commit. --force rebuilds even
// when the index already exists on disk.
export function registerReindexCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("reindex")
      .description("Rebuild the local search index (.search.json) for stored graphs")
      .argument("[graphId]")
      .argument("[commitHash]")
      .option("--force", "Rebuild even if the index already exists", false)
      .action((graphId?: string, commitHash?: string, opts?: { force?: boolean }) => {
        const force = opts?.force ?? false;
        const results: { graphId: string; commitHash: string; status: string }[] = [];

        const indexOne = (gId: string, cHash: string) => {
          if (!force && isIndexedOnDisk(gId, cHash)) {
            results.push({ graphId: gId, commitHash: cHash, status: "skipped" });
            return;
          }
          const result = storage.getGraph(gId, cHash);
          if (!result) {
            results.push({ graphId: gId, commitHash: cHash, status: "missing" });
            return;
          }
          const { envelope, engine } = buildIndex(result);
          writeIndex(gId, cHash, envelope, engine);
          invalidate(gId, cHash);
          results.push({ graphId: gId, commitHash: cHash, status: "indexed" });
        };

        if (graphId) {
          const meta = storage.getGraphMeta(graphId);
          if (!meta) die(`Graph not found: ${graphId}`);
          const targets = commitHash
            ? meta.commits.filter((c) => c.commitHash === commitHash)
            : meta.commits;
          if (targets.length === 0) die(`Commit not found: ${commitHash}`);
          for (const c of targets) indexOne(graphId, c.commitHash);
          invalidate(graphId);
        } else {
          for (const g of storage.listGraphs()) {
            if (!g.latestCommit) continue;
            indexOne(g.graphId, g.latestCommit);
            invalidate(g.graphId);
          }
        }

        if (!isJsonMode()) {
          const indexed = results.filter((r) => r.status === "indexed").length;
          success(`Reindexed ${indexed}/${results.length} commits`);
        }
        emit({ reindexed: results });
      })
  );
}
