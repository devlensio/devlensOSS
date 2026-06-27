# /devlens impact — change impact for a symbol/file

Answer "what breaks if I change X" and "what does X depend on". **Argument:** `<symbol-or-file>` (a node name, node id, or file path). Works on **structure alone** — no summarize permission needed.

## Resolve the target → node id
- A **node id** → use directly.
- A **name** → `find_nodes <name>`; if several match, ask which or take the most central.
- A **file** → `get_nodes_in_path <file>` (impact each significant node, or the whole file's nodes).

## Tools used
1. **Upstream impact** (dependents — what breaks): `get_blast_radius <id>`. Default radius 2 (capped on huge fan-out — re-call with an explicit `radius` for deeper/uncapped). Pass `edgeTypes` to focus (e.g. `["CALLS"]`).
2. **Downstream deps** (what it relies on): `get_khop <id>` (same `radius`/`edgeTypes`).

When summaries are available, describe the target and its impacted nodes from their `summary` fields (blast-radius/khop results already include `summary`) instead of reading files — cheaper and clearer. Fall back to files only if summaries are missing.

When the target is (or reaches) an **API `ROUTE`**, look one hop past the calling component: the `NEXTJS_API_CALL` edge composes with `HANDLES`, so the blast radius surfaces the **page route(s)** that ultimately depend on the endpoint. Report that page→API coupling explicitly — "changing this endpoint affects the `/watch/:id` page" is exactly the cross-boundary impact users want.

## Output
- **If you change `<target>`, these may break** — the upstream dependents grouped by file/area, nearest first; call out tests, API routes, and the **page routes** reached via `NEXTJS_API_CALL`.
- **`<target>` depends on** — the downstream nodes it needs.
- A risk read: low/medium/high based on the size and centrality of the blast radius.
- **Empty/thin result caveat:** an empty or surprisingly small blast radius means "no callers *in the graph*," not "safe to change." The real caller may be an un-extracted call site (a `fetch`/`axios` inside an object-literal method or config registry, or a URL used as `src`/`href`). Say "no graph-visible callers" and confirm with a targeted `Grep` before asserting safety.
- Offer `/devlens diagram flow <target>` to visualize it.
