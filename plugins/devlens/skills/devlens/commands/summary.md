# /devlens summary — technical / functional / security overview

Pull the right summary lens for a target without reading raw source, covering the relevant nodes. **Arguments:** `[technical|functional|security] <node|file|folder>`. Default kind: `technical`. Target optional (defaults to the repo's central nodes).

**Needs summaries** — follow the freshness/summarize-permission policy in SKILL.md first.

## Kind → `include` mapping
| You ask for | `include` kind |
| :-- | :-- |
| technical | `technical` |
| functional | `business` |
| security | `security` |

## Resolve the target to node id(s)
- **node id** (`src/x.ts::fn`) → use directly.
- **name** → `find_nodes <name>`; cover the clear matches (ask if ambiguous).
- **file** → `get_nodes_in_path <file>` → its nodes.
- **folder** → `get_nodes_in_path <folder>` (optionally a `nodeTypes` filter) → nodes under it; if very many, cover the highest-`score` ones and note the count.
- **no target** → the top central nodes from `get_repo_overview` → summarize those.

## Fetch the summaries
- Batch (preferred): `get_summaries` with the resolved `nodeIds` and `include: [<kind>]`.
- Single deep-dive: `get_node <id>` with `include: ["technical"]` / `["business"]` / `["security"]`.

## Output template
1. **Scope** — what was summarized (the target + how many nodes).
2. **Per-node summaries** — for each node (ordered by `score`, or by `severity` for the security kind): **`name`** — `filePath:lines` — the requested summary. For a large folder, group by sub-area and surface the most important, noting the remainder count.
3. **Takeaway** — 2–3 sentences synthesizing what this code does / means / risks (matching the kind).

This is the cheap path — don't read files; only suggest `get_node_code` if a summary is genuinely insufficient for the user's goal.
