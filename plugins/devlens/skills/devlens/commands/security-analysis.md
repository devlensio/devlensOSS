# /devlens security-analysis — prioritized security report

Surface and explain security-flagged nodes. **Argument:** `[low|medium|high]` minimum severity (default `low`).

**Needs summaries** (security assessments come from summarization) — follow the freshness/summarize-permission policy in SKILL.md first. If summaries are missing, ask permission to summarize, or proceed and note that no findings can be produced without them.

## Commands used
1. `devlens security --min-severity <arg|low> --json` — returns `{total, issues:[{id,name,type,filePath,lines,score,severity,summary,securitySummary}]}`. Use `-l <n>` to raise the cap (default 50).
2. For any high/medium hit needing more detail: `devlens get-node <id> -i security --json` (or batch with `devlens get-summaries <id...> -i security --json`).

## Output
Group findings **high → medium → low**. For each:
- **`name`** — `filePath:lines` — severity (score).
- The exploit/risk explanation from `securitySummary`.
- A one-line suggested mitigation.

Start with a count by severity. End with the top 3 things to fix first. If `total` is 0, say the graph shows no flagged nodes at that severity (and remind that this reflects the analyzed commit).
