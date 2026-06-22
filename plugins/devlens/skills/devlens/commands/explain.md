# /devlens explain — onboard to this codebase

Give a newcomer a real orientation to the codebase, scaled to its size. A two-line answer is a FAILURE. **Argument:** optional path to scope the explanation (file/folder); omitted = whole repo. **Needs summaries** for best results — follow the freshness/summarize-permission policy in SKILL.md first (structure-only still gives stack + entry points + a learning path).

## MANDATORY data collection — run all before writing
1. `devlens overview --json` → stack (`fingerprint`), `stats`, `routeCount`, `topNodes`, `topFiles`.
2. `devlens find-nodes -l 5000 --json` → module map (group `filePath`s by top-level/second-level directory, with counts).
3. `devlens find-nodes -t ROUTE -l 500 --json` → entry points (pages vs API).
4. `devlens find-nodes -t STATE_STORE -l 200 --json` → app state.
5. `devlens top-nodes -l 20 --json` → the nodes that matter most.
6. **Meaning:** `devlens get-summaries <ids...> -i business --json` (and `-i technical` where needed) for the top nodes + a representative route/store per module. Describe from summaries, not names.
   - If scoped to a path: `devlens nodes-in-path <path> --json` first, then summarize those.

## OUTPUT TEMPLATE — fill every section
1. **What this app does** — 2–4 sentences on the product/domain, from business summaries.
2. **Stack** — framework + router, state management, data fetching, database, notable libraries.
3. **How it's organized** — the module map: each significant directory → one line on its responsibility + node count.
4. **Entry points** — the key routes/pages and where requests/flows begin (reference the ROUTE nodes).
5. **Read these first** — a ranked **learning path** of 8–12 of the most important nodes (from top-nodes + central routes/stores), each with `filePath` and a one-line "why it matters." Order them so a newcomer can follow the flow.
6. **Key domains / concepts** — the main functional areas (auth, profiles, search, payments, etc.) drawn from business summaries.
7. **Next steps** — suggest `/devlens architecture` (full system map), `/devlens diagram` (visual), `/devlens find <x>` (locate a feature), `/devlens summary <node> functional` (deep-dive one area).

Keep it readable and concrete — name real files and nodes, not generic advice. If summaries are missing, complete sections 2–5 from structure and note that section 1/6 need `--summarize`.
