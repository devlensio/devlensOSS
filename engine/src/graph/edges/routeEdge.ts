import { CodeNode, CodeEdge } from "../../types";
import { LookupMaps } from "../buildLookup";

// ─── detectRouteEdges ─────────────────────────────────────────────────────────
//
// Creates HANDLES edges from ROUTE nodes → their handler CodeNodes.
//
// Resolution strategy per route kind:
//
//   Backend (Express/Fastify/Koa):
//     1. metadata.handlerName + same filePath  → nodesByFile exact match
//     2. metadata.handlerName only             → nodesByName fallback
//        (handler imported from another file)
//
//   Next.js API route (route.ts, routeNodeType = "API_ROUTE"):
//     metadata.httpMethod (e.g. "GET") → find node in same file
//     with metadata.isHttpHandler === true && metadata.httpMethod === method
//
//   Next.js page route (routeNodeType = "PAGE"):
//     → find node in same file with metadata.exportType === "default"
//
//   Next.js layout/loading/error/not-found:
//     → same as page — default export is the handler
//
// If no handler is resolved the route node is still valid in the graph,
// it just has no outgoing HANDLES edge. This is intentional — orphan
// route nodes are useful for "unconnected entry points" analysis.

export function detectRouteEdges(
  nodes: CodeNode[],
  lookup: LookupMaps,
): CodeEdge[] {
  const edges: CodeEdge[] = [];

  // Only process ROUTE nodes
  const routeNodes = nodes.filter(n => n.type === "ROUTE");

  for (const routeNode of routeNodes) {
    const meta      = routeNode.metadata;
    const filePath  = routeNode.filePath;
    const routeKind = meta.routeKind as string;

    let handlerNode: CodeNode | undefined;

    if (routeKind === "backend") {
      handlerNode = resolveBackendHandler(routeNode, lookup);

    } else if (routeKind === "nextjs") {
      const routeNodeType = meta.routeNodeType as string;

      if (routeNodeType === "API_ROUTE") {
        handlerNode = resolveNextjsApiHandler(routeNode, lookup);
      } else {
        // PAGE, LAYOUT, LOADING, ERROR, NOT_FOUND — all point to default export
        handlerNode = resolveDefaultExport(filePath, lookup);
      }
    }

    if (!handlerNode) continue;
    if (handlerNode.id === routeNode.id) continue; // safety: no self-loop

    edges.push({
      from: routeNode.id,
      to:   handlerNode.id,
      type: "HANDLES",
      metadata: {
        urlPath:    meta.urlPath,
        httpMethod: meta.httpMethod ?? null,
        routeKind,
      },
    });
  }

  return edges;
}

// ─── Resolution helpers ───────────────────────────────────────────────────────

function resolveBackendHandler(
  routeNode: CodeNode,
  lookup:    LookupMaps,
): CodeNode | undefined {
  const handlerName = routeNode.metadata.handlerName as string | undefined;
  if (!handlerName) return undefined;

  const filePath = routeNode.filePath;

  // Strategy 1 — handler defined in the same file as the route registration
  const nodesInFile = lookup.nodesByFile.get(filePath) ?? [];
  const sameFile = nodesInFile.find(n => n.name === handlerName);
  if (sameFile) return sameFile;

  // Strategy 2 — handler imported from another file, look up by name only.
  // If multiple nodes share the name, prefer the one closest to the route file
  // (shortest relative path difference — simple heuristic).
  const byName = lookup.nodesByName.get(handlerName) ?? [];
  if (byName.length === 0) return undefined;
  if (byName.length === 1) return byName[0];

  // Multiple candidates — pick the one whose filePath shares the most
  // path segments with the route file
  return closestByPath(byName, filePath);
}

function resolveNextjsApiHandler(
  routeNode: CodeNode,
  lookup:    LookupMaps,
): CodeNode | undefined {
  const httpMethod = routeNode.metadata.httpMethod as string | null;
  if (!httpMethod) return undefined;

  const filePath    = routeNode.filePath;
  const nodesInFile = lookup.nodesByFile.get(filePath) ?? [];

  // Find a node in the same file that was flagged as an HTTP handler
  // with the matching method name (set by functions.ts extractor)
  const handler = nodesInFile.find(
    n =>
      n.metadata.isHttpHandler === true &&
      n.metadata.httpMethod    === httpMethod
  );

  if (handler) return handler;

  // Fallback — look for a node whose name exactly matches the HTTP method
  // (handles cases where isHttpHandler flag wasn't set, e.g. older parse)
  return nodesInFile.find(n => n.name === httpMethod);
}

function resolveDefaultExport(
  filePath: string,
  lookup:   LookupMaps,
): CodeNode | undefined {
  const nodesInFile = lookup.nodesByFile.get(filePath) ?? [];

  // Find the node explicitly marked as default export
  const defaultExport = nodesInFile.find(
    n => n.metadata.exportType === "default"
  );
  if (defaultExport) return defaultExport;

  // Fallback — if only one component/function in the file, it's likely
  // the default export even if metadata.exportType wasn't captured
  const candidates = nodesInFile.filter(
    n => n.type === "COMPONENT" || n.type === "FUNCTION"
  );
  if (candidates.length === 1) return candidates[0];

  return undefined;
}

// Picks the node whose filePath shares the most leading path segments
// with the reference path. Used to break ties in nodesByName lookups.
function closestByPath(candidates: CodeNode[], referencePath: string): CodeNode {
  const refParts = referencePath.split("/");

  let best      = candidates[0];
  let bestScore = 0;

  for (const candidate of candidates) {
    const parts = candidate.filePath.split("/");
    let score   = 0;
    const len   = Math.min(refParts.length, parts.length);
    for (let i = 0; i < len; i++) {
      if (refParts[i] === parts[i]) score++;
      else break;
    }
    if (score > bestScore) {
      bestScore = score;
      best      = candidate;
    }
  }

  return best;
}