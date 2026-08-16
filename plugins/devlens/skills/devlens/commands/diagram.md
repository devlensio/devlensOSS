# /devlens diagram — Mermaid diagrams from the graph

Render the graph visually. **Argument:** `[architecture|cluster|flow|deps]` (default `architecture`). For `cluster`/`flow`, an optional second arg is a seed node id/name.

The whole point is a diagram that exploits the precomputed graph — real modules, real typed edges, summary-derived labels, security and cycle overlays — i.e. something a raw LLM staring at files cannot produce. A vague 5-box diagram is the failure mode to avoid. Build structure from `get_subgraph` (clusters) and connections from `get_khop`/`get_blast_radius` (each result carries `viaEdge` = the edge type). Use hierarchy and a *set of diagrams* (not one dense mega-graph) to stay legible at scale — never a flat dump.

## architecture (default) — a layered diagram SET

Don't cram everything into one canvas. Produce a C4-style set, each readable on its own (this is how you include everything the architecture brief lists — routes, stores, hooks, route→function flow — without an unreadable hairball):

- **(L1) System context** — the app as one box with its external dependencies around it: databases, third-party services (THIRD_PARTY nodes), auth providers, caches. Shows the system's boundary and what it talks to.
- **(L2) Module map** — one `subgraph` per cluster-derived module, with the typed inter-module edges. The main structural view.
- **(L3) Request-flow sequences** — for the top 2–4 routes/user journeys, a Mermaid `sequenceDiagram` tracing route → handler → service → store/db, built from each route's `get_khop` call graph. This is usually the most illuminating diagram and the one a raw LLM gets wrong.

### Build the model (work the graph, in order)
1. `get_repo_overview` → language/framework + the exact counts (`routeCount`, totals) + top central nodes. These anchor coverage.
2. **Modules from clusters:** `get_subgraph` on each top central node → merge into a deduped set of **modules**. Each module becomes one Mermaid `subgraph` block. (This is what makes the diagram reflect the real architecture, not folder names.)
3. **Backbone in full:** `find_nodes` for **every** `ROUTE` (limit ≥ `routeCount`) plus the language's bounded sets — JS/TS: **every** `STATE_STORE` and **every** `HOOK`; Python/Java: top `CLASS`/`METHOD`/`FUNCTION`; Go: `STRUCT`/`INTERFACE`; Rust: `STRUCT`/`ENUM`/`TRAIT`/`IMPL_BLOCK` — map each onto its module. These bounded sets are never sampled or dropped.
4. **Route call graph:** for **each route**, `get_khop` → the handlers/services/functions it calls. Drives both the L2 route→handler edges and the L3 sequence diagrams.
5. **Module edges:** `get_khop`/`get_blast_radius` on each module's central node → cross-module connections with `viaEdge` types; also surface THIRD_PARTY/db dependencies for L1.
6. **Labels & patterns:** `get_summaries -i business` for module centers + key routes + backbone nodes → label nodes by what they do; reflect the architectural/system-design patterns the `/devlens architecture` brief detects (layers, provider/context, guard chains, repository, etc.) as the subgraph grouping and edge semantics.
7. **Overlays:** `list_cycles` (mark tangled members) and `get_security_issues` (badge risky nodes).

### Draw L2 (`flowchart LR`)
- **One `subgraph` block per module** (from step 2), titled with the module name + a one-line purpose from its summary + node count.
- **Include the whole backbone:** **every** route, and the language's key bounded nodes — JS/TS: every store + hook; Python/Java/Go/Rust: the classes/methods/structs/traits on important paths — each inside its module subgraph, plus the **handlers/services each route calls** (from step 4). Cite exact counts in the companion key (e.g. "Routes: 43/43, Stores: 7/7" or "Routes: 21/21, Structs: 18/18"). Only the *incidental* tail (low-score functions, utilities, files) may collapse into a `+N more` node per module — never a route or a backbone node. Offer `/devlens diagram cluster <module>` to zoom in.
- **Draw edges from the real `viaEdge` data** (steps 4–5): how routes reach handlers/components, how components read stores (READS_FROM), how modules depend on each other. Label each edge with its type. To control clutter, **aggregate** many parallel node-to-node edges between two modules into one module-to-module edge annotated with a count/the dominant type, while keeping individual edges for the key request paths.
- Apply the node-type/edge styling, the severity overlay, and the legend below.

