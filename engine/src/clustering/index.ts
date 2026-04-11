//Ranked BFS with Shared Node isolation

import type { CodeEdge, CodeNode, EdgeType } from "../types";

const BFS_TYPES = new Set<EdgeType>(["CALLS", "PROP_PASS", "GUARDS", "EMITS", "LISTENS"]);

export interface ClusterNode {
    nodeId: string;
    rank: number;
}

export interface ClusterFile {
    filePath: string;
    nodeIds: ClusterNode[];  // sorted by rank
}

export interface Cluster {
    id: string;
    label: string;
    files: ClusterFile[];
    nodeCount: number;
    topNodes: string[];
}

export interface InterClusterEdge {
    from: string;
    to: string;
    weight: number;
}

export interface ClusterResult {
    clusters: Cluster[];
    interClusterEdges: InterClusterEdge[];
    clusterMembership: Record<string, string>;  // nodeId -> clusterId
}

export function computeClusters(
    allNodes: CodeNode[],
    allEdges: CodeEdge[],
    nodeScores: Record<string, number>
): ClusterResult {
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const nodeMap = new Map<string, CodeNode>();
    const fileContentMap = new Map<string, string[]>();

    // 1. Initialize Maps and File-to-Node relationships
    for (const node of allNodes) {
        adjList.set(node.id, []);
        inDegree.set(node.id, 0);
        nodeMap.set(node.id, node);

        const path = node.filePath || "external-dependencies";
        if (!fileContentMap.has(path)) fileContentMap.set(path, []);
        fileContentMap.get(path)!.push(node.id);
    }

    // 2. Build Adjacency List for Bloom Traversal
    for (const edge of allEdges) {
        if (!BFS_TYPES.has(edge.type)) continue;
        adjList.get(edge.from)?.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    const membership = new Map<string, string>(); // nodeId -> clusterId
    const ranks = new Map<string, number>();      // nodeId -> rank
    const queue: { nodeId: string; clusterId: string; rank: number }[] = [];
    let clusterPosition = 1;

    // Helper: Register a node and all its file-siblings into a cluster
    const startClusterFromNode = (rootId: string, manualClusterId?: string) => {
        if (membership.has(rootId)) return;

        const clusterId = manualClusterId || `CLUSTER_${clusterPosition++}`;
        const rootNode = nodeMap.get(rootId);

        // STICKY LOGIC: Draft all nodes in the same file to keep file-integrity
        const siblings = fileContentMap.get(rootNode?.filePath || "") || [];
        const targets = siblings.length > 0 ? siblings : [rootId];

        for (const id of targets) {
            if (!membership.has(id)) {
                membership.set(id, clusterId);
                ranks.set(id, 0);
                queue.push({ nodeId: id, clusterId, rank: 0 });
            }
        }
        console.log(clusterId, rootId);
    };

    // 3. PHASE 1: Seed Entry Points (Structural Entry)
    allNodes
        .filter((n) => inDegree.get(n.id) === 0)
        .sort((a, b) => (nodeScores[b.id] ?? 0) - (nodeScores[a.id] ?? 0))
        .forEach((n) => startClusterFromNode(n.id));

    const maxClusterLevel = 4;

    // 4. PHASE 2: Main BFS Propagation (The Bloom)

    while (queue.length > 0) {
        const { nodeId, clusterId, rank } = queue.shift()!;
        const currentNode = nodeMap.get(nodeId);

        for (const childId of adjList.get(nodeId) ?? []) {
            const childNode = nodeMap.get(childId);
            const existingCluster = membership.get(childId);

            const isFileBoundary = currentNode?.type === "FILE" || childNode?.type === "FILE";
            const nextRank = (rank >= maxClusterLevel || isFileBoundary) ? rank : rank + 1;

            if (!existingCluster) {
                membership.set(childId, clusterId);
                ranks.set(childId, nextRank);
                queue.push({ nodeId: childId, clusterId, rank: nextRank });
            } else if (existingCluster !== clusterId && existingCluster !== "SHARED_CORE" && clusterId !== "SHARED_CORE") {
                membership.set(childId, "SHARED_CORE");
                ranks.set(childId, nextRank);
                queue.push({ nodeId: childId, clusterId: "SHARED_CORE", rank: nextRank });
            }
        }
    }




    // 6. Assemble Temporary Groups
    const tempGroups = new Map<string, Map<string, ClusterNode[]>>(); // clusterId -> path -> nodes
    for (const node of allNodes) {
        const cId = membership.get(node.id) || "MISC";
        if (!tempGroups.has(cId)) tempGroups.set(cId, new Map());
        const fileMap = tempGroups.get(cId)!;
        const path = node.filePath || "external";
        if (!fileMap.has(path)) fileMap.set(path, []);
        fileMap.get(path)!.push({ nodeId: node.id, rank: ranks.get(node.id) ?? 0 });
    }

    // 7. PHASE 4: Refine & Consolidate (Remove single-node utility clusters)
    const finalClusters: Cluster[] = [];
    const miscFiles: ClusterFile[] = [];
    const MIN_CLUSTER_SIZE = 3;

    for (const [cId, fileMap] of tempGroups) {
        const clusterFiles: ClusterFile[] = [];
        let totalNodesInCluster = 0;

        for (const [path, nodes] of fileMap) {
            clusterFiles.push({
                filePath: path,
                nodeIds: nodes.sort((a, b) => a.rank - b.rank)
            });
            totalNodesInCluster += nodes.length;
        }

        const isUtility = totalNodesInCluster < MIN_CLUSTER_SIZE && cId !== "SHARED_CORE";

        if (isUtility) {
            // Re-route membership to MISC cluster
            clusterFiles.forEach(cf => cf.nodeIds.forEach(n => membership.set(n.nodeId, "UTILS_STORES")));
            miscFiles.push(...clusterFiles);
        } else {
            const allIds = clusterFiles.flatMap(f => f.nodeIds.map(n => n.nodeId));
            const sortedByScore = allIds.sort((a, b) => (nodeScores[b] ?? 0) - (nodeScores[a] ?? 0));

            finalClusters.push({
                id: cId,
                label: cId === "SHARED_CORE" ? "Shared Core" : (nodeMap.get(sortedByScore[0])?.name || cId),
                files: clusterFiles,
                nodeCount: totalNodesInCluster,
                topNodes: sortedByScore.slice(0, 5),
            });
        }
    }

    // Add consolidated Utility cluster
    if (miscFiles.length > 0) {
        const miscIds = miscFiles.flatMap(f => f.nodeIds.map(n => n.nodeId));
        finalClusters.push({
            id: "UTILS_STORES",
            label: "Singletons, Utilities & Global Stores",
            files: miscFiles,
            nodeCount: miscIds.length,
            topNodes: miscIds.sort((a, b) => (nodeScores[b] ?? 0) - (nodeScores[a] ?? 0)).slice(0, 5)
        });
    }

    // 8. Inter-Cluster Edges
    const interClusterEdges: InterClusterEdge[] = [];
    const edgeTracker = new Map<string, number>();

    for (const edge of allEdges) {
        const fromC = membership.get(edge.from);
        const toC = membership.get(edge.to);
        if (fromC && toC && fromC !== toC) {
            const key = `${fromC}->${toC}`;
            edgeTracker.set(key, (edgeTracker.get(key) ?? 0) + 1);
        }
    }

    edgeTracker.forEach((weight, key) => {
        const [from, to] = key.split("->");
        interClusterEdges.push({ from, to, weight });
    });

    return {
        clusters: finalClusters,
        interClusterEdges,
        clusterMembership: Object.fromEntries(membership),
    };
}