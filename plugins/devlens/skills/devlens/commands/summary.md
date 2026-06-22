# /devlens summary — technical / functional / security overview

Pull the right summary lens for a target without reading raw source. **Arguments:** `[technical|functional|security] <node|file|folder>`. Default kind: `technical`. Target optional (defaults to the repo's central nodes).

**Needs summaries** — follow the freshness/summarize-permission policy in SKILL.md first.

## Kind → CLI mapping
| You ask for | CLI `-i` kind |
| :-- | :-- |
| technical | `technical` |
| functional | `business` |
| security | `security` |

## Resolve the target → node id(s)
- A **node id** (e.g. `src/x.ts::fn`) → use directly.
- A **name** → `devlens find-nodes <name> --json` and pick the match(es).
- A **file** → `devlens nodes-in-path <file> --json`.
- A **folder** → `devlens nodes-in-path <folder> --json` (optionally `-t` to filter types).
- **No target** → `devlens top-nodes -l 15 --json`, then summarize those.

## Fetch summaries
- One node: `devlens get-node <id> -i <kind> --json` (kind = technical|business|security).
- Many nodes (batch — preferred): `devlens get-summaries <id1> <id2> … -i <kind> --json`.

## Output
For each node: name + file:line + the requested summary, ordered by centrality (score) or severity (for security). Keep it tight — this is the cheap path; only suggest `node-code` if a summary is genuinely insufficient.
