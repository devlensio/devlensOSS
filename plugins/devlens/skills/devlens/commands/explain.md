# /devlens explain — onboard to this codebase

Explain what the app does and where to start reading. **Argument:** optional path to scope the explanation (file/folder); omitted = whole repo.

**Needs summaries** for best results — follow the freshness/summarize-permission policy in SKILL.md first; structure-only still gives stack + entry points.

## Commands used
1. `devlens overview --json` — stack + most-central nodes.
2. `devlens top-nodes -l 12 --json` — the nodes that matter most.
3. Routes/entry points: `devlens find-nodes -t ROUTE --json` (and for a scoped path, `devlens nodes-in-path <path> --json`).
4. For the key nodes, pull meaning cheaply: `devlens get-summaries <id...> -i business --json` (functional) and `-i technical` as needed.

## Output
A newcomer-friendly walkthrough:
- **What it is** — product/domain in 2–3 sentences (from business summaries + fingerprint).
- **Stack** — framework, router, state, data, db.
- **Entry points** — main routes/pages and where requests start.
- **Read these first** — the 5–8 most important nodes, each with file path and a one-line "why it matters."
- **Next steps** — suggest `/devlens architecture` (system map), `/devlens diagram` (visual), `/devlens find <x>` (locate a feature).
