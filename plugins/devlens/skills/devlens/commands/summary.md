# /devlens summary — technical / functional / security overview

Pull the right summary lens for a target without reading raw source, covering **all** the relevant nodes. **Arguments:** `[technical|functional|security] <node|file|folder>`. Default kind: `technical`. Target optional (defaults to the repo's central nodes).

**Needs summaries** — follow the freshness/summarize-permission policy in SKILL.md first.

## Kind → CLI mapping
| You ask for | CLI `-i` kind |
| :-- | :-- |
| technical | `technical` |
| functional | `business` |
| security | `security` |

## MANDATORY — resolve the target to node id(s), covering everything in scope
- **node id** (`src/x.ts::fn`) → use directly.
- **name** → `devlens find-nodes <name> --json`; cover all clear matches (ask if ambiguous).
- **file** → `devlens nodes-in-path <file> --json` → **all** its nodes.
- **folder** → `devlens nodes-in-path <folder> --json` (optionally `-t`) → **all** nodes under it; if very many, cover the highest-`score` ones and note the count.
- **no target** → `devlens top-nodes -l 20 --json` → summarize those.

## Fetch the summaries
- Batch (preferred): `devlens get-summaries <id1> <id2> … -i <kind> --json`.
- Single deep-dive: `devlens get-node <id> -i technical|business|security --json`.

## OUTPUT TEMPLATE
1. **Scope** — what was summarized (the target + how many nodes).
2. **Per-node summaries** — for each node (ordered by `score`, or by `severity` for the security kind): **`name`** — `filePath:lines` — the requested summary. Cover all in-scope nodes; for a large folder, group by sub-area and show the most important, noting the remainder count.
3. **Takeaway** — 2–3 sentences synthesizing what this code does / means / risks (matching the kind).

This is the cheap path — don't read files; only suggest `node-code` if a summary is genuinely insufficient for the user's goal.
