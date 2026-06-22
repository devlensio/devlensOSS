# /devlens guard — warn before risky edits (high-value / high-blast-radius nodes)

Check whether a change touches **load-bearing** code and warn before it's edited — covering **every** affected node. **Argument:** `<symbol-or-file>` to check a target; with **no argument**, check the user's current **uncommitted changes**. Works on structure alone; richer with summaries.

Use proactively: when the user is about to edit, asks "is it safe to change X", or after edits but before committing.

## MANDATORY data collection — run all before writing
1. **Determine target node(s) — all of them:**
   - No arg → `git status --porcelain` / `git diff --name-only` for changed files (+ untracked), then `devlens nodes-in-path <file> --json` for **each** → every changed node.
   - file → `devlens nodes-in-path <file> --json`.
   - name/symbol → `devlens find-nodes <name> --json`.
   - node id → `devlens get-node <id> --json`.
2. **High-value bar for this graph:** `devlens overview --json` → `topNodes` scores + `stats.totalNodes`. Treat a node as **high-value** if its `score` is at/near the lowest `topNodes` score (typically ~7+) or it appears in `topNodes`/`topFiles`.
3. **Per target node, measure risk (run for each):**
   - `devlens blast-radius <id> --json` → `count` of upstream dependents (the key signal) + the dependent nodes.
   - inspect `callers` (`devlens get-node <id> --json`) for high-`score` neighbors.
   - note the node's `severity` (medium/high = extra scrutiny; `get-node -i security` for detail).

## Risk scoring (per node)
- 🔴 **High** — high score AND/OR large blast radius (many dependents, e.g. a meaningful fraction of `totalNodes`) AND/OR high security severity.
- 🟡 **Medium** — moderate blast radius, or a high-value direct neighbor.
- 🟢 **Low** — leaf/peripheral, few/no dependents.

## OUTPUT TEMPLATE
1. **Overall verdict** — the highest risk among the targets, one line ("⚠️ This change touches load-bearing code").
2. **Per-target table** — each affected node → risk level, `score`, blast-radius `count`, severity.
3. **For each 🔴/🟡** — **what could break** (the notable dependents from blast radius, with their one-line summaries) and **recommended precautions** (specific tests to run, request review, gate behind a flag, add coverage).
4. 🟢 targets — a single summary line so the report isn't noisy.

Cover every target node (don't check just one of several changed files).