### Draw L3 (`sequenceDiagram`) — per key route
Participants = the route, its handler(s), services/utilities, and the store/db it touches (from the route's step-4 call graph, in call order). Arrows = the actual CALLS/READS_FROM/WRITES_TO edges. One short sequence per top route makes the request flow concrete.

### Mermaid correctness (do this so it actually renders)
- **Sanitize node IDs:** use a safe slug derived from the node id (replace every char outside `[A-Za-z0-9_]` with `_`); keep a map back to the real id for the key. Never put raw paths/`::`/`/`/`.` in an id.
- **Escape labels:** wrap every label in quotes (`id["..."]`); replace `"`/newlines inside labels; keep labels short (name + maybe a 2–3 word role) — put full descriptions in the companion key, not on the node.
- **Keep it valid:** declare each node once; assign classes after nodes exist; don't emit empty subgraphs. After saving, if a renderer is available, render and **read the error**; on a syntax failure, fix and re-render before delivering.

## Other views
- **cluster** `[seed]` — resolve name→id via `find_nodes`, then `get_subgraph <id>` → render the cluster's nodes and its internal edges (the tool returns them directly); enrich with `get_khop`/`get_blast_radius` for edges leaving the cluster.
- **flow** `[seed]` — `get_node <id>` (callers/callees) + `get_khop <id>` → render the genuine call/data path through the node, end to end.
- **deps** — top central nodes from `get_repo_overview`, then `get_node` on each to read `callees`/`viaEdge` (or `get_khop` r=1) → render the dependency graph among the hubs; overlay `list_cycles`.

## Visual encoding (pin this — keep output consistent)
Map each **node type** to a fixed shape + `classDef`. For non-JS repos the type set is CLASS/METHOD/STRUCT/INTERFACE/ENUM/TRAIT/IMPL_BLOCK/FUNCTION/ROUTE/… — use the same encoding, so a Python class and a Java class draw identically:
| Node type | Mermaid shape | classDef style |
| :-- | :-- | :-- |
| COMPONENT / CLASS / STRUCT | `id["name"]` (rect) | `fill:#dbeafe,stroke:#3b82f6` |
| HOOK / TRAIT / INTERFACE | `id(["name"])` (stadium) | `fill:#ede9fe,stroke:#8b5cf6` |
| FUNCTION / METHOD | `id("name")` (rounded) | `fill:#f3f4f6,stroke:#6b7280` |
| ROUTE | `id{{"name"}}` (hexagon) | `fill:#dcfce7,stroke:#22c55e` |
| STATE_STORE | `id[("name")]` (cylinder) | `fill:#ffedd5,stroke:#f97316` |
| UTILITY | `id["name"]` (rect) | `fill:#fef9c3,stroke:#ca8a04` |
| ENUM | `id:::name` (rhombus) | `fill:#fce7f3,stroke:#db2777` |
| IMPL_BLOCK | `id["impl"]` (rect, dashed) | `fill:#f1f5f9,stroke:#64748b,dashed` |
| FILE | `id[/"name"/]` (parallelogram) | `fill:#f1f5f9,stroke:#94a3b8` |
| other (TEST/STORY/THIRD_PARTY/GHOST) | `id["name"]` (rect) | `fill:#ffffff,stroke:#9ca3af` |

Map each **edge type** (`viaEdge`); always label the edge with the exact type, line style by category:
| Category | Edge types | Arrow |
| :-- | :-- | :-- |
| control / call | CALLS, USES, HANDLES, GUARDS, WRAPPED_BY | `-->|CALLS|` (solid) |
| import / structure | IMPORTS | `-.->|IMPORTS|` (dotted) |
| data | READS_FROM, WRITES_TO | `==>|READS_FROM|` (thick) |
| inheritance | EXTENDS, IMPLEMENTS | `==>|IMPLEMENTS|` (thick, open head) |
| events / props | EMITS, LISTENS, PROP_PASS | `--o|EMITS|` (circle-end) |
| tests | TESTS | `-.->|TESTS|` (dotted) |

Define classes via `classDef` and assign `class id1,id2 component;`. **Security severity:** append a badge to risky node labels (`⚠high`/`⚠med`) and layer an overlay class `classDef sevHigh stroke:#dc2626,stroke-width:4px;` / `sevMed stroke:#f59e0b,stroke-width:3px;` via a second `class <id> sevHigh;` line. **Cycles:** if `list_cycles` returns groups, add a note or a dashed grouping so tangled members are visible. Add a **Legend** `subgraph` showing one example of each node shape, each edge category, and any severity badges present.

## Delivery
For the architecture view this is a **set** (L1 context, L2 module map, L3 sequences) — deliver each diagram; for the other views it's a single diagram.
1. **Inline** — print each Mermaid in its own ```mermaid code block, labeled (e.g. "L1 — System context").
2. **Save** — write to `devlens-<view>.md` (each diagram in its own ```mermaid block) so it renders in GitHub/IDE preview (also accept `.mmd`). Accompany with a **key**: each shown node id (use the sanitized→real id map) → one-line role from its business summary, plus the coverage counts (routes/stores/hooks/modules).
3. **Render an image (best effort)** — if a Mermaid renderer is available, make a PNG/SVG:
   - Detect: `mmdc --version` or `npx --no-install @mermaid-js/mermaid-cli --version`.
   - If present: `mmdc -i devlens-<view>.mmd -o devlens-<view>.png`.
   - If absent: skip and tell the user `npm i -g @mermaid-js/mermaid-cli` enables it. **Never install it automatically.**

If a step's tool isn't available (e.g. no renderer), skip it gracefully and note what was skipped — don't fail the whole diagram.
