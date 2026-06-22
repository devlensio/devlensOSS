# /devlens architecture — system design brief

Produce a **comprehensive** architecture document for a real, often large codebase (hundreds of nodes). A short summary is a FAILURE — the output must reflect the true scale: enumerate routes, stores, hooks, and modules; give exact counts; identify patterns. Arguments: none (cwd graph; `-g <id>` to target another). **Needs summaries** for the richest output — follow the freshness/summarize-permission policy in SKILL.md first.

## MANDATORY data collection — run ALL of these before writing anything
Do not skip steps or stop early. Parse each `--json` result and keep it.

1. `devlens overview --json` → `stats.totalNodes`, `stats.totalEdges`, `routeCount`, `fingerprint` (framework, router, stateManagement, dataFetching, databases, rawDependencies), `topNodes`, `topFiles`.
2. `devlens find-nodes -l 5000 --json` → **every node**. Compute:
   - exact **count per node type** (COMPONENT, FUNCTION, FILE, ROUTE, STATE_STORE, HOOK, UTILITY, TEST, STORY, THIRD_PARTY);
   - a **module map** by grouping node `filePath`s on their top-level and second-level directory (e.g. `src/app/api/...`, `src/components/...`, `src/app/firebase/...`), with a node count per module.
3. `devlens find-nodes -t ROUTE -l 500 --json` → **all routes**. (To split PAGE vs API_ROUTE vs LAYOUT, read `metadata.routeNodeType` via `devlens get-node <id> --json` on a sample, or infer from path: `route.js`=API, `page.js`=PAGE.)
4. `devlens find-nodes -t STATE_STORE -l 200 --json` → **all stores**.
5. `devlens find-nodes -t HOOK -l 200 --json` → **all hooks**.
6. `devlens find-nodes -t COMPONENT -l 500 --json` → all components (if very many, list the count and the highest-`score` ones).
7. `devlens top-nodes -l 25 --json` → the 25 most central nodes.
8. **Connections / edge types:** for the top ~10 central nodes AND each store, run `devlens khop <id> -r 2 --json` (and `devlens get-node <id> --json` for callers). Aggregate the `viaEdge` values to learn which edge types dominate (CALLS, IMPORTS, READS_FROM, WRITES_TO, PROP_PASS, USES, HANDLES, …) and which modules connect to which.
9. `devlens cycles --json` → circular-dependency groups.
10. `devlens security --min-severity low --json` → severity distribution + flagged nodes.
11. **Meaning:** `devlens get-summaries <ids...> -i business --json` and `-i technical --json` for the backbone (top central nodes, every store, representative route/component per module). Describe things from their summaries, not their names.

## Identify architectural patterns (explicitly)
From the fingerprint + module map + edge mix, name the concrete patterns, e.g.: routing strategy (Next.js App Router, pages vs API routes), state management (Zustand stores — list them), data fetching (axios/fetch + API route handlers), persistence/caching (Firebase, Redis/Upstash), auth/guards (GUARDS edges, auth utils), event flow (EMITS/LISTENS), shared-core utilities. Don't just list libraries — say how the app is structured around them.

## OUTPUT TEMPLATE — fill EVERY section, in full
> Scale your detail to the graph. For a 600-node repo this should be a thorough multi-section document, not a paragraph.

1. **What it is** — 2–4 sentences on the product/domain (from business summaries) + the stack (framework, router, state, data, db).
2. **By the numbers** — a table: total nodes, total edges, route count; then the **per-type counts** from step 2; then the **security severity counts** from step 10.
3. **Architectural patterns** — the patterns identified above, each with a sentence on how it's used here.
4. **Modules / layers** — a table of every significant directory module → node count, purpose (from summaries), and 2–3 representative nodes. Cover the whole tree, not just a few.
5. **Routes / entry points** — **list all routes** (group PAGE vs API_ROUTE), with a one-line purpose for the important ones.
6. **State stores** — **list every store** and what state each owns.
7. **Hooks** — **list every custom hook** and its job.
8. **Core nodes** — the most central components/functions (from top-nodes), each with its role.
9. **How it connects** — the dominant edge types and the main data/control-flow paths between modules (from step 8).
10. **Security posture** — medium/high-`severity` nodes, summarized from their `securitySummary`.
11. **Risks & tech debt** — cycles (from step 9) and high-fan-in hubs (large blast radius).
12. **Next** — suggest `/devlens diagram architecture` for a visual and `/devlens explain` for an onboarding walkthrough.

If summaries are missing (structure-only graph), still complete every structural section (1–9 counts/lists, 11) and note which parts need `--summarize`.
