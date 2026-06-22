# /devlens security-analysis — prioritized security report

Produce a thorough, prioritized security review covering **every** flagged node — not a sample. **Argument:** `[low|medium|high]` minimum severity (default `low`).

**Needs summaries** (security assessments come from summarization) — follow the freshness/summarize-permission policy in SKILL.md first. If summaries are missing, ask permission to summarize, or stop and explain that findings can't be produced without them.

## MANDATORY data collection — run all before writing
1. `devlens security --min-severity <arg|low> -l 500 --json` → `{ total, issues:[{ id, name, type, filePath, lines, score, severity, summary, securitySummary }] }`. Raise `-l` if `total` exceeds it so **no finding is dropped**.
2. For **every high and medium** finding, ensure you have its full `securitySummary` (the list output may truncate it) — fetch with `devlens get-node <id> -i security --json`, or batch with `devlens get-summaries <ids...> -i security --json`.
3. For **high-severity** findings, assess reach: `devlens blast-radius <id> --json` → how many nodes depend on the vulnerable code (a high-severity node with a large blast radius is the top priority).

## OUTPUT TEMPLATE — fill every section
1. **Severity summary** — counts: `high: N, medium: N, low: N` (out of `total`).
2. **Findings**, grouped **high → medium → low**. For **every high and medium** finding (and a concise list of lows):
   - **`name`** — `filePath:lines` — **severity** (score).
   - **Risk:** the exploit/impact from `securitySummary`.
   - **Reach** (high only): dependents from blast radius — what else is exposed.
   - **Mitigation:** one concrete fix.
3. **Fix these first** — the top 3–5, ranked by severity × reach.

Do not truncate the high/medium findings — cover all of them. If `total` is 0 at the requested severity, say so and note it reflects the analyzed commit (offer to lower `--min-severity`).
