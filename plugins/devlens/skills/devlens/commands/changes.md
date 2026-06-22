# /devlens changes — explain what changed (time range, commit range, or merge conflict)

Explain recent work or a merge conflict **in terms of functionality**, covering **all** the changed files — not just one. **Argument:** a time/ref spec — e.g. `yesterday`, `3 days`, `since main`, `HEAD~5`, `<commitA>..<commitB>`, or nothing (= uncommitted working changes).

Use cases: "what did we do yesterday / the last few days", "what changed since main / `<commit>`", **merge-conflict help** (which side's functionality to keep), PR/standup recap.

> `devlens diff <from> <to>` only works when **both** commits were analyzed into the graph (else it errors `commits not found`). So drive the range off **git**, then explain impact via the current graph. Use `devlens diff` as a bonus when both commits are known-analyzed.

## MANDATORY data collection — run all before writing
1. **Resolve the range (git):**
   - Time phrases → commits: `git log --since="yesterday" --pretty=format:"%h %ci %s"` (or `"3 days ago"`, `"1 week ago"`).
   - Ref/branch: `git rev-parse <ref>`; "since main" → `git merge-base main HEAD`.
   - Changed files: `git diff --name-only <from> <to>` (or `git diff --name-only` for uncommitted; `git log --name-only --since=…` for a window).
   - Merge conflict: `git diff --name-only --diff-filter=U` (conflicted files); `git log --merge -p -- <file>` (competing sides).
2. **Map every changed file → nodes:** for **each** changed file, `devlens nodes-in-path <file> --json` → its nodes (`id, name, type, score, severity, summary`). (Honor the freshness guard — re-analyze if the worktree is dirty.)
3. **Meaning:** `devlens get-summaries <ids...> -i technical --json` (what changed) and `-i business --json` (why it matters) for the changed nodes — describe from summaries, not filenames.
4. **Impact:** for the most significant changed nodes (high `score` or `severity`), `devlens blast-radius <id> --json` → what else the change may affect.

## OUTPUT TEMPLATE — fill every section
1. **Range** — the commits/files covered + the human phrase ("since yesterday"), and how many files/nodes changed.
2. **What changed, by functionality** — grouped by module/feature, describing **every** changed area from its summary (cover all changed files; don't stop at one). Note new vs modified where visible.
3. **Impact** — what depends on the changed high-value nodes (blast radius), plus any touched medium/high-`severity` nodes.
4. **Merge-conflict mode** (when applicable) — for each conflicted node: a side-by-side of what *ours* vs *theirs* does (from summaries) and a recommendation on which functionality to keep or how to combine, flagging risk.
