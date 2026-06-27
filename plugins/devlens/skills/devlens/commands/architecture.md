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

## Output discipline (read before writing)
A rich traversal is wasted if the write-up is rushed, garbled, or truncated. Hold these:
- **Lead with the exclusives.** Foreground what only the graph gives: **security severity flags are a mandatory call-out** (§10 — never bury a high-severity finding), describe connections by their **edge type**, and rank by **centrality**. These are exactly what a raw LLM can't produce.
- **No hand-drawn ASCII diagrams.** They break and truncate. Use **Markdown tables** for structure and **Mermaid** blocks for visuals (or defer to `/devlens diagram architecture`). Never draw boxes/arrows in raw text.
- **Protect the synthesis budget.** Collect efficiently — batch `get_summaries`, cap how many routes you deep-traverse to what each section needs. Then write deliberately, section by section. If budget runs short, **a few sections written cleanly beats all sections truncated**; a garbled brief is a failure even if the data behind it was right.
- **Match a top-tier hand-written design doc** for clarity and structure, and add the graph-only insight (edges, centrality, security) on top.

## Output template

**Write in this order — it is the reader's mental journey, not the tool's query order.**

> **Format discipline:** Each section below specifies its visual format. Use it exactly. Markdown tables for structured data, numbered prose for flows, bullet lists for discoveries and inventories. Never use hand-drawn ASCII boxes or arrows — they break and truncate. If budget runs short, write fewer sections cleanly rather than all sections with truncated text.

> **No-summary fallback:** Every node carries `filePath`, `startLine`, and `endLine`. When a summary is missing, read those exact lines (`Read filePath startLine–endLine`) to fill the description rather than leaving a vague placeholder. A 20-line source read beats an empty bullet. Use this especially in §3 (key flows) and §7 (core nodes).

---

**Header line (always first):**
`Graph: <totalNodes> nodes · <totalEdges> edges · <routeCount> routes · analyzed <YYYY-MM-DD> · commit <short-sha>` (append `· working tree` if dirty)

---

**§1 — Overview**
*Format: 2–4 sentence prose paragraph, then one Markdown table.*
- Prose: what the product does and who uses it (from business summaries of the top central nodes).
- Table:

| Layer | Technology |
|---|---|
| Framework | … |
| Router | … |
| State | … |
| Auth | … |
| Database | … |
| Cache | … |
| HTTP / data fetching | … |
| Notable libs | … |

---

**§2 — Module map** *(the structural skeleton)*
*Format: one Markdown table — every module, no exceptions.*

| Module | Purpose (from summaries) | Directories | Key nodes | ~Count |
|---|---|---|---|---|
| … | … | … | NodeA, NodeB | N (+M more) |

One row per cluster from method step 2. Purpose comes from the business summary of the cluster's central node. "+N more" for the incidental long tail only — never for routes, stores, or hooks.

Also name the **architectural and system-design patterns** here (from the "Detect the patterns" section above) — one sentence each with the graph evidence (e.g. "State managed via 3 Zustand stores; `useUserStore` is the hub — blast-radius of 42 nodes").

---

**§3 — Key flows** *(the heart — write this section before §4–§9)*
*Format: for each flow, a bold title then a numbered step list.*

The 2–4 most important end-to-end journeys that define the product. Choose the flows that a new engineer must understand to work on this codebase (e.g. the primary user action, the data-fetch/render cycle, the auth gate, a background job).

For **each flow**:

**Flow title (e.g. "Watching an episode")**
1. `RouteName` (`filePath`) — what it does [→ CALLS HandlerName]
2. `HandlerName` (`filePath`) — what it does [→ READS_FROM StoreName]
3. `StoreName` (`filePath`) — what state it holds [→ WRITES_TO DB]
…

Every step names the node, its file, what it does (from its summary or a source read if no summary), and the edge type to the next step. Name every guard or middleware the flow passes. End with the response shape or side effect.

---

**§4 — Non-obvious discoveries** *(the DevLens exclusive)*
*Format: 4–8 bullet points. Each bullet names the specific node(s) and what the graph reveals — not generic observations.*

This is the section a plain LLM cannot write. Draw findings from summaries, edge patterns, centrality scores, and blast-radius data:
- Dual-purpose nodes (e.g. a store functioning as both a cache and a cross-platform ID registry — cite the READS_FROM/WRITES_TO edges that prove it)
- Companion libraries or vendored code invisible from the directory structure
- Unexpectedly high-fan-in nodes (blast-radius >> what the name implies — cite the radius)
- Cross-provider shared adapters hidden inside a single module
- Anything in `topNodes` surprising given the app's domain (e.g. a crypto/WASM utility ranking above business logic)
- Architectural constraints that only emerge from the edge graph (e.g. a one-way data flow that breaks if a certain node is modified)

---

**§5 — Complete inventories** *(reference — enumerate fully, format compactly)*
*Format: three compact grouped lists. Never prose.*

**Routes** (grouped PAGE vs API, then by module):
- `GET /path/to/route` — one-line purpose — → calls: HandlerA, HandlerB

**State stores**:
- `StoreName` (`filePath`) — what state it owns — read by: X, Y — written by: A, B

**Custom hooks**:
- `useHookName` (`filePath`) — one-line job

Every route, every store, every hook — no sampling. Count them and confirm they match the totals from `get_repo_overview`.

---

**§6 — How modules connect**
*Format: one Markdown table.*

| From | To | Edge type | What it means |
|---|---|---|---|
| … | … | CALLS / READS_FROM / … | … |

Cover all significant cross-module connections from `get_blast_radius` / `get_khop` aggregation. Only cite edges the graph returned — never invent connections.

---

**§7 — Core nodes**
*Format: one entry per node, consistent structure.*

Top ~8 most central nodes (from `get_repo_overview` centrality). For each:

`NodeName` (`filePath:startLine–endLine`) — role from summary
← called by: X, Y | → calls: A, B

---

**§8 — Health**
*Format: one table for security, bullet list for tech debt.*

**Security** (medium + high severity only):

| Node | File | Severity | Issue |
|---|---|---|---|
| … | … | high / medium | … |

If no medium/high issues exist, say so explicitly — a clean bill is signal too.

**Tech debt**:
- Cycles: list each circular group from `list_cycles` (e.g. `ModuleA → ModuleB → ModuleA`)
- High fan-in hubs: nodes where blast-radius > 10 direct dependents — name them and their radius

---

**§9 — Stats + where to start**
*Format: one stats table, then a numbered reading path.*

| Stat | Count |
|---|---|
| Total nodes | N |
| Total edges | N |
| Routes (PAGE / API) | N / N |
| Components | N |
| Hooks | N |
| Stores | N |
| Functions | N |
| Security flags (high / med / low) | N / N / N |

**Reading path** — 8–12 nodes a newcomer should read in order to follow the main flow:
1. `NodeName` (`filePath`) — why read this first

---

**→ Next:** suggest `/devlens diagram architecture` for the visual and `/devlens onboard` (or `/devlens explain`) for a guided walkthrough.

---

*Structure-only graph (no summaries):* produce all sections from clusters + edges. Use `filePath:startLine–endLine` source reads for §3 flow steps and §4 discoveries where description would otherwise be vague. Note in those sections that findings came from source reads rather than summaries.
