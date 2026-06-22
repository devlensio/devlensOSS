# /devlens tech-debt — dependency health & coupling hotspots

Find structural debt. **Argument:** none. Works on **structure alone** (summaries optional), so no summarize permission needed.

## Commands used
1. `devlens cycles --json` — circular dependency groups (`{total, cycles}`). Each cycle is a chain that should usually be broken.
2. `devlens top-nodes -l 20 --json` — candidate hubs.
3. For the top hubs, measure coupling: `devlens blast-radius <id> -r 2 --json` (how many nodes depend on it) and optionally `devlens khop <id> -r 2 --json` (how much it depends on). High upstream fan-in = a change-risk hotspot.

When summaries are available, use each node's `summary` (and `get-summaries -i technical` for the worst offenders) to explain *why* a cycle or hub is a problem in concrete terms, rather than reading the files.

## Output
- **Cycles** — list each group with the nodes/files involved and a suggested break point.
- **Hotspots** — nodes with the largest blast radius (most dependents), ranked; flag any that are also large/central as refactor candidates.
- **Quick wins** — 3–5 concrete suggestions (break cycle X, split hub Y).
If `cycles.total` is 0, say so — that's a good sign.
