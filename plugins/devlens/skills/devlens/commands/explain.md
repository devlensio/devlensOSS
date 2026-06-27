# /devlens explain — onboard to this codebase

Give a newcomer a real orientation to the codebase, scaled to its size and grounded in the graph. **Argument:** optional path to scope the explanation (file/folder); omitted = whole repo. **Needs summaries** for best results — follow the freshness/summarize-permission policy in SKILL.md first (structure-only still gives stack + entry points + a learning path).

Build understanding from clusters and summaries — not a node dump. Synthesize; cite the real files and nodes.

## Scope FIRST — match the breadth of the question
Before any wide sweep, decide the scope. A scoped question ("explain how **streaming** / auth / search works", or a path argument) is **not** a whole-repo tour — answering it with a full-repo sweep wastes the budget that should go into a clean write-up.
- **Named subsystem or path** (in the argument *or* in the prose) → resolve it to its cluster and stay there: `find_nodes <name>` (or `get_nodes_in_path <path>`) to seed, then `get_subgraph` on the seed → the feature cluster; expand only along the routes/edges that subsystem actually touches (`get_khop` on its entry routes). Do **not** enumerate the whole repo.
- **Whole-repo "explain this codebase"** → the broader method below.

## Method — work the graph, in order (scale to the scope above)
1. **Orient.** `get_repo_overview` → stack (fingerprint), exact counts, `routeCount`, top central nodes.
2. **Modules / cluster.** `get_subgraph` on the relevant seed(s) — the subsystem's cluster for a scoped ask, or the top ~6–10 central nodes for the whole repo → the real module model (bounded contexts), each with directories and key members.
3. **Entry points & state.** `find_nodes` for `ROUTE` (pages vs API) and `STATE_STORE` **in scope** → map onto modules; trace each in-scope route's `get_khop` for its call path.
4. **Meaning + exclusives.** `get_summaries` (`business`, and `technical`/`security` where relevant) for the in-scope nodes. Capture the three things a raw LLM can't: **typed edges** (who READS_FROM / CALLS / PROP_PASS to whom), **centrality** (which nodes are the load-bearing ones), and **security severity** flags. Describe from summaries, not names.

## Output template
1. **What this app does** — 2–4 sentences on the product/domain, from business summaries.
2. **Stack** — framework + router, state management, data fetching, database, notable libraries.
3. **How it's organized** — the module model from step 2: each module → one line on its responsibility + rough size.
4. **Entry points** — the key routes/pages and where requests/flows begin (reference the ROUTE nodes).
5. **Read these first** — a ranked **learning path** of 8–12 of the most important nodes (top central nodes + central routes/stores), each with `filePath` and a one-line "why it matters," ordered so a newcomer can follow the main flow (entry → handler → state → core logic).
6. **Key domains / concepts** — the main functional areas (auth, profiles, search, payments, …) drawn from business summaries.
7. **Next steps** — suggest `/devlens onboard` (a saved `ONBOARDING.md` guide with setup + flows), `/devlens architecture` (full system map), `/devlens diagram` (visual), `/devlens find <x>` (locate a feature), `/devlens summary <node> functional` (deep-dive one area).

Keep it readable and concrete — name real files and nodes, not generic advice. If summaries are missing, complete sections 2–5 from structure (clusters + counts + centrality) and note that sections 1/6 need summarization.

## Output discipline (read before writing)
The data collection is worthless if the write-up is rushed or garbled. Hold these:
- **Lead with the exclusives.** Foreground what only the graph gives you: any in-scope **security severity flag is a mandatory call-out** (don't bury it), describe key relationships by their **edge type**, and point to the **central/load-bearing** nodes. These are the difference between this and a plain file-read explanation.
- **No hand-drawn ASCII diagrams.** They break and truncate. For a visual, use a **Markdown table** or a **Mermaid** code block, or defer to `/devlens diagram flow <node>`. Never draw boxes/arrows in raw text.
- **Protect the synthesis budget.** Collect efficiently — batch `get_summaries`, and don't deep-traverse more routes/nodes than the scope needs. Then write deliberately. If budget is tight, **fewer sections written cleanly beats every section truncated** — a half-written, garbled answer is a failure even if the data behind it was right.
- **Match a top-tier hand-written explanation** for clarity and structure, and add the graph-only insight on top.
