# /devlens explain — onboard to this codebase

Give a newcomer a real orientation to the codebase, scaled to its size and grounded in the graph. **Argument:** optional path to scope the explanation (file/folder); omitted = whole repo. **Needs summaries** for best results — follow the freshness/summarize-permission policy in SKILL.md first (structure-only still gives stack + entry points + a learning path).

Build understanding from clusters and summaries — not a node dump. Synthesize; cite the real files and nodes.

## Method — work the graph, in order
1. **Orient.** `get_repo_overview` → stack (fingerprint), exact counts, `routeCount`, top central nodes.
2. **Modules.** `get_subgraph` on the top ~6–10 central nodes → merge into the real module model (bounded contexts), each with its directories and key members.
3. **Entry points & state.** `find_nodes` for `ROUTE` (pages vs API) and `STATE_STORE` → map onto modules.
4. **Meaning.** `get_summaries -i business` (and `-i technical` where needed) for the top nodes + a representative route/store per module. Describe from summaries, not names.
5. **Scoped mode:** if the user gave a path, `get_nodes_in_path <path>` first, then summarize those and explain that area specifically.

## Output template
1. **What this app does** — 2–4 sentences on the product/domain, from business summaries.
2. **Stack** — framework + router, state management, data fetching, database, notable libraries.
3. **How it's organized** — the module model from step 2: each module → one line on its responsibility + rough size.
4. **Entry points** — the key routes/pages and where requests/flows begin (reference the ROUTE nodes).
5. **Read these first** — a ranked **learning path** of 8–12 of the most important nodes (top central nodes + central routes/stores), each with `filePath` and a one-line "why it matters," ordered so a newcomer can follow the main flow (entry → handler → state → core logic).
6. **Key domains / concepts** — the main functional areas (auth, profiles, search, payments, …) drawn from business summaries.
7. **Next steps** — suggest `/devlens onboard` (a saved `ONBOARDING.md` guide with setup + flows), `/devlens architecture` (full system map), `/devlens diagram` (visual), `/devlens find <x>` (locate a feature), `/devlens summary <node> functional` (deep-dive one area).

Keep it readable and concrete — name real files and nodes, not generic advice. If summaries are missing, complete sections 2–5 from structure (clusters + counts + centrality) and note that sections 1/6 need summarization.
