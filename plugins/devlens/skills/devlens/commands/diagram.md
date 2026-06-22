# /devlens diagram — Mermaid diagrams from the graph

Render the graph visually. **Argument:** `[architecture|cluster|flow|deps]` (default `architecture`). For `cluster`/`flow`, an optional second arg is a seed node id/name.

A trivial 5-node diagram is a FAILURE. The diagram must represent the real structure of a large graph: all modules, all routes, all stores, key hooks/components, with typed edges. Build the data from `find-nodes`, `get-node`, `khop`, `blast-radius` (each carries `viaEdge` = edge type). Do **NOT** use `devlens subgraph --json` (older CLIs print a text cluster listing, not JSON).

## architecture (default) — module/layer diagram

### MANDATORY data collection (run all, parse all)
1. `devlens overview --json` → stack + `topNodes`/`topFiles` + counts.
2. `devlens find-nodes -l 5000 --json` → all nodes; group by top-level/second-level directory into **modules**; tally per-type counts.
3. `devlens find-nodes -t ROUTE -l 500 --json` → **all routes** (these are entry points — include them all).
4. `devlens find-nodes -t STATE_STORE -l 200 --json` → **all stores**.
5. `devlens find-nodes -t HOOK -l 200 --json` → **all hooks**.
6. `devlens top-nodes -l 25 --json` → central nodes to feature per module.
7. For the central nodes + each store: `devlens khop <id> -r 2 --json` and `devlens get-node <id> --json` → cross-module edges with `viaEdge`.

### Build the diagram (`flowchart LR`)
- One Mermaid **`subgraph` block per module** (top-level directory), titled with the module name + node count.
- **HARD REQUIREMENT — include these in full, no exceptions:**
  - **EVERY ROUTE node** (all of them — the count must equal `routeCount` from overview). Group them in a `Routes` subgraph (or within their module subgraphs), split PAGE vs API_ROUTE. These are the app's entry points; a diagram missing routes is wrong.
  - **EVERY STATE_STORE node** — place all of them in a `State` subgraph.
  - **EVERY HOOK node** — include all custom hooks.
- For the high-volume types (FUNCTION, COMPONENT, FILE, UTILITY): include the highest-`score` ones per module and add a `+N more` note so nothing is silently hidden. Important components (high score, or those connected to routes/stores) must appear.
- Draw **edges between nodes** using the `viaEdge` data from step 7 (label every edge with its type). Show how routes reach handlers/components, how components read stores (READS_FROM), how data flows — not just within one module.
- Apply the node-type and edge styling below, plus the severity encoding and legend.
- **Mandatory coverage check before you output (do this explicitly):** count the ROUTE nodes in your diagram and confirm it equals `routeCount`; confirm the number of STATE_STORE nodes equals the count from `find-nodes -t STATE_STORE`; confirm all HOOK nodes are present. If any are missing, add them before finishing. State the tallies in the companion key (e.g. "Routes: 43/43, Stores: 7/7, Hooks: 5/5").
- **Scale without dropping anything:** if the full diagram is too dense to read, keep ALL routes/stores/hooks and represent the high-volume FUNCTION/COMPONENT/FILE long tail as a `+N more` node per module, then offer `/devlens diagram cluster <module>` for zoom-in. Never omit a route, store, or hook for readability.

## Other views
- **cluster** `[seed]` — resolve name→id via `find-nodes`, then `devlens khop <id> -r 2 --json` + `devlens blast-radius <id> -r 2 --json`; render the seed and all neighbors, edges labeled by `viaEdge`.
- **flow** `[seed]` — `devlens get-node <id> --json` (callers/callees) + `devlens khop <id> -r 2 --json`; render call/data flow around the node.
- **deps** — `devlens top-nodes -l 25 --json`, then `devlens get-node <id> --json` on each to read `callees` (`viaEdge`); render the dependency graph among the top nodes.

## Visual encoding (pin this — keep output consistent)
Map each **node type** (the node's `type`) to a fixed shape + `classDef`:
| Node type | Mermaid shape | classDef style |
| :-- | :-- | :-- |
| COMPONENT | `id["name"]` (rect) | `fill:#dbeafe,stroke:#3b82f6` |
| HOOK | `id(["name"])` (stadium) | `fill:#ede9fe,stroke:#8b5cf6` |
| FUNCTION | `id("name")` (rounded) | `fill:#f3f4f6,stroke:#6b7280` |
| ROUTE | `id{{"name"}}` (hexagon) | `fill:#dcfce7,stroke:#22c55e` |
| STATE_STORE | `id[("name")]` (cylinder) | `fill:#ffedd5,stroke:#f97316` |
| UTILITY | `id["name"]` (rect) | `fill:#fef9c3,stroke:#ca8a04` |
| FILE | `id[/"name"/]` (parallelogram) | `fill:#f1f5f9,stroke:#94a3b8` |
| other (TEST/STORY/THIRD_PARTY/GHOST) | `id["name"]` (rect) | `fill:#ffffff,stroke:#9ca3af` |

Map each **edge type** (`viaEdge`); always label the edge with the exact type, line style by category:
| Category | Edge types | Arrow |
| :-- | :-- | :-- |
| control / call | CALLS, USES, HANDLES, GUARDS, WRAPPED_BY | `-->|CALLS|` (solid) |
| import / structure | IMPORTS | `-.->|IMPORTS|` (dotted) |
| data | READS_FROM, WRITES_TO | `==>|READS_FROM|` (thick) |
| events / props | EMITS, LISTENS, PROP_PASS | `--o|EMITS|` (circle-end) |
| tests | TESTS | `-.->|TESTS|` (dotted) |

Define classes via `classDef` and assign `class id1,id2 component;`. **Security severity:** append a badge to risky node labels (`⚠high`/`⚠med`) and layer an overlay class `classDef sevHigh stroke:#dc2626,stroke-width:4px;` / `sevMed stroke:#f59e0b,stroke-width:3px;` via a second `class <id> sevHigh;` line. Add a **Legend** `subgraph` showing one example of each node shape, each edge category, and the severity badges present.

## Delivery (do all three)
1. **Inline** — print the Mermaid in a ```mermaid code block.
2. **Save** — write it to `devlens-<view>.md` (wrapped in a ```mermaid block) so it renders in GitHub/IDE preview (also accept `.mmd`). Accompany with a **key**: each shown node id → one-line role from its functional summary.
3. **Render an image (best effort)** — if a Mermaid renderer is available, make a PNG/SVG:
   - Detect: `mmdc --version` or `npx --no-install @mermaid-js/mermaid-cli --version`.
   - If present: `mmdc -i devlens-<view>.mmd -o devlens-<view>.png`.
   - If absent: skip and tell the user `npm i -g @mermaid-js/mermaid-cli` enables it. **Never install it automatically.**
