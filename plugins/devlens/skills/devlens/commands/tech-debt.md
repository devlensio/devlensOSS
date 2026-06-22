# /devlens tech-debt — dependency health & coupling hotspots

Produce a thorough tech-debt report: **all** circular dependencies, the real coupling hotspots, and oversized modules. Arguments: none. Works on structure alone (richer with summaries — no summarize permission needed for structure).

## MANDATORY data collection — run all before writing
1. `devlens cycles --json` → `{ total, cycles }` — **every** circular-dependency group.
2. `devlens top-nodes -l 30 --json` → hub candidates.
3. For each top hub: `devlens blast-radius <id> -r 2 --json` → `count` of dependents (fan-in). High count = change-risk hotspot. (Optionally `devlens khop <id> -r 2 --json` for fan-out.)
4. `devlens find-nodes -l 5000 --json` → group by `filePath` to find **god files** (files with the most nodes) and by directory for oversized modules.
5. **Meaning (when summaries exist):** `devlens get-summaries <ids...> -i technical --json` for the worst offenders, to explain *why* each is a problem concretely (don't read files).

## OUTPUT TEMPLATE — fill every section
1. **Health summary** — cycle count, number of high-fan-in hubs, number of god files.
2. **Circular dependencies** — list **every** cycle group: the nodes/files in the loop, and a suggested break point for each. (If `cycles.total` is 0, say so — that's a good sign.)
3. **Coupling hotspots** — nodes ranked by blast-radius `count` (most dependents first); for each: name, `filePath`, dependent count, and one line (from its summary) on what it does + why changing it is risky.
4. **Oversized files/modules** — files with the most nodes and directories with the largest footprint — candidates for splitting.
5. **Prioritized quick wins** — 3–5 concrete actions (break cycle X between A↔B, split god file Y, decouple hub Z), ordered by payoff.
