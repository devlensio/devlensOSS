# /devlens diagram — Mermaid diagrams from the graph

Render the graph visually. **Argument:** `[architecture|cluster|flow|deps]` (default `architecture`). For `cluster`/`flow`, an optional second arg is a seed node id/name.

## Views & commands
- **architecture** (default) — `devlens overview --json` + `devlens top-nodes -l 12 --json`; lay out central modules grouped by area/cluster.
- **cluster** — `devlens subgraph <seedNodeId> --json` (resolve a name to an id via `find-nodes` first); render the cohesive group.
- **flow** — `devlens get-node <id> --json` (callers/callees) + `devlens khop <id> -r 2 --json`; render call/data flow around the node.
- **deps** — `devlens top-nodes -l 20 --json` + `devlens get-node <id> -i callees --json` on the top nodes; render the dependency graph.

## Visual encoding (pin this table — keep output consistent)
Render a `flowchart LR`. Map each **node type** to a fixed shape + class:
| Node type | Mermaid shape | classDef style |
| :-- | :-- | :-- |
| COMPONENT | `id["name"]` (rect) | `fill:#dbeafe,stroke:#3b82f6` |
| HOOK | `id(["name"])` (stadium) | `fill:#ede9fe,stroke:#8b5cf6` |
| FUNCTION | `id("name")` (rounded) | `fill:#f3f4f6,stroke:#6b7280` |
| ROUTE | `id{{"name"}}` (hexagon) | `fill:#dcfce7,stroke:#22c55e` |
| STORE | `id[("name")]` (cylinder) | `fill:#ffedd5,stroke:#f97316` |
| other | `id["name"]` (rect) | `fill:#ffffff,stroke:#9ca3af` |

Map each **edge type** to a fixed line style + label:
| Edge type | Arrow | Meaning |
| :-- | :-- | :-- |
| CALLS | `A -->|CALLS| B` | solid |
| IMPORTS | `A -.->|IMPORTS| B` | dotted |
| READS_FROM | `A ==>|READS_FROM| B` | thick |
| RENDERS | `A --o|RENDERS| B` | circle-end |
| other | `A -->|TYPE| B` | solid |

Define classes with `classDef` and assign via `class id1,id2 component;` etc. Add a small **Legend** `subgraph` showing one example of each node shape and each edge style present in the diagram, so it is self-describing. Keep diagrams readable: cap at ~30–40 nodes (use top-nodes / a seed), and collapse less-central nodes.

## Delivery (do all three)
1. **Inline** — print the Mermaid in a ```mermaid code block in your reply.
2. **Save** — write it to `devlens-<view>.md` (wrapped in a ```mermaid block) in the cwd so it renders in GitHub/IDE preview. Also acceptable: `devlens-<view>.mmd`.
3. **Render an image (best effort)** — if a Mermaid renderer is available, produce a PNG/SVG:
   - Detect: `mmdc --version` (the `@mermaid-js/mermaid-cli` binary) or `npx --no-install @mermaid-js/mermaid-cli --version`.
   - If present: `mmdc -i devlens-<view>.mmd -o devlens-<view>.png` (or `.svg`).
   - If absent: skip gracefully and tell the user `npm i -g @mermaid-js/mermaid-cli` enables rendered images. **Never install it automatically.**
