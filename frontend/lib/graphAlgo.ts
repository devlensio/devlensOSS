import { CodeEdge, CodeNode } from "./types";

export interface AdjacencyMap {
    adj: Map<string, string[]>;
    radj: Map<string, string[]>;
}

export function buildAdjacency(edges: CodeEdge[]): AdjacencyMap {
    const adj = new Map<string, string[]>();
    const radj = new Map<string, string[]>();

    for (const edge of edges) {
        if (!adj.has(edge.from)) adj.set(edge.from, []);
        if (!radj.has(edge.to)) radj.set(edge.to, []);
        adj.get(edge.from)?.push(edge.to);
        radj.get(edge.to)?.push(edge.from);
    }
    return { adj, radj };
}


// BFS
// return all Nodes reachable from startId within kHops
export function bfsReachable(
    startId: string,
    adj: Map<string, string[]>,
    kHop: number
): Set<{ nodeId: string; distance: number }> {
    const visited = new Set<string>();
    const queue: { nodeId: string; distance: number }[] = [{ nodeId: startId, distance: 0 }];
    const res = new Set<{ nodeId: string; distance: number }>();
    visited.add(startId);

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.distance >= kHop) continue;

        for (const neighbor of adj.get(current.nodeId) ?? []) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            const entry = { nodeId: neighbor, distance: current.distance + 1 };
            res.add(entry);
            queue.push(entry);
        }
    }
    return res;
}


// reverse BFS, will find all the nodes that are dependent on a given Node
export function blastRadius(nodeId: string, radj: Map<string, string[]>, blastK: number = Infinity): Set<string> {
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];
  const res = new Set<string>();
  visited.add(nodeId);

  while (queue.length > 0) {
    const { id: current, depth } = queue.shift()!;
    if (depth >= blastK) continue;

    for (const neighbor of radj.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      res.add(neighbor);
      queue.push({ id: neighbor, depth: depth + 1 });
    }
  }
  return res;
}

export function shortestPath(fromId: string, toId: string, adj: Map<string, string[]>): string[] {
    if (fromId === toId) return [fromId];

    const visited = new Set<string>();
    const prev = new Map<string, string>();
    const queue = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
        const current = queue.shift()!;

        for (const neighbor of adj.get(current) ?? []) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            prev.set(neighbor, current);

            if (neighbor === toId) {
                const path: string[] = [];
                let node: string | undefined = toId;
                while (node) {
                    path.unshift(node);
                    node = prev.get(node);
                }
                return path;
            }
            queue.push(neighbor);
        }
    }
    return [];
}

export function commitDiff(
    nodesA: CodeNode[],
    nodesB: CodeNode[]
): { added: string[]; removed: string[]; common: string[] } {
    const idsA = new Set(nodesA.map(n => n.id));
    const idsB = new Set(nodesB.map(n => n.id));

    const added   = [...idsB].filter(id => !idsA.has(id));
    const removed = [...idsA].filter(id => !idsB.has(id));
    const common  = [...idsA].filter(id => idsB.has(id));

    return { added, removed, common };
}