
// before creating edges, we need to build lookup maps for efficient node lookup in O(N)
import type { CodeNode } from "../types";


export interface LookupMaps {
    nodesByName: Map<string, CodeNode[]>;
    nodesByFile: Map<string, CodeNode[]>;
    fileNodesByPath: Map<string, CodeNode>; // filePath → FILE node
    storeNodes: CodeNode[];
}

export function buildLookupMaps(codeNodes: CodeNode[]): LookupMaps {
    const nodesByName = new Map<string, CodeNode[]>();
    const nodesByFile = new Map<string, CodeNode[]>();
    const fileNodesByPath = new Map<string, CodeNode>();
    const storeNodes: CodeNode[] = [];

    for (const node of codeNodes) {
        // FILE nodes go into their own dedicated map — kept separate so other
        // detectors (guards, call edges, etc.) only see function/component nodes
        if (["FILE", "TEST", "STORY"].includes(node.type)) {
            fileNodesByPath.set(node.filePath, node);
            continue;
        }

        if (!nodesByName.has(node.name)) {
            nodesByName.set(node.name, []);
        }
        nodesByName.get(node.name)!.push(node);

        if (!nodesByFile.has(node.filePath)) {
            nodesByFile.set(node.filePath, []);
        }
        nodesByFile.get(node.filePath)!.push(node);

        if (node.type === "STATE_STORE") {
            storeNodes.push(node);
        }
    }
    return { nodesByName, nodesByFile, fileNodesByPath, storeNodes };
}