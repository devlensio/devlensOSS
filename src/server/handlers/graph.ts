import { PipelineResult, deleteCommit, getNodeCode, CodeNode, storage } from "devlensio";
import { getNodeCodeFor } from "../../core/queries.js";


// Shared response builder — adds nodesById for O(1) frontend lookups.
// Used by both handleGetGraph and handleFilter so the shape is always consistent.
//
// Deduplication: allNodes can contain duplicates when the parser and another
// source (e.g. ghost node creation, route node injection) produce a node with
// the same ID. We deduplicate by ID here — last write wins, which is fine
// because duplicate nodes are always identical in content.
export function buildGraphResponse(nodes: CodeNode[], rest: Record<string, unknown>) {
    const sanitized = nodes.map(({ rawCode, ...node }) => node as CodeNode);

    // Deduplicate by ID — O(n), preserves first occurrence
    const seen  = new Set<string>();
    const deduped = sanitized.filter(n => {
        if (seen.has(n.id)) {
            console.warn(`[buildGraphResponse] Duplicate node ID detected and removed: ${n.id}`);
            return false;
        }
        seen.add(n.id);
        return true;
    });

    const nodesById = Object.fromEntries(deduped.map(n => [n.id, n]));

    // Deduplicate edges by "from::type::to" key
    const { routes, edges, ...restAll } = rest;
    const edgeSeen = new Set<string>();
    const dedupedEdges = (edges as any[] ?? []).filter((e: any) => {
        const key = `${e.from}::${e.type}::${e.to}`;
        if (edgeSeen.has(key)) return false;
        edgeSeen.add(key);
        return true;
    });

    return { ...restAll, nodes: deduped, edges: dedupedEdges, routes, nodesById };
}

function resolveRouteNodeIds(routes: PipelineResult["routes"], allNodes: CodeNode[]) {
    const byNameAndFile = new Map<string, string>(); // "filePath::name" → nodeId

    for (const node of allNodes) {
        byNameAndFile.set(`${node.filePath}::${node.name}`, node.id);
    }
    return routes.map(route => {
        if (route.type === "BACKEND_ROUTE" && route.handlerName) {
            const nodeId = byNameAndFile.get(`${route.handlerName}::${route.filePath}`);
            return { ...route, nodeId };
        }
        return route;
    });
}

export function handleListGraphs(): Response {
    const graphs = storage.listGraphs();
    return Response.json({ success: true, data: graphs });
}

/**
 * Accept a short commit hash.
 *
 * URLs and clipboard links routinely carry the 7-character form (`?commit=a6062bb`)
 * while storage is keyed by the full hash, so an exact lookup 404s and the page
 * reports "Commit not found" for a commit that exists. Resolve a unique prefix
 * to its full hash; anything ambiguous stays unresolved and 404s as before.
 */
function resolveCommitHash(graphId: string, commitHash?: string): string | undefined {
    if (!commitHash) return undefined;
    const meta = storage.getGraphMeta(graphId);
    if (!meta) return commitHash;
    const hashes = new Set(meta.commits.map(c => c.commitHash));
    if (hashes.has(commitHash)) return commitHash;
    const matches = [...hashes].filter(h => h.startsWith(commitHash));
    return matches.length === 1 ? matches[0] : commitHash;
}

export function handleGetGraph(graphId: string, rawCommitHash?: string): Response {
    const commitHash = resolveCommitHash(graphId, rawCommitHash);
    const result = storage.getGraph(graphId, commitHash);
    if (!result) {
        return Response.json({ success: false, error: "Graph not found" }, { status: 404 });
    }

    const { allNodes, allEdges, ...rest } = result;
    const enrichedRoutes = resolveRouteNodeIds(result.routes, allNodes);
    return Response.json({ success: true, data: buildGraphResponse(allNodes, { ...rest, edges: allEdges, routes: enrichedRoutes, }) });
}

export function handleGetGraphMeta(graphId: string): Response {
    const meta = storage.getGraphMeta(graphId);
    if (!meta) {
        return Response.json({ success: false, error: "Graph not found" }, { status: 404 });
    }
    return Response.json({ success: true, data: meta });
}

export function handleDeleteGraph(graphId: string): Response {
    const deleted = storage.deleteGraph(graphId);
    if (!deleted) {
        return Response.json({ success: false, error: "Graph not found" }, { status: 404 });
    }
    return Response.json({ success: true, data: null });
}

export function handleDeleteCommit(graphId: string, commitHash: string): Response {
    const deleted = deleteCommit(graphId, commitHash);
    if (!deleted) {
        return Response.json({ success: false, error: "Commit not found" }, { status: 404 });
    }
    return Response.json({ success: true, data: null });
}

export function handleGetCodeNode(graphId: string, rawCommitHash: string, nodeId: string): Response {
    const commitHash = resolveCommitHash(graphId, rawCommitHash) ?? rawCommitHash;
    // getNodeCodeFor falls back to reading the range from disk when the node
    // carries no rawCode (FILE nodes and anything summarised away). The stored
    // graph is still the source of truth for the range.
    try {
        const node = getNodeCodeFor(graphId, nodeId, commitHash);
        return Response.json({ success: true, data: node });
    } catch {
        const node = getNodeCode(graphId, commitHash, nodeId);
        if (!node) {
            return Response.json({ success: false, error: "Node not found" }, { status: 404 });
        }
        return Response.json({ success: true, data: node });
    }
}