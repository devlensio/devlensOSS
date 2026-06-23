# /devlens tech-debt — dependency health & coupling hotspots

Produce a thorough tech-debt report: the circular dependencies, the real coupling hotspots, and oversized modules. Arguments: none. Works on structure alone (richer with summaries — no summarize permission needed for structure).

## Method — work the graph, in order
1. `list_cycles` → every circular-dependency group.
2. `get_repo_overview` → the top central nodes (hub candidates) + total counts.
3. For each top hub: `get_blast_radius <id>` (radius 2) → `count` of dependents (fan-in). High count = change-risk hotspot. (Optionally `get_khop <id>` for fan-out.)
4. **Oversized units:** use `get_subgraph` on hubs and `find_nodes` (by `dir`/`filePath`) to find god files (the most nodes in one file) and oversized modules (clusters/directories with the largest footprint).
5. **Meaning (when summaries exist):** `get_summaries` with `include: ["technical"]` for the worst offenders, to explain *why* each is a problem concretely — don't read files.

## Output template
1. **Health summary** — cycle count, number of high-fan-in hubs, number of god files.
2. **Circular dependencies** — list every cycle group: the nodes/files in the loop, and a suggested break point for each. (If there are 0 cycles, say so — that's a good sign.)
3. **Coupling hotspots** — nodes ranked by blast-radius `count` (most dependents first); for each: name, `filePath`, dependent count, and one line (from its summary) on what it does + why changing it is risky.
4. **Oversized files/modules** — files with the most nodes and modules with the largest footprint — candidates for splitting.
5. **Prioritized quick wins** — 3–5 concrete actions (break cycle X between A↔B, split god file Y, decouple hub Z), ordered by payoff.
