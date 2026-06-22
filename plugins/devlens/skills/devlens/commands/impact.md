# /devlens impact — change impact for a symbol/file

Answer "what breaks if I change X" and "what does X depend on". **Argument:** `<symbol-or-file>` (a node name, node id, or file path). Works on **structure alone** — no summarize permission needed.

## Resolve the target → node id
- A **node id** → use directly.
- A **name** → `devlens find-nodes <name> --json`; if several match, ask which or analyze the most central.
- A **file** → `devlens nodes-in-path <file> --json` (impact each significant node, or the whole file's nodes).

## Commands used
1. **Upstream impact** (dependents — what breaks): `devlens blast-radius <id> --json`. Default radius 2 (capped on huge fan-out); pass `-r <n>` for deeper/uncapped. `-e <edge-types>` to focus (e.g. CALLS).
2. **Downstream deps** (what it relies on): `devlens khop <id> --json` (same `-r`/`-e`).

When summaries are available, describe the target and its impacted nodes from their `summary` fields (blast-radius/khop results already include `summary`) instead of reading files — cheaper and clearer. Fall back to files only if summaries are missing.

## Output
- **If you change `<target>`, these may break** — the upstream dependents grouped by file/area, nearest first; call out tests and routes.
- **`<target>` depends on** — the downstream nodes it needs.
- A risk read: low/medium/high based on the size and centrality of the blast radius.
- Offer `/devlens diagram flow <target>` to visualize it.
