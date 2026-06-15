import type { BackendRouteNode, CodeEdge, CodeNode, ProjectFingerprint, RouteNode } from "../types";
import { buildLookupMaps } from "./buildLookup";
import { detectCallEdges } from "./edges/callEdges";
import { detectEventEdges } from "./edges/eventEdges";
import { detectGuardEdges } from "./edges/guardEdges";
import { detectHookEdges } from "./edges/hookEdges";
import { detectImportEdges } from "./edges/importEdges";
import { detectPropEdges } from "./edges/propEdges";
import { detectRouteEdges } from "./edges/routeEdge";
import { detectStateEdges } from "./edges/stateEdges";
import { detectTestEdges } from "./edges/testEdges";


export interface EdgeDetectionResult {
    edges: CodeEdge[];
    ghostNodes: CodeNode[];
}

export function detectEdges(
    nodes: CodeNode[],
    routeNodes: (RouteNode | BackendRouteNode)[],
    repoPath: string,
    fingerprint: ProjectFingerprint,
): EdgeDetectionResult {
    console.log(`Building lookup maps for edge detection for ${nodes.length} nodes...`);

    //building lookup maps
    const lookupMp = buildLookupMaps(nodes);
    console.log("Running edge detectors...");
    // importEdges MUST run before callEdges — it populates lookupMp.thirdPartyImportAliases
    // as a side-effect, and callEdges reads that map to resolve third-party CALLS edges.
    const importResult = detectImportEdges(lookupMp, repoPath);
    const importEdges = importResult.edges;

    const callResult = detectCallEdges(nodes, lookupMp);
    const callEdges = callResult.edges;

    const stateEdges = detectStateEdges(nodes, lookupMp);
    const propEdges = detectPropEdges(nodes, lookupMp, repoPath);
    const hookEdges  = detectHookEdges(nodes, lookupMp);
    const eventResults = detectEventEdges(lookupMp, repoPath);
    const routeEdges  = detectRouteEdges(nodes, lookupMp);
    // GUARDS — middleware to route protection
    const guardEdges = detectGuardEdges(
        nodes,
        lookupMp,
        routeNodes,
        repoPath,
        fingerprint
    );
    const testEdges = detectTestEdges(lookupMp, repoPath);  // This does not needs nodes, as it detect edges from the file

    // Collect all dynamically-created third-party method nodes (dedup by id)
    const newThirdPartyNodesMap = new Map<string, CodeNode>();
    for (const n of [...importResult.thirdPartyMethodNodes, ...callResult.newThirdPartyNodes]) {
        if (!newThirdPartyNodesMap.has(n.id)) newThirdPartyNodesMap.set(n.id, n);
    }
    const newThirdPartyNodes = [...newThirdPartyNodesMap.values()];

    console.log(`Running edge detectors...`);
    console.log(`  CALLS edges: ${callEdges.length}`);
    console.log(`  IMPORTS edges: ${importEdges.length}`);
    console.log(`  STATE edges: ${stateEdges.length}`);
    console.log(`  PROP edges: ${propEdges.length}`);
    console.log(`  HOOK edges:    ${hookEdges.length}`);
    console.log(`  EVENT edges: ${eventResults.edges.length}`);
    console.log(`  ROUTE edges:   ${routeEdges.length}`);
    console.log(`  GUARD edges: ${guardEdges.length}`);
    console.log(`  TEST edges: ${testEdges.length}`);
    console.log(`  Ghost nodes created: ${eventResults.ghostNodes.length}`);
    console.log(`  Third-party method nodes: ${newThirdPartyNodes.length}`);


    const allEdges: CodeEdge[] = [
        ...callEdges,
        ...importEdges,
        ...stateEdges,
        ...propEdges,
        ...hookEdges,
        ...eventResults.edges,
        ...routeEdges,
        ...guardEdges,
        ...testEdges,
    ];

    console.log(`Total edges detected: ${allEdges.length}`);

    return {
        edges: allEdges,
        ghostNodes: [...eventResults.ghostNodes, ...newThirdPartyNodes],
    };

}