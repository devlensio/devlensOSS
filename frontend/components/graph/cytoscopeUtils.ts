import { CodeEdge, CodeNode, EdgeType, NodeType} from "@/lib/types";

export function getScoreRange(nodes: CodeNode[]): { min: number; max: number } {
  const scores = nodes.map(n => n.score ?? 0);
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

export function scoreToSize(score: number, min: number, max: number): number {
  if (max === min) return 60;
  const normalized = (score - min) / (max - min);
  const size = 40 + Math.pow(normalized, 0.5) * 120;
  return Math.max(80, Math.round(size));
}

// FILE, GHOST, and ROUTE are excluded from the default render set.
// ROUTE nodes are controlled separately via the "Entry Points" toggle in FilterBar.
export function filterNodes(nodes: CodeNode[]): CodeNode[] {
  return nodes.filter(n =>
    n.type !== "FILE" &&
    n.type !== "GHOST" &&
    n.type !== "ROUTE"
  );
}


// export function routesToNodes(routes: any[], nodesById: Record<string, CodeNode>): CodeNode[] {
//   const nodesByFile = new Map<string, CodeNode[]>();

//   // Build filePath → nodes lookup
//   Object.values(nodesById).forEach(n => {
//     if (!nodesByFile.has(n.filePath)) nodesByFile.set(n.filePath, []);
//     nodesByFile.get(n.filePath)!.push(n);
//   });

//   return routes.map(r => {
//     // Find the primary node in this file — highest score wins
//     const fileNodes  = nodesByFile.get(r.filePath) ?? [];
//     const primary    = fileNodes.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

//     return {
//       id:        primary ? `ROUTE::${r.filePath}` : `ROUTE::${r.filePath}`,
//       name:      r.urlPath,
//       type:      "ROUTE" as NodeType,
//       filePath:  r.filePath,
//       startLine: 0,
//       endLine:   0,
//       score:     5,
//       metadata:  {
//         isRoute:      true,
//         routeType:    r.type,
//         isDynamic:    r.isDynamic,
//         isCatchAll:   r.isCatchAll,
//         httpMethods:  r.httpMethods ?? null,
//         primaryNodeId: primary?.id ?? null,  // store the actual handler node id
//       },
//     };
//   });
// }

// export function routeEdges(routes: any[], nodesById: Record<string, CodeNode>): CodeEdge[] {
//   const nodesByFile = new Map<string, CodeNode[]>();
//   Object.values(nodesById).forEach(n => {
//     if (!nodesByFile.has(n.filePath)) nodesByFile.set(n.filePath, []);
//     nodesByFile.get(n.filePath)!.push(n);
//   });

//   const edges: CodeEdge[] = [];

//   routes.forEach(r => {
//     const routeId   = `ROUTE::${r.filePath}`;
//     const fileNodes = nodesByFile.get(r.filePath) ?? [];

//     // Draw edge from route node to every node in that file
//     fileNodes.forEach(n => {
//       edges.push({
//         from:     routeId,
//         to:       n.id,
//         type:     "CALLS" as EdgeType,
//         metadata: {},
//       });
//     });
//   });

//   return edges;
// }

export function toElements(nodes: CodeNode[], edges: CodeEdge[]) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const { min, max } = getScoreRange(nodes);

  const cyNodes = nodes.map(n => ({
    data: {
      id:               n.id,
      label:            n.name,
      type:             n.type,
      filePath:         n.filePath,
      score:            n.score ?? 0,
      size:             scoreToSize(n.score ?? 0, min, max),
      startLine:        n.startLine,
      endLine:          n.endLine,
      parentFile:       n.parentFile,
      codeHash:         n.codeHash,
      technicalSummary: n.technicalSummary,
      businessSummary:  n.businessSummary,
      summarizedAt:     n.summarizedAt,
      metadata:         n.metadata,
    }
  }));

  const cyEdges = edges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map(e => ({
      data: {
        id:       `${e.from}-${e.to}-${e.type}`,
        source:   e.from,
        target:   e.to,
        type:     e.type,
        metadata: e.metadata,
      }
    }));

  return [...cyNodes, ...cyEdges];
}