# /devlens changes — explain what changed (time range, commit range, or merge conflict)

Explain recent work or a merge conflict **in terms of functionality**, not just file diffs. **Argument:** a time/ref spec — e.g. `yesterday`, `3 days`, `since main`, `HEAD~5`, `<commitA>..<commitB>`, or nothing (= uncommitted working changes).

Use cases:
- "What did we do yesterday / in the last few days?" — summarize recent work by functionality.
- "What changed since `main` / since `<commit>`?" — review a branch or range.
- **Merge conflict help** — for conflicted files, explain what each side's code *does* (from summaries) so the user can decide which functionality to keep.
- Pre-PR/standup recap.

> `devlens diff <from> <to>` only works when **both** commits were analyzed into the graph (else it errors `commits not found`). So drive the time range off **git**, then explain impact via the current graph. Try `devlens diff` as a bonus when both commits are known-analyzed.

## 1. Resolve the range with git
- Time phrases → commits: `git log --since="yesterday" --pretty=format:"%h %ci %s"` (or `"3 days ago"`, `"1 week ago"`).
- Ref/branch: `git rev-parse <ref>` / `git merge-base main HEAD` for "since main".
- Changed files in range: `git diff --name-only <from> <to>` (or `git diff --name-only` for uncommitted; `git log --name-only --since=…` for a window).
- **Merge conflict:** `git diff --name-only --diff-filter=U` lists conflicted files; `git log --merge -p -- <file>` shows the competing sides.

## 2. Map changed files → graph nodes (with meaning)
For each changed file (respect the freshness guard — re-analyze if the worktree is dirty):
- `devlens nodes-in-path <file> --json` → the nodes in it (`id, name, type, score, severity, summary`).
- Prefer the **summaries** to explain what changed: `devlens get-summaries <id...> -i technical --json` (what it does) and `-i business --json` (what it means). Read summaries instead of the files when available.

## 3. Assess impact / risk of the changes
- For the most significant changed nodes (high `score` or security `severity`), run `devlens blast-radius <id> --json` — who depends on them, i.e. what else this change may affect.
- Optional, when both commits are analyzed: `devlens diff <from> <to> --json` → changed nodes + their blast radius directly.

## 4. Output
- **Range** — the commits/files covered (and the human phrase, e.g. "since yesterday").
- **What changed, by functionality** — grouped by module/feature, each described from its summary (not filenames).
- **Impact** — what depends on the changed high-value nodes (blast radius), and any touched medium/high-`severity` nodes.
- **Merge-conflict mode** — for each conflicted node, a side-by-side of what *ours* vs *theirs* does (from summaries) and a recommendation on which functionality to keep (or how to combine), flagging anything risky.
