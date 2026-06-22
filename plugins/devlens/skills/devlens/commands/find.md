# /devlens find — locate where something lives

Fast feature/code location. **Argument:** `<name-or-path>` plus optional filters the user mentions (type, severity). Works on **structure alone** — no summarize permission needed.

## Commands used
- By name (substring): `devlens find-nodes <name> --json`.
  - `-t <types...>` — COMPONENT, HOOK, FUNCTION, ROUTE, STORE, …
  - `-f <file>` — nodes in exactly that file; `-d <folder>` — nodes under a folder.
  - `--severity <low|medium|high>` — only flagged nodes; `-l <n>` — result cap (default 25).
- In a file/folder: `devlens nodes-in-path <path> --json` (`-t` to filter types).

## Output
A compact list of matching nodes: **name** — `filePath:lines` — type. No source. If there are many, group by file/folder and surface the most central first. Then offer the natural next step: `/devlens summary <id>` to understand one, or `/devlens impact <id>` to see what it touches.
