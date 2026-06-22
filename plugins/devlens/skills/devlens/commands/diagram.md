# /devlens diagram — Mermaid diagrams from the graph

Render the graph visually. **Argument:** `[architecture|cluster|flow|deps]` (default `architecture`). For `cluster`/`flow`, an optional second arg is a seed node id/name.

> Build the node/edge data from `find-nodes`, `get-node`, `khop`, and `blast-radius` — each connection carries **`viaEdge`** (the edge type). Do **NOT** rely on `devlens subgraph --json`; it currently emits a text cluster listing, not JSON.

## Views & commands
- **architecture** (default) — `devlens overview --json` (stats + topNodes/topFiles) + `devlens find-nodes -l 2000 --json`. Group nodes by top-level directory into **modules**; draw each module as a Mermaid `subgraph` block holding its key nodes; connect modules using edges sampled from `devlens khop <id> -r 2 --json` / `devlens get-node <id> --json` on the central nodes.
- **cluster** `[seed]` — resolve a name→id via `find-nodes`, then `devlens khop <id> -r 2 --json` + `devlens blast-radius <id> -r 2 --json`; render the seed and its neighbors, each edge labeled by `viaEdge`.
- **flow** `[seed]` — `devlens get-node <id> --json` (callers/callees) + `devlens khop <id> -r 2 --json`; render call/data flow around the node.
- **deps** — `devlens top-nodes -l 20 --json`, then `devlens get-node <id> --json` on each to read `callees` (with `viaEdge`); render the dependency graph among the top nodes.

## Visual encoding (pin this table — keep output consistent)
Render a `flowchart LR`. Map each **node type** (the node's `type`) to a fixed shape + `classDef`:
| Node type | Mermaid shape | classDef style |
| :-- | :-- | :-- |
| COMPONENT | `id["name"]` (rect) | `fill:#dbeafe,stroke:#3b82f6` |
| HOOK | `id(["name"])` (stadium) | `fill:#ede9fe,stroke:#8b5cf6` |
| FUNCTION | `id("name")` (rounded) | `fill:#f3f4f6,stroke:#6b7280` |
| ROUTE | `id{{"name"}}` (hexagon) | `fill:#dcfce7,stroke:#22c55e` |
| STATE_STORE | `id[("name")]` (cylinder) | `fill:#ffedd5,stroke:#f97316` |
| FILE | `id[/"name"/]` (parallelogram) | `fill:#f1f5f9,stroke:#94a3b8` |
| other | `id["name"]` (rect) | `fill:#ffffff,stroke:#9ca3af` |

Map each **edge type** (the `viaEdge` value). There are 12 edge types but only a few Mermaid line styles, so **always put the exact type as the edge label** and group the line style by category:
| Edge category | Edge types | Arrow |
| :-- | :-- | :-- |
| control / call | CALLS, USES, HANDLES, GUARDS, WRAPPED_BY | `A -->|CALLS| B` (solid) |
| import / structure | IMPORTS | `A -.->|IMPORTS| B` (dotted) |
| data | READS_FROM, WRITES_TO | `A ==>|READS_FROM| B` (thick) |
| events / props | EMITS, LISTENS, PROP_PASS | `A --o|EMITS| B` (circle-end) |
| tests | TESTS | `A -.->|TESTS| B` (dotted) |

(The label always shows the precise `viaEdge`; the line style conveys the category at a glance.)

Define classes with `classDef` and assign via `class id1,id2 component;` etc. Add a small **Legend** `subgraph` showing one example of each node shape and each edge style present, so the diagram is self-describing. Keep it readable: cap at ~30–40 nodes (use top-nodes / a seed), and collapse less-central nodes.

## Encode meaning + security (use the summaries, not just structure)
- **Security severity** — every node ref carries `severity` (none|low|medium|high). Mark risky nodes: append a badge to the label (`⚠high` / `⚠med`) **and** apply an overlay class `classDef sevHigh stroke:#dc2626,stroke-width:4px;` / `classDef sevMed stroke:#f59e0b,stroke-width:3px;` to those node ids (a second `class <id> sevHigh;` line layers on top of the type class). Pull richer notes with `devlens security --json` when the user wants detail.
- **Role labels** — keep the in-node label short (the node `name`), but accompany the diagram with a compact key listing each shown node → a one-line role taken from its **functional** summary (`get-summaries -i business`), so the picture is readable. For a focused `flow`/`cluster` diagram, you may inline a few words of the technical summary under important nodes.

## Delivery (do all three)
1. **Inline** — print the Mermaid in a ```mermaid code block in your reply.
2. **Save** — write it to `devlens-<view>.md` (wrapped in a ```mermaid block) in the cwd so it renders in GitHub/IDE preview. Also acceptable: `devlens-<view>.mmd`.
3. **Render an image (best effort)** — if a Mermaid renderer is available, produce a PNG/SVG:
   - Detect: `mmdc --version` (the `@mermaid-js/mermaid-cli` binary) or `npx --no-install @mermaid-js/mermaid-cli --version`.
   - If present: `mmdc -i devlens-<view>.mmd -o devlens-<view>.png` (or `.svg`).
   - If absent: skip gracefully and tell the user `npm i -g @mermaid-js/mermaid-cli` enables rendered images. **Never install it automatically.**
