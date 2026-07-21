# /devlens security-analysis — prioritized security report

Produce a thorough, prioritized security review covering the flagged nodes — not a sample. **Argument:** `[low|medium|high]` minimum severity (default `low`).

**Needs summaries** (security assessments come from summarization) — follow the freshness/summarize-permission policy in SKILL.md first. If summaries are missing, ask permission to summarize, or stop and explain that findings can't be produced without them.

## Method — one call, then format

1. Call `security_brief` with `minSeverity` = the argument (default `low`). This ONE call replaces the 3-step method (get_security_issues+get_node+blast_radius). The result includes all findings, blast radius for high-severity issues, and a ranked `fixTheseFirst` list.

2. Verify `result.schemaVersion === 1`. If not, stop and warn the user.

3. Format per the output template below. The tool already handles enumeration, reach, and ranking — you present them.

## Output template
1. **Severity summary** — counts: `high: N, medium: N, low: N` (out of total).
2. **Findings**, grouped **high → medium → low**. For every high and medium finding (and a concise grouped list of lows):
   - **`name`** — `filePath:lines` — **severity** (score).
   - **Risk:** the exploit/impact from `securitySummary`.
   - **Reach** (high only): dependents from blast radius — what else is exposed.
   - **Mitigation:** one concrete fix.
3. **Fix these first** — the top 3–5, ranked by severity × reach.

Cover all high/medium findings — don't truncate. If total is 0 at the requested severity, say so and note it reflects the analyzed commit (offer to lower `minSeverity`).
