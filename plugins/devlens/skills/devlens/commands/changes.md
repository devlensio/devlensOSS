# /devlens changes — explain what changed (time range, commit range, or merge conflict)

Explain recent work or a merge conflict **in terms of functionality**, covering the changed files — not just one. **Argument:** a time/ref spec — e.g. `yesterday`, `3 days`, `since main`, `HEAD~5`, `<commitA>..<commitB>`, or nothing (= uncommitted working changes).

Use cases: "what did we do yesterday / the last few days", "what changed since main / `<commit>`", **merge-conflict help** (which side's functionality to keep), PR/standup recap.

> `analyze_changes(from, to)` only works when **both** commits were analyzed into the graph (else it errors). So drive the range off **git**, then explain impact via the current graph. Use `analyze_changes` as a bonus when both commits are known-analyzed.

## Method — work git, then the graph
1. **Resolve the range (git):**
   - Time phrases → commits: `git log --since="yesterday" --pretty=format:"%h %ci %s"` (or `"3 days ago"`, `"1 week ago"`).
   - Ref/branch: `git rev-parse <ref>`; "since main" → `git merge-base main HEAD`.
   - Changed files: `git diff --name-only <from> <to>` (or `git diff --name-only` for uncommitted; `git log --name-only --since=…` for a window).
   - Merge conflict: `git diff --name-only --diff-filter=U` (conflicted files); `git log --merge -p -- <file>` (competing sides).
2. **Map every changed file → nodes:** for each changed file, `get_nodes_in_path <file>` → its nodes (`id, name, type, score, severity, summary`). (Honor the freshness guard — re-analyze if the worktree is dirty.)
3. **Meaning:** `get_summaries` with `include: ["technical"]` (what changed) and `["business"]` (why it matters) for the changed nodes — describe from summaries, not filenames.
4. **Impact:** for the most significant changed nodes (high `score` or `severity`), `get_blast_radius <id>` → what else the change may affect. When both commits are analyzed, `analyze_changes(from, to)` gives the added/removed/changed set plus blast radius directly.

## Output template
1. **Range** — the commits/files covered + the human phrase ("since yesterday"), and how many files/nodes changed.
2. **What changed, by functionality** — grouped by module/feature, describing each changed area from its summary (cover all changed files; don't stop at one). Note new vs modified where visible.
3. **Impact** — what depends on the changed high-value nodes (blast radius), plus any touched medium/high-`severity` nodes.
4. **Merge-conflict mode** (when applicable) — for each conflicted node: a side-by-side of what *ours* vs *theirs* does (from summaries) and a recommendation on which functionality to keep or how to combine, flagging risk.
