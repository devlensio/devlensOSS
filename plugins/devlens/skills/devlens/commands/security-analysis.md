# /devlens security-analysis — prioritized security report

Produce a thorough, prioritized security review covering the flagged nodes — not a sample. **Argument:** `[low|medium|high]` minimum severity (default `low`).

**Needs summaries** (security assessments come from summarization) — follow the freshness/summarize-permission policy in SKILL.md first. If summaries are missing, ask permission to summarize, or stop and explain that findings can't be produced without them.

## Method — work the graph, in order
1. **List findings.** `get_security_issues` with `minSeverity` = the argument (default `low`). It returns `{ id, name, type, filePath, lines, score, severity, summary, securitySummary }`, ranked by severity. If the result is capped by `limit` and more exist, raise `limit` (or page) so **no finding is dropped** — confirm you've covered all high/medium.
2. **Detail.** For every high and medium finding, ensure you have its full `securitySummary`; if the list output truncates it, fetch via `get_node` with `include: ["security"]`, or batch with `get_summaries` (`include: ["security"]`).
3. **Reach.** For high-severity findings, `get_blast_radius <id>` → how many nodes depend on the vulnerable code. A high-severity node with a large blast radius is the top priority.

## Output template
1. **Severity summary** — counts: `high: N, medium: N, low: N` (out of total).
2. **Findings**, grouped **high → medium → low**. For every high and medium finding (and a concise grouped list of lows):
   - **`name`** — `filePath:lines` — **severity** (score).
   - **Risk:** the exploit/impact from `securitySummary`.
   - **Reach** (high only): dependents from blast radius — what else is exposed.
   - **Mitigation:** one concrete fix.
3. **Fix these first** — the top 3–5, ranked by severity × reach.

Cover all high/medium findings — don't truncate. If total is 0 at the requested severity, say so and note it reflects the analyzed commit (offer to lower `minSeverity`).
