import type { CodeEdge, CodeNode } from "../../types";
import type { LookupMaps } from "../buildLookup";


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
            if (!targets || targets.length === 0) continue;        // we are skipping this because this means that the calledName is not present in out map meaning that it's either an external library call or a built in function

            //create edges
            for (const target of targets) {   //do not get confuse with this loop, it is possible that there are multiple functions with the same name in different files, I have created edges for all of them (Though in the refining phase I will use proximity to detect the actual target)

                //avoid self referencing edges
                if (target.id === node.id) continue;
                console.log("Edge type being pushed", edgeType);
                edges.push({
                    from: node.id,
                    to: target.id,
                    type: edgeType,
                    metadata: {
                        calledName
                    }
                });

                // Accumulate resolved call for metadata writeback
                if (!resolvedCallsMap.has(node.id)) {
                    resolvedCallsMap.set(node.id, []);
                }
                // Avoid duplicates (same name resolved to multiple targets)
                const existing = resolvedCallsMap.get(node.id)!;
                if (!existing.some(r => r.nodeId === target.id)) {
                    existing.push({ name: calledName, nodeId: target.id });
                }

            }
        }


    }
    // Write resolved calls back onto nodes
    for (const node of nodes) {
        node.metadata.resolvedCalls = resolvedCallsMap.get(node.id) ?? [];
    }

    return edges;
}