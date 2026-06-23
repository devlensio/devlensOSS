# /devlens guard — warn before risky edits (high-value / high-blast-radius nodes)

Check whether a change touches **load-bearing** code and warn before it's edited — covering every affected node. **Argument:** `<symbol-or-file>` to check a target; with **no argument**, check the user's current **uncommitted changes**. Works on structure alone; richer with summaries.

Use proactively: when the user is about to edit, asks "is it safe to change X", or after edits but before committing.

## Method — find the targets, then measure risk
1. **Determine target node(s) — all of them:**
   - No arg → `git status --porcelain` / `git diff --name-only` for changed files (+ untracked), then `get_nodes_in_path <file>` for each → every changed node.
   - file → `get_nodes_in_path <file>`.
   - name/symbol → `find_nodes <name>`.
   - node id → `get_node <id>`.
2. **High-value bar for this graph:** `get_repo_overview` → top central nodes' scores + total node count. Treat a node as **high-value** if its `score` is at/near the lowest top-central score (typically ~7+) or it appears among the central nodes.
3. **Per target node, measure risk (run for each):**
   - `get_blast_radius <id>` → `count` of upstream dependents (the key signal) + the dependent nodes.
   - inspect `callers` (`get_node <id>`) for high-`score` neighbors.
   - note the node's `severity` (medium/high = extra scrutiny; `get_node` with `include: ["security"]` for detail).

## Risk scoring (per node)
- 🔴 **High** — high score AND/OR large blast radius (many dependents, e.g. a meaningful fraction of total nodes) AND/OR high security severity.
- 🟡 **Medium** — moderate blast radius, or a high-value direct neighbor.
- 🟢 **Low** — leaf/peripheral, few/no dependents.

## Output template
1. **Overall verdict** — the highest risk among the targets, one line ("⚠️ This change touches load-bearing code").
2. **Per-target table** — each affected node → risk level, `score`, blast-radius `count`, severity.
3. **For each 🔴/🟡** — **what could break** (the notable dependents from blast radius, with their one-line summaries) and **recommended precautions** (specific tests to run, request review, gate behind a flag, add coverage).
4. 🟢 targets — a single summary line so the report isn't noisy.

Cover every target node (don't check just one of several changed files).
