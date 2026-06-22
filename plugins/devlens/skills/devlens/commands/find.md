# /devlens find — locate where something lives

Fast feature/code location. **Argument:** `<name-or-path>` plus optional filters the user mentions (type, severity). Works on **structure alone** — no summarize permission needed.

## Commands used
- By name (substring): `devlens find-nodes <name> --json`.
  - `-t <types...>` — node types: COMPONENT, HOOK, FUNCTION, STATE_STORE, UTILITY, ROUTE, FILE, TEST, STORY, THIRD_PARTY (GHOST is an internal placeholder).
  - `-f <file>` — nodes in exactly that file; `-d <folder>` — nodes under a folder.
  - `--severity <low|medium|high>` — only flagged nodes; `-l <n>` — result cap (default 25).
- In a file/folder: `devlens nodes-in-path <path> --json` (`-t` to filter types).

## Output
A compact list of matching nodes: **name** — `filePath:lines` — type. The compact refs already include a short `summary` and `severity` — surface the summary when present so the user sees what each match *does* (no extra call, no file reads). No source. If there are many, group by file/folder and surface the most central first. Then offer the natural next step: `/devlens summary <id>` to understand one, or `/devlens impact <id>` to see what it touches.
