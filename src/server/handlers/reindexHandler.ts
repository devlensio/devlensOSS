// reindexHandler.ts
//
// Architecture: REST handlers backing POST /api/reindex/:graphId and
// POST /api/reindex on the Bun server. They rebuild the derived .search.json
// index for graphs built by older CLI versions (or after a summarization
// pass), using the exact same indexer as the analyze hook so both paths stay
// byte-equivalent apart from builtAt.
//
// Flow: handleReindexGraph(graphId, commitHash?, force?) -> resolve the graph
// meta; with an explicit commitHash only that commit is processed, otherwise
// every commit of the graph. handleReindexAll(force?) iterates index.json and
// processes only each graph's latest commit. Commits already isIndexed are
// skipped unless force is set. Each commit: buildIndex from its stored
// PipelineResult, write compact JSON through indexManager, mark isIndexed,
// invalidate the search cache. Response reports per-commit results so the UI
// can show what was rebuilt.

import { storage } from "devlensio";
import { buildIndex } from "../../search/indexer.js";
import { writeIndex, invalidate, isIndexedOnDisk } from "../../search/indexManager.js";

interface CommitResult {
    commitHash: string;
    status: "indexed" | "skipped" | "missing";
}

export function handleReindexGraph(
    graphId: string,
    commitHash: string | undefined,
    force: boolean
): Response {
    const meta = storage.getGraphMeta(graphId);
    if (!meta) {
        return Response.json({ success: false, error: "Graph not found" }, { status: 404 });
    }

    const targets = commitHash
        ? meta.commits.filter((c) => c.commitHash === commitHash)
        : meta.commits;

    if (targets.length === 0) {
        return Response.json({ success: false, error: "Commit not found" }, { status: 404 });
    }

    const results: CommitResult[] = targets.map((c) => {
        if (!force && isIndexedOnDisk(graphId, c.commitHash)) {
            return { commitHash: c.commitHash, status: "skipped" as const };
        }
        const result = storage.getGraph(graphId, c.commitHash);
        if (!result) {
            return { commitHash: c.commitHash, status: "missing" as const };
        }
        const { envelope, engine } = buildIndex(result);
        writeIndex(graphId, c.commitHash, envelope, engine);
        invalidate(graphId, c.commitHash);
        return { commitHash: c.commitHash, status: "indexed" as const };
    });

    invalidate(graphId);
    return Response.json({ success: true, data: { graphId, commits: results } });
}

export function handleReindexAll(force: boolean): Response {
    const graphs = storage.listGraphs();
    const perGraph: { graphId: string; commits: CommitResult[] }[] = [];

    for (const g of graphs) {
        const latest = g.latestCommit;
        if (!latest) continue;
        if (!force && isIndexedOnDisk(g.graphId, latest)) {
            perGraph.push({ graphId: g.graphId, commits: [{ commitHash: latest, status: "skipped" }] });
            continue;
        }
        const result = storage.getGraph(g.graphId, latest);
        if (!result) {
            perGraph.push({ graphId: g.graphId, commits: [{ commitHash: latest, status: "missing" }] });
            continue;
        }
        const { envelope, engine } = buildIndex(result);
        writeIndex(g.graphId, latest, envelope, engine);
        invalidate(g.graphId, latest);
        perGraph.push({ graphId: g.graphId, commits: [{ commitHash: latest, status: "indexed" }] });
    }

    return Response.json({ success: true, data: { graphs: perGraph } });
}
