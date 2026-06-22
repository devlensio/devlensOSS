# /devlens architecture — system design brief

Produce a **complete** map of the codebase, not a sample. The graph can be large (hundreds of nodes); cover every node type, the module/layer structure, the key connections **and their edge types**, and the risks. Arguments: none (operates on the cwd graph; `-g <id>` to target another).

**Needs summaries** for the richest output — follow the freshness/summarize-permission policy in SKILL.md first.

## Commands & how to use them
1. **Headline stats:** `devlens overview --json` → `stats.totalNodes`/`totalEdges`, `routeCount`, `fingerprint` (framework, router, stateManagement, dataFetching, databases), plus `topNodes` (10) and `topFiles` (10).
2. **Full node inventory (this is what makes it complete):** `devlens find-nodes -l 2000 --json` → **all** nodes as compact refs `{id, name, type, filePath, score, severity, summary}`. From this, compute:
   - the **node-type distribution** (counts per type: COMPONENT, FUNCTION, FILE, ROUTE, STATE_STORE, HOOK, …);
   - **modules/layers** by grouping nodes on their top-level directory (e.g. `src/app/api`, `src/components`, `src/app/firebase`, `src/components/ZustandStores`).
3. **Backbone enumeration** (the structural anchors):
   - Entry points: `devlens find-nodes -t ROUTE -l 200 --json`.
   - State: `devlens find-nodes -t STATE_STORE -l 50 --json`.
   - Key UI/logic: the highest-`score` COMPONENT/FUNCTION nodes from the inventory (or `devlens top-nodes -l 20 --json`).
4. **Connections + edge types** — do **NOT** use `devlens subgraph --json` (it currently prints a text cluster listing, not JSON). Instead, for the central nodes (topNodes) and each store/route hub:
   - `devlens khop <id> -r 2 --json` (downstream) and/or `devlens blast-radius <id> -r 2 --json` (upstream). Each returned node carries **`viaEdge`** (the edge type: CALLS, IMPORTS, READS_FROM, WRITES_TO, PROP_PASS, USES, HANDLES, …) and `hop`.
   - For one node's immediate wiring: `devlens get-node <id> --json` → `callers`/`callees`, each with `viaEdge`.
   - Aggregate the `viaEdge` values to describe how modules connect and which edge types dominate.
5. **Meaning (batch, cheap):** `devlens get-summaries <id...> -i business --json` (functional) **and** `-i technical --json` for the backbone nodes. Use the **functional** summary to say what each module/node means for the product and the **technical** summary to say what it does — describe every module and backbone node from its summaries, not from its name alone.
6. **Security posture:** every compact node ref carries a `severity` (none|low|medium|high); also run `devlens security --min-severity low --json` for the flagged set with `securitySummary`. Fold this into the brief — call out which modules/nodes carry medium/high risk.

## Output — a thorough brief
- **Stack** — framework + router, state management, data fetching, databases, notable deps.
- **By the numbers** — `totalNodes`/`totalEdges`, `routeCount`, and the **node-type distribution** (counts per type).
- **Modules / layers** — the directory groups, each with its purpose **drawn from the functional + technical summaries** and representative nodes.
- **Backbone** — key routes (entry points), stores (state), and central components/functions, each with a one-line role from its summary.
- **How it connects** — the dominant **edge types** (CALLS/IMPORTS/READS_FROM/WRITES_TO/PROP_PASS/HANDLES/USES/…) and the main data/control-flow paths between modules (from the `viaEdge` data in step 4).
- **Security posture** — modules/nodes with medium/high `severity`, summarized from their `securitySummary` (step 6).
- **Risks** — cycles (`devlens cycles --json`) and high-fan-in hubs (large blast radius).

End by offering `/devlens diagram architecture` for a visual and `/devlens explain` for an onboarding walkthrough.
