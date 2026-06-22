# /devlens architecture — system design brief

Produce a high-level map of the codebase. Arguments: none (operates on the cwd graph; `-g <id>` to target another).

**Needs summaries** for the richest output — follow the freshness/summarize-permission policy in SKILL.md first.

## Commands used
1. `devlens overview --json` — fingerprint: `framework`, `router`, `stateManagement`, `dataFetching`, `databases`, `rawDependencies`, stats, central nodes.
2. `devlens top-nodes -l 15 --json` — the most central modules (`-l` sets how many).
3. `devlens subgraph <seedNodeId> --json` — run on the top 2–3 central node ids from step 2 to reveal their clusters.
4. `devlens cycles --json` — circular dependency groups (`{total, cycles}`).

## Output
A concise brief:
- **Stack** — framework + router, state management, data fetching, databases, notable deps.
- **Shape** — node/edge counts, dominant node types.
- **Core modules** — the central nodes (name, file, one-line role from their summary).
- **Clusters** — the cohesive groups from subgraph, and how they relate.
- **Risks** — any cycles, and unusually high-fan-out hubs.

End by offering `/devlens diagram architecture` for a visual and `/devlens explain` for an onboarding walkthrough.
