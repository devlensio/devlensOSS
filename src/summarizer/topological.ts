//Topo Sort

import { CodeEdge, CodeNode } from "../types";
import { CycleGroup, TopologicalResult } from "./types";

export function buildTopologicalOrder(nodes: CodeNode[], edges: CodeEdge[]): TopologicalResult {
    //file nodes will be handled seperately. 
    const fileNodes: string[] = [];
    const regularNodesSet = new Set<string>();
    // const regularNodes: string[] = []; 

    for (const node of nodes) {
        if (node.type !== "FILE") {
            // regularNodes.push(node.id);
            regularNodesSet.add(node.id);
        }
        else {
            fileNodes.push(node.id);
        }
    }

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();// dependents[X] = list of nodes that depend on X (parent of X)
    // When X is summarized → decrement in-degree of each dependent (parent node)
    // If dependent's in-degree hits 0 → it's ready to summarize

    for (const nodeId of regularNodesSet) {
        inDegree.set(nodeId, 0);
    }


    for (const edge of edges) {
        if (!regularNodesSet.has(edge.from) || !regularNodesSet.has(edge.to)) continue;    // Skip edges that involve FILE nodes — they're handled separately
        const currentInDegree = inDegree.get(edge.from) || 0;
        let currentDependents = dependents.get(edge.to) || [];
        inDegree.set(edge.from, currentInDegree + 1);
        currentDependents?.push(edge.from);
        dependents.set(edge.to, currentDependents);
    }

    // Now our indegree map is ready — push nodes with 0 indegree into the queue.
    const queue: string[] = [];
    // nodeOrder is now a nested array — each inner array is one parallel level.
    // All nodes at the same level are independent and can be summarized concurrently.
    const nodeOrder: string[][] = [];

    for (const [nodeId, degreeVal] of inDegree) {
        if (!degreeVal) {
            queue.push(nodeId);
        }
    }

    while (queue.length !== 0) {
        // Snapshot the current queue size — these are exactly the nodes at this level.
        // New nodes pushed during this loop belong to the NEXT level.
        let sz = queue.length;
        const currentLevel: string[] = [];

        while (sz--) {
            const nodeId = queue.shift();
            if (!nodeId) continue;

            currentLevel.push(nodeId);

            for (const parentNodeId of (dependents.get(nodeId) || [])) {
                let currentIndegree = inDegree.get(parentNodeId) || 0;
                inDegree.set(parentNodeId, Math.max(--currentIndegree, 0));
                if (currentIndegree === 0) {
                    // Parent's deps are all done — eligible for next level
                    queue.push(parentNodeId);
                }
            }
        }

        nodeOrder.push(currentLevel);
    }

    // nodeOrder is now ready — but cyclic nodes won't appear in it.
    // Count total processed nodes across all levels to detect cycles.
    const totalProcessed = nodeOrder.reduce((sum, level) => sum + level.length, 0);
    const cycleGroups: CycleGroup[] = [];
    if (totalProcessed !== regularNodesSet.size) {
        const processedSet = new Set<string>(nodeOrder.flat());
        const unvisited = new Set<string>();

        for (const regNode of regularNodesSet) {
            if (!processedSet.has(regNode)) {
                unvisited.add(regNode);
            }
        }
        //now we have the unvisited nodes.
        // undirected adjacency among cyclic nodes only
        const cycleAdj = new Map<string, string[]>();
        for (const id of unvisited) cycleAdj.set(id, []);

        for (const edge of edges) {
            if (!unvisited.has(edge.from) || !unvisited.has(edge.to)) continue; //if any of the node is not in unvisited meaning it is not a cyclic. 
            cycleAdj.get(edge.from)!.push(edge.to);
            cycleAdj.get(edge.to)!.push(edge.from);
        }
        // DFS to find connected components — each = one CycleGroup
        for (const startId of unvisited) {
            const component: string[] = [];
            dfs(startId, unvisited, cycleAdj, component);
            if (component.length > 0) {
                cycleGroups.push({ nodeIds: component, size: component.length });
            }
        }
    }

    return { nodeOrder, cycleGroups, fileNodes };
}


function dfs(
    nodeId: string,
    unvisited: Set<string>,
    adj: Map<string, string[]>,
    component: string[]
): void {
    unvisited.delete(nodeId); // mark visited
    component.push(nodeId);

    for (const adjNode of (adj.get(nodeId) || [])) {
        if (!unvisited.has(adjNode)) continue;  //perform dfs only of adjacent node is not visited
        dfs(adjNode, unvisited, adj, component);
    }
}