import type { CodeEdge, CodeNode } from "../../types";
import type { LookupMaps } from "../buildLookup";
import { closestByPath } from "./utils";


export function detectCallEdges(nodes: CodeNode[], lookupMp: LookupMaps): CodeEdge[] {
    const edges: CodeEdge[] = [];
    // Accumulate resolved calls per node — written back to metadata after edge loop
    const resolvedCallsMap = new Map<string, { name: string; nodeId: string }[]>();

    for (const node of nodes) {
        // Only functions and hooks make direct calls
        // Components make calls too but through hooks
        if (
            node.type !== "FUNCTION" &&
            node.type !== "HOOK" &&
            node.type !== "COMPONENT"
        ) continue;

        const calls = node.metadata.calls as string[] | undefined;
        const uses = node.metadata.uses as string[] | undefined;
        const names = calls ?? uses;
        if (!names || names.length === 0) continue;

        const edgeType = calls ? "CALLS" : "USES";


        for (const calledName of names) {
            // Skip obviously external calls
            // e.g. stripe.create, console.log, Math.round
            if (calledName.includes(".")) continue;
            const targets = lookupMp.nodesByName.get(calledName);
            if (!targets || targets.length === 0) continue;

            // When multiple nodes share the same name, pick the one whose
            // file path shares the most leading segments with the caller.
            // This eliminates false edges to same-named functions in unrelated files.
            const target = targets.length === 1
                ? targets[0]
                : closestByPath(targets, node.filePath);

            if (target.id === node.id) continue; // skip self-reference

            edges.push({
                from: node.id,
                to: target.id,
                type: edgeType,
                metadata: { calledName },
            });

            if (!resolvedCallsMap.has(node.id)) {
                resolvedCallsMap.set(node.id, []);
            }
            const existing = resolvedCallsMap.get(node.id)!;
            if (!existing.some(r => r.nodeId === target.id)) {
                existing.push({ name: calledName, nodeId: target.id });
            }
        }


    }
    // Write resolved calls back onto nodes
    for (const node of nodes) {
        node.metadata.resolvedCalls = resolvedCallsMap.get(node.id) ?? [];
    }

    return edges;
}