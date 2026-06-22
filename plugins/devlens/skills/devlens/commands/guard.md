# /devlens guard — warn before risky edits (high-value / high-blast-radius nodes)

Check whether a change touches **load-bearing** code and warn before it's edited. **Argument:** `<symbol-or-file>` to check a specific target; with **no argument**, check the user's current **uncommitted changes** (`git diff --name-only` + untracked). Works on structure alone; richer with summaries.

Use this proactively: when the user is about to edit, or asks "is it safe to change X", or after they've made edits but before committing.

## 1. Determine the target node(s)
- No arg → `git status --porcelain` / `git diff --name-only` for changed files, then `devlens nodes-in-path <file> --json` for each → the changed nodes.
- A file → `devlens nodes-in-path <file> --json`.
- A name/symbol → `devlens find-nodes <name> --json`.
- A node id → use directly (`devlens get-node <id> --json`).

## 2. Establish the "high-value" bar for this graph
- `devlens overview --json` → `topNodes` (their `score`s) and `stats.totalNodes`. Treat a node as **high-value** if its `score` is at/near the top tier (e.g. ≥ the lowest `topNodes` score, typically ~7+) or it appears in `topNodes`/`topFiles`.

## 3. Measure each target node's risk
For each target node:
- **Centrality:** its `score` (from find-nodes/get-node) vs the bar above.
- **Blast radius (the key signal):** `devlens blast-radius <id> --json` → `count` of upstream dependents. Large `count` (e.g. a meaningful fraction of `totalNodes`, or dozens of dependents) = changing it ripples widely.
- **Important neighbors:** scan the `blast-radius` / `get-node` `callers` for high-`score` nodes — editing a direct neighbor of a critical node is itself risky.
- **Security:** if the node's `severity` is medium/high, edits deserve extra scrutiny (`get-node -i security`).

## 4. Verdict — warn clearly
Emit a risk level per target and overall:
- 🔴 **High** — high score AND/OR large blast radius (many dependents) AND/OR high security severity. State plainly: "Editing `<name>` affects N dependents across <areas> — proceed carefully."
- 🟡 **Medium** — moderate blast radius or a high-value neighbor.
- 🟢 **Low** — leaf/peripheral node, few/no dependents.

For 🔴/🟡, include: **what could break** (the notable dependents from blast radius, with their one-line summaries), and **recommended precautions** (run these tests, request review, change behind a flag, add coverage). Keep 🟢 to a one-liner so it isn't noisy.
