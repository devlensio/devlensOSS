import { CodeEdge, CodeNode } from "../../types";
import { LookupMaps } from "../buildLookup";

// ─── detectHookEdges ──────────────────────────────────────────────────────────
//
// Creates CALLS edges for hook usage relationships:
//
//   COMPONENT → HOOK  (component uses a hook) — reads metadata.hooks
//   HOOK      → HOOK  (hook uses another hook) — reads metadata.dependencies
//   FUNCTION  → HOOK  (function uses a hook)   — reads metadata.hookCalls
//
// callEdges.ts explicitly skips hook calls so these would otherwise be missed.
// We reuse CALLS edge type with isHookCall: true in metadata for distinction.

export function detectHookEdges(
  nodes:  CodeNode[],
  lookup: LookupMaps,
): CodeEdge[] {
  const edges: CodeEdge[] = [];

  for (const node of nodes) {
    if (
      node.type !== "COMPONENT" &&
      node.type !== "HOOK"      &&
      node.type !== "FUNCTION"
    ) continue;

    const hookNames = (
      node.type === "COMPONENT" ? node.metadata.hooks        :
      node.type === "HOOK"      ? node.metadata.dependencies :
                                  node.metadata.hookCalls     // FUNCTION
    ) as string[] | undefined;

    if (!hookNames || hookNames.length === 0) continue;

    for (const hookName of hookNames) {
      if (!hookName.startsWith("use")) continue;

      const targets = lookup.nodesByName.get(hookName);
      if (!targets || targets.length === 0) continue;

      for (const target of targets) {
        // Only connect to HOOK nodes
        if (target.type !== "HOOK") continue;

        // No self-loops
        if (target.id === node.id) continue;

        // No duplicates
        const alreadyExists = edges.some(
          e => e.from === node.id && e.to === target.id && e.type === "CALLS"
        );
        if (alreadyExists) continue;

        edges.push({
          from: node.id,
          to:   target.id,
          type: "CALLS",
          metadata: {
            calledName: hookName,
            isHookCall: true,
          },
        });
      }
    }
  }

  return edges;
}