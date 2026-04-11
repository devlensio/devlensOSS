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
    const callEdges = detectCallEdges(nodes, lookupMp);
    const importEdges = detectImportEdges(lookupMp, repoPath);
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
        ghostNodes: eventResults.ghostNodes,            //Ghost nodes passed back — ghost nodes need to be added to the main node list before the graph is stored. We return them separately so the pipeline can handle them correctly.
    };

}