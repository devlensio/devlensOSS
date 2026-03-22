import { CodeNode, CodeEdge } from "../../types";
import { LookupMaps } from "../buildLookup";


const REDUX_READ_HOOKS = ["useSelector", "useSelectorShallowEqual"]; // Redux hooks that indicate reads
const REDUX_WRITE_HOOKS = ["useDispatch"]; // Redux hooks that indicate writes

// Recoil hooks and what they mean
const RECOIL_READ_HOOKS = ["useRecoilValue", "useRecoilValueLoadable"];
const RECOIL_WRITE_HOOKS = ["useSetRecoilState", "useResetRecoilState"];
const RECOIL_BOTH_HOOKS = ["useRecoilState", "useRecoilStateLoadable"];

// Jotai hooks and what they mean
const JOTAI_READ_HOOKS = ["useAtomValue"];
const JOTAI_WRITE_HOOKS = ["useSetAtom"];
const JOTAI_BOTH_HOOKS = ["useAtom"];

// Context hooks
const CONTEXT_HOOKS = ["useContext"];


// Main function to detect state edges based on hooks used in components and hooks
export function detectStateEdges(
  nodes: CodeNode[],
  lookupMp: LookupMaps
): CodeEdge[] {
  const edges: CodeEdge[] = [];

  // Build a fast name → store node map from storeNodes
  // This is separate from nodesByName because we only want
  // to match against STATE_STORE nodes not all nodes
  const storesByName = new Map<string, CodeNode>();
  for (const store of lookupMp.storeNodes) {
    storesByName.set(store.name, store);
  }

  // Separate Redux stores for useSelector/useDispatch
  // which don't reference a store by name directly
  const reduxStores = lookupMp.storeNodes.filter(
    (n) => n.metadata.storeType === "redux"
  );

  for (const node of nodes) {
    // Only components and hooks use state
    if (node.type !== "COMPONENT" && node.type !== "HOOK") continue;

    const hooks = node.metadata.hooks as string[] | undefined;
    if (!hooks || hooks.length === 0) continue;

    for (const hookName of hooks) {

      // ─── Zustand ──────────────────────────────────────────────────────────
      // Zustand stores are used directly by their hook name
      // e.g. useCartStore, useAuthStore
      const zustandStore = storesByName.get(hookName);
      if (zustandStore && zustandStore.metadata.storeType === "zustand") {
        // Create both edges — can't distinguish read vs write without
        // expensive type analysis
        edges.push({
          from: node.id,
          to: zustandStore.id,
          type: "READS_FROM",
          metadata: { hookUsed: hookName, storeType: "zustand" },
        });
        edges.push({
          from: node.id,
          to: zustandStore.id,
          type: "WRITES_TO",
          metadata: { hookUsed: hookName, storeType: "zustand" },
        });
        continue;
      }

      // ─── Redux ────────────────────────────────────────────────────────────
      // Redux uses useSelector (read) and useDispatch (write)
      // Neither references a specific store by name so we connect
      // to all Redux stores found in the codebase
      if (REDUX_READ_HOOKS.includes(hookName)) {
        for (const store of reduxStores) {
          edges.push({
            from: node.id,
            to: store.id,
            type: "READS_FROM",
            metadata: { hookUsed: hookName, storeType: "redux" },
          });
        }
        continue;
      }

      if (REDUX_WRITE_HOOKS.includes(hookName)) {
        for (const store of reduxStores) {
          edges.push({
            from: node.id,
            to: store.id,
            type: "WRITES_TO",
            metadata: { hookUsed: hookName, storeType: "redux" },
          });
        }
        continue;
      }

      // ─── Context ──────────────────────────────────────────────────────────
      // useContext(AuthContext) — the argument tells us which context
      // We stored context stores in storesByName by their variable name
      // e.g. AuthContext, ThemeContext
      // We can't get the argument here from metadata alone
      // so we check if any context store name appears in the hooks list
      // This is a heuristic — precise detection requires ts-morph on source
      if (CONTEXT_HOOKS.includes(hookName)) {
        // Look for context stores whose name appears as a dependency
        // of this component — stored in metadata as hooks or calls
        const calls = node.metadata.calls as string[] | undefined;
        const allRefs = [...hooks, ...(calls || [])];

        for (const ref of allRefs) {
          const contextStore = storesByName.get(ref);
          if (contextStore && contextStore.metadata.storeType === "context") {
            edges.push({
              from: node.id,
              to: contextStore.id,
              type: "READS_FROM",
              metadata: { hookUsed: hookName, storeType: "context" },
            });
            edges.push({
              from: node.id,
              to: contextStore.id,
              type: "WRITES_TO",
              metadata: { hookUsed: hookName, storeType: "context" },
            });
          }
        }
        continue;
      }

      // ─── Recoil ───────────────────────────────────────────────────────────
      if (RECOIL_READ_HOOKS.includes(hookName)) {
        // Find recoil atoms referenced in this component
        for (const ref of hooks) {
          const atomStore = storesByName.get(ref);
          if (atomStore && atomStore.metadata.storeType === "recoil") {
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "READS_FROM",
              metadata: { hookUsed: hookName, storeType: "recoil" },
            });
          }
        }
        continue;
      }

      if (RECOIL_WRITE_HOOKS.includes(hookName)) {
        for (const ref of hooks) {
          const atomStore = storesByName.get(ref);
          if (atomStore && atomStore.metadata.storeType === "recoil") {
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "WRITES_TO",
              metadata: { hookUsed: hookName, storeType: "recoil" },
            });
          }
        }
        continue;
      }

      if (RECOIL_BOTH_HOOKS.includes(hookName)) {
        for (const ref of hooks) {
          const atomStore = storesByName.get(ref);
          if (atomStore && atomStore.metadata.storeType === "recoil") {
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "READS_FROM",
              metadata: { hookUsed: hookName, storeType: "recoil" },
            });
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "WRITES_TO",
              metadata: { hookUsed: hookName, storeType: "recoil" },
            });
          }
        }
        continue;
      }

      // ─── Jotai ────────────────────────────────────────────────────────────
      if (JOTAI_READ_HOOKS.includes(hookName)) {
        for (const ref of hooks) {
          const atomStore = storesByName.get(ref);
          if (atomStore && atomStore.metadata.storeType === "jotai") {
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "READS_FROM",
              metadata: { hookUsed: hookName, storeType: "jotai" },
            });
          }
        }
        continue;
      }

      if (JOTAI_WRITE_HOOKS.includes(hookName)) {
        for (const ref of hooks) {
          const atomStore = storesByName.get(ref);
          if (atomStore && atomStore.metadata.storeType === "jotai") {
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "WRITES_TO",
              metadata: { hookUsed: hookName, storeType: "jotai" },
            });
          }
        }
        continue;
      }

      if (JOTAI_BOTH_HOOKS.includes(hookName)) {
        for (const ref of hooks) {
          const atomStore = storesByName.get(ref);
          if (atomStore && atomStore.metadata.storeType === "jotai") {
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "READS_FROM",
              metadata: { hookUsed: hookName, storeType: "jotai" },
            });
            edges.push({
              from: node.id,
              to: atomStore.id,
              type: "WRITES_TO",
              metadata: { hookUsed: hookName, storeType: "jotai" },
            });
          }
        }
        continue;
      }
    }
  }

  return edges;
}