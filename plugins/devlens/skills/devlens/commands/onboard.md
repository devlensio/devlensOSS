# /devlens onboard — generate a persisted onboarding guide

Produce a complete, **one-shot** onboarding guide for a newcomer and **save it to `ONBOARDING.md`** at the repo root. Unlike `/devlens explain` (a quick in-chat orientation), this writes a durable, structured document a new engineer can read top to bottom and then start working. Arguments: none (cwd graph; `graphId` to target another). **Needs summaries** for the richest output — follow the freshness/summarize-permission policy in SKILL.md first (structure-only still yields stack, setup, modules, flows skeleton, and a reading path).

This is graph-driven for *code understanding* (modules, flows, reading path) and uses a few targeted file reads for things the graph doesn't model (how to install/run). Synthesize — don't dump.

## Method — work the graph, then the setup files

1. **Orient.** `get_repo_overview` → framework fingerprint + exact counts + top central nodes.
2. **Modules from clusters.** `get_subgraph` on the top ~6–10 central nodes → the deduped module model (bounded contexts), each with its purpose and directories.
3. **Backbone.** `find_nodes` for every `ROUTE`, `STATE_STORE`, `HOOK` → map onto modules (these orient a newcomer to entry points and state).
4. **Key flows.** Pick the 2–4 defining journeys (auth, primary read, primary write/mutation, a background job); walk each route's `get_khop` call graph in order (route → guard → handler → service → store/db) and describe each step from its summary.
5. **Meaning & glossary.** `get_summaries -i business` for module centers, key routes/stores, and the central nodes → the product-level vocabulary (the domain concepts a newcomer must learn).
6. **Setup facts (file reads — the graph doesn't model these).** Read `package.json` (scripts, key deps, engines/packageManager), `.env.example` / `.env.sample` if present (required env vars — never print secret values), and skim the repo `README` for run instructions. Note the test/lint/build/dev commands.

## Write `ONBOARDING.md` (fill every section)
Save to the repo root as `ONBOARDING.md`. Keep it concrete — name real files and nodes, link `/devlens` follow-ups.

1. **What this is** — 2–4 sentences on the product/domain (from business summaries) + the stack (framework, router, state, data, db).
2. **Get it running** — prerequisites (Node/package manager from `package.json`), install command, the required env vars (names from `.env.example`, with a one-line purpose each — no values), and the dev / test / lint / build commands (from `scripts`).
3. **Architecture at a glance** — the module model from step 2: each module → one line on what it owns + rough size. Point to `/devlens architecture` and `/devlens diagram architecture` for the full brief and visuals.
4. **Key flows (end to end)** — the 2–4 journeys from step 4, each a numbered prose walkthrough: `name` (`filePath`) → what it does, in call order from entry to data and back; name the store/db/external each touches.
5. **Read these first** — a ranked learning path of 8–12 nodes (top central + central routes/stores), each with `filePath` and a one-line "why it matters," ordered so the main flow makes sense.
6. **Domain glossary** — the key product concepts/terms (auth, profiles, payments, …) from business summaries, one line each, so the codebase's vocabulary is legible.
7. **Where to make common changes** — a practical map: "to add an API route → this module; to add UI state → these stores; to change auth → these guard/util nodes; to add a component → here." Derive targets from the module model + backbone.
8. **Gotchas & risks** — cycles (`list_cycles`) and any high-severity security nodes (`get_security_issues`) a newcomer should not trip over; load-bearing hubs (large blast radius) to be careful editing.
9. **DevLens cheat sheet** — the handful of `/devlens` commands most useful day-to-day (`find`, `impact`, `summary`, `guard`, `explain`) with a one-line when-to-use each.

## Deliver
- Write the file to `ONBOARDING.md` (repo root) and tell the user the path.
- Print a short summary in chat: the modules covered, the flows documented, and the reading-path length — plus a note that summary-dependent sections (1, 4, 6) need summarization if the graph is structure-only.
- If `ONBOARDING.md` already exists, mention it and offer to overwrite or write to `ONBOARDING.devlens.md` instead.
