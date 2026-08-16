# /devlens find — locate where something lives

Fast feature/code location. **Argument:** `<name-or-path>` plus optional filters the user mentions (type, severity). Works on **structure alone** — no summarize permission needed.

## Tools used
- By name (substring): `find_nodes` with `name`.
  - `nodeTypes` — the full union: COMPONENT, HOOK, FUNCTION, STATE_STORE, UTILITY, CLASS, METHOD, INTERFACE, ENUM, STRUCT, TRAIT, IMPL_BLOCK, ROUTE, FILE, TEST, STORY, THIRD_PARTY (GHOST is an internal placeholder; MODULE/PACKAGE are reserved). **Which types actually exist depends on the repo's language** — see `reference.md` → "Node & edge types by language" (e.g. a Go repo has STRUCT/INTERFACE but no CLASS; a Java repo has CLASS/INTERFACE/ENUM but no FUNCTION; a Rust repo has TRAIT/IMPL_BLOCK but no CLASS/INTERFACE).
  - `filePath` — nodes in exactly that file; `dir` — nodes under a folder.
  - `severity` (low|medium|high) — only flagged nodes; `limit` — result cap (default 25).
- In a file/folder: `get_nodes_in_path <path>` (optional `nodeTypes` filter).

## Output
A compact list of matching nodes: **name** — `filePath:lines` — type. The compact refs already include a short `summary` and `severity` — surface the summary when present so the user sees what each match *does* (no extra call, no file reads). No source. If there are many, group by file/folder and surface the most central first. Then offer the natural next step: `/devlens summary <id>` to understand one, or `/devlens impact <id>` to see what it touches.
