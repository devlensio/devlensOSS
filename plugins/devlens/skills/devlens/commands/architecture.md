# /devlens architecture — system design brief

Produce a thorough architecture document grounded in the graph — the kind of brief a raw LLM *can't* write because it's built from the codebase's real clusters, real edges, and precomputed business summaries. Arguments: none (cwd graph; pass a `graphId` to target another). **Needs summaries** for the richest output — follow the freshness/summarize-permission policy in SKILL.md first.

This is not a node-dump. You build a **module model from the graph's own clustering**, label it from summaries, wire it with real traversal edges, and overlay health. Account for the whole repo (cite exact counts), but synthesize — don't paste raw lists.

**Completeness floor (the architectural backbone — always cover in full):** routes, state stores, and custom hooks are bounded, high-value sets — **enumerate every one of them**, no sampling. For **each route**, also trace the functions/handlers it calls (its downstream call graph) — that entry-point flow is the core of the architecture. The long tail that may be summarized as "+N more" is the *incidental* nodes (low-score components, utilities, files), never a route, store, hook, or a function on a route's path.

## Method — work the graph, in order

1. **Orient.** `get_repo_overview` → record the framework fingerprint (framework, router, state management, data fetching, databases) and the **exact** counts: total nodes, total edges, `routeCount`, and the top central nodes. These counts anchor the whole report.

2. **Build the module model from clusters.** For each of the top ~8–12 central nodes, call `get_subgraph` → the cohesive cluster it belongs to. Merge the clusters into a **deduped set of modules** (bounded contexts). These graph-derived clusters — not directory-name guesses — are your modules. For each module note: a name, its member nodes, and the directory(ies) it spans. If two central nodes return overlapping clusters, treat them as one module.

3. **Enumerate the backbone in full.** `find_nodes` with `nodeTypes: ["ROUTE"]` and a `limit` ≥ `routeCount` so you get **every** route (split PAGE vs API where known); then `["STATE_STORE"]` for **every** store; then `["HOOK"]` for **every** custom hook. Map each onto the module it belongs to (by cluster membership or path). These three sets are bounded — do not sample them.

4. **Trace the route call graph.** For **each route**, call `get_khop` (downstream) → the functions/handlers/services it reaches. This is the entry-point flow that *is* the architecture: request → handler → data/state. Capture, per route, the direct handlers it calls and the key services on its path (collapse only deep, repetitive tails). For modules, also run `get_blast_radius` (upstream) on each module's central node. Aggregate the `viaEdge` types to learn which edge kinds dominate (CALLS, IMPORTS, READS_FROM, WRITES_TO, GUARDS, HANDLES, …) and **which modules connect to which** — real data/control-flow paths, not guesses.

5. **Attach meaning.** Batch `get_summaries` with `include: ["business"]` (and `["technical"]` where you need the how) for the module centers, the important routes, and every store. Describe each module by what it *does for the product*, not by its name.

6. **Pick the key flows.** From the routes + their call graphs (step 4) and the top central nodes, choose the **2–4 most important end-to-end journeys** — the ones that define the product (e.g. auth/login, the primary read path, the primary write/mutation, a background/webhook job). For each, walk its `get_khop` chain in call order (route → guard/middleware → handler → service → store/db → response), pulling each node's summary so every step is described by what it *does*, not just its name.

7. **Overlay health.** `list_cycles` → circular-dependency groups. `get_security_issues` → severity distribution and the flagged nodes. Map both onto the modules.

## Detect the patterns (architectural AND system-design) — explicitly
From the fingerprint + module model + dominant edge mix + route call graph, name the concrete patterns. Cover two levels:

- **Architectural patterns** — how the codebase is organized: routing strategy (e.g. Next.js App Router, pages vs API routes), state management (the actual stores — list them), data-fetching approach (fetch/axios + route handlers, server actions, RSC), layering (presentation / hooks / services / data), module boundaries (from the clusters), auth/guards (GUARDS edges, auth utilities), event flow (EMITS/LISTENS), shared-core utilities, error/validation handling.
- **System-design patterns** — how the system behaves: client–server split, API design (REST route handlers, RPC, GraphQL), persistence & caching (Firebase, Redis/Upstash, ISR/SWR), background/async work (queues, webhooks, cron), third-party integrations (THIRD_PARTY edges), and recognizable design patterns where they appear (provider/context, repository, adapter/wrapper via WRAPPED_BY, middleware/guard chains, observer via EMITS/LISTENS, singleton stores).

For each named pattern, say *how the app is structured around it and where it shows up* (cite the modules/routes/edges that evidence it) — don't just list libraries.

## Output template
Build a layered brief. Be comprehensive through structure and exact counts — represent long tails as "+N more (see `/devlens diagram cluster <module>`)" rather than pasting raw node lists.

1. **What it is** — 2–4 sentences on the product/domain (from business summaries) + the stack (framework, router, state, data, db).
2. **By the numbers** — total nodes, total edges, route count, per-type counts (from `find_nodes` by type), and the security severity distribution. Cite the figures from `get_repo_overview`.
3. **Architectural & system-design patterns** — the patterns named above (both levels), each with a sentence on how it's used here and the evidence for it.
4. **Modules / bounded contexts** — the heart of the brief. For **each module from step 2**: its purpose (from business summaries), the directories it spans, its key nodes (central members, plus the routes/stores/hooks mapped to it), and its rough size (node count, "+N more" for the *incidental* tail only). Cover every module; don't stop at the top few.
5. **Routes / entry points (complete)** — **every** route, grouped PAGE vs API and by module, each with a one-line purpose and the **functions/handlers it calls** (from the step-4 call graph). This is the request-flow backbone — list all routes; collapse only deep repetitive call tails.
6. **State stores (complete)** — **every** store, what state each owns (from summaries), and which modules read/write it (READS_FROM/WRITES_TO edges).
7. **Hooks (complete)** — **every** custom hook and its job (one line each).
8. **How it connects** — the dominant edge types and the main data/control-flow paths *between modules* (from step 4): how routes reach handlers, how components read stores, how modules depend on each other.
9. **Key flows (end to end)** — the 2–4 journeys from step 6, each as a **numbered, prose walkthrough**: every step is `name` (`filePath`) → what it does (from its summary), in call order from entry to data and back. Name the store/db/external each flow touches and any guard it passes. This is the text companion to the L3 sequence diagrams in `/devlens diagram architecture`.
10. **Core nodes** — the most central nodes (from `get_repo_overview`/centrality), each with its role from its summary.
11. **Security posture** — the medium/high-severity nodes, summarized from their security assessments, mapped to modules.
12. **Risks & tech debt** — cycles (from `list_cycles`) and high-fan-in hubs (large blast radius).
13. **Where to start reading** — a ranked path of ~8–12 nodes that a newcomer should read in order to follow the main flow.
14. **Next** — suggest `/devlens diagram architecture` for the visual and `/devlens onboard` (or `/devlens explain`) for a guided walkthrough.

If summaries are missing (structure-only graph), still produce the structural sections (2, 4 membership, 5 routes + call graph, 6–7 lists, 8, 9 flow skeletons, 10, 12, 13) from clusters + edges, and note which parts (1, 3, 11) need summarization.
