# /devlens onboard — generate a persisted onboarding guide

Produce a complete, **one-shot** onboarding guide for a newcomer and **save it to `ONBOARDING.md`** at the repo root. Unlike `/devlens explain` (a quick in-chat orientation), this writes a durable, structured document a new engineer can read top to bottom and then start working. Arguments: none (cwd graph; `graphId` to target another). **Needs summaries** for the richest output — follow the freshness/summarize-permission policy in SKILL.md first (structure-only still yields stack, setup, modules, flows skeleton, and a reading path).

This is graph-driven for *code understanding* (modules, flows, reading path) and uses a few targeted file reads for things the graph doesn't model (how to install/run). Synthesize — don't dump.

## Method — one graph call + disk reads

1. Call `onboarding_tour`. This ONE call replaces steps 1–5 (overview+subgraph+find_nodes+khop+get_summaries). The result gives you the graph-derived skeleton: modules, entry points, state, key flows, a reading path, a domain glossary, and gotchas.

2. Read `package.json`, `.env.example` (or `.env.sample`), and the repo `README` from disk for setup facts — the `needsDisk` field in the result tells you exactly what to read. Note the test/lint/build/dev commands.

3. Verify `result.schemaVersion === 1`. If not, stop and warn the user.

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
