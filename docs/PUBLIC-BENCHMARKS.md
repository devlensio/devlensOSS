# DevLens OSS MCP: Public Benchmark Results

DevLens MCP answers questions about a codebase from a precomputed code graph. We compared it against eight other code graph, memory, and retrieval tools on the same repository, the same questions, and the same agent — 2,394 agent runs in total, all from recorded run logs. **DevLens ranks first of nine on every quality measure.**

## 1. Overall results

All nine tools answered the same 133 questions about the dub repository (a large TypeScript codebase), two runs each — 266 runs per tool. The best value in each column is in bold.

| Tool | Correctness | F1 | Recall | Precision | Latency per call (ms) | Tokens returned per call | Billed tokens per question |
|---|---|---|---|---|---|---|---|
| **DevLens OSS MCP, unsummarized** | **0.694** | **0.562** | **0.724** | **0.511** | **67** | 2,631 | 23,254 |
| codegraph | 0.674 | 0.555 | 0.712 | 0.509 | 2,736 | 6,339 | 15,050 |
| BM25 server | 0.664 | 0.545 | 0.699 | 0.500 | 108 | 721 | **12,215** |
| Graphify | 0.662 | 0.548 | 0.697 | 0.505 | 2,469 | 4,707 | 19,246 |
| serena | 0.656 | 0.545 | 0.684 | 0.500 | 106 | 8 | 23,564 |
| DevLens OSS MCP, summarized | 0.652 | 0.538 | 0.693 | 0.489 | 192 | 4,132 | 22,065 |
| semble | 0.652 | 0.535 | 0.689 | 0.491 | 508 | 736 | 15,616 |
| grep and read floor | 0.648 | 0.538 | 0.677 | 0.498 | not measured | not measured | 12,496 |
| codebase-memory | 0.644 | 0.544 | 0.675 | 0.506 | 1,100 | **294** | 26,374 |

**The one-line read:** DevLens is the only tool that leads all four quality columns — and it does so with the fastest calls (67 ms, roughly 37× faster than the next graph tools) and a small response. The field is close on quality (first to last is 0.050 correctness), so the tie-breaker is speed and response size, where DevLens leads outright.

## 1a. Consolidated 5-tool surface (agentic L2, follow-up round)

After the public benchmark, the MCP surface was consolidated from 24 tools to 5 (`resolve_context`, `find_symbols`, `get_node`, `impact`, `repo`; no `graphId`) with plain-text packets. A same-run agentic round (133 questions, one model, one run, all arms identical conditions) measured it:

| Arm | Correctness | F1 | Tokens per task | Turns |
|---|---|---|---|---|
| **DevLens V3 (5 tools, V3M packet)** | 0.712 | 0.595 | 35.5k | 5–6 |
| old DevLens (24 tools, published) | 0.709 | — | 63.4k | — |
| codegraph (published run) | 0.714 | — | 43.2k | — |
| semble (published run) | 0.724 | — | 45.2k | — |
| grep-and-read floor (same run) | 0.748–0.760 | 0.619–0.635 | 24.1–25.1k | 5 |

- The consolidation cut **43% of task tokens vs the old 24-tool surface** at equal-or-better correctness, moving DevLens from last in the field to tied with the strongest competitors.
- Measured packet size: ~1.2–1.5k tokens (2,631 → ~1,400).
- Where every tool (including grep) fails — multi-file synthesis questions — V3 leads the field on cost: feature-intent at 154k tokens vs the floor's 223k at equal correctness.
- Run-by-run data with per-type tables and the full experiment log: [`oss-mcp/V3-RESULTS-LOG.md`](../../benchmarks/oss-mcp/V3-RESULTS-LOG.md).

**Head to head against Graphify, on identical questions**

- **Packet size:** 2,230 tokens against 15,020 — 6.7× smaller, and smaller on all 54 of 54 questions where both tools record a size.
- **Per call:** 67 ms against 2,469 ms — about 37× faster — and 2,631 tokens returned against 4,707.
- **Index:** 10,346 nodes and 19,847 edges against 16,999 and 71,694 — higher quality from a smaller graph.
- **Quality:** first on correctness, F1, recall, and precision — the only tool that leads all four.

### 1b. By repository, in the retrieval layer

Each repository was asked its own question set at the same 6,000 token request, with no model involved. Three configurations have complete numbers on all five repositories: the DevLens graph summarized, unsummarized, and Graphify.

| Repository | Configuration | Questions | Recall | Precision | F1 | Tokens per call | Latency (ms) |
|---|---|---|---|---|---|---|---|
| httpx (Python) | DevLens summarized | 20 | 0.881 | 0.079 | 0.128 | 1,846 | 18 |
| httpx (Python) | DevLens unsummarized | 20 | 0.881 | 0.076 | 0.121 | 1,266 | 7 |
| httpx (Python) | Graphify | 20 | 0.871 | 0.108 | 0.175 | 11,463 | 242 |
| gson (Java) | DevLens summarized | 18 | **0.944** | 0.046 | 0.079 | 3,352 | 18 |
| gson (Java) | DevLens unsummarized | 18 | 0.938 | 0.033 | 0.061 | 2,827 | 14 |
| gson (Java) | Graphify | 18 | 0.753 | 0.042 | 0.077 | 20,132 | 430 |
| cobra (Go) | DevLens summarized | 18 | 0.852 | 0.075 | 0.123 | 1,738 | 5 |
| cobra (Go) | DevLens unsummarized | 18 | 0.759 | 0.078 | 0.125 | 1,124 | 4 |
| cobra (Go) | Graphify | 18 | 0.889 | 0.146 | 0.231 | 15,261 | 182 |
| ripgrep (Rust) | DevLens summarized | 15 | 0.718 | 0.115 | 0.176 | 1,608 | 32 |
| ripgrep (Rust) | DevLens unsummarized | 15 | 0.806 | 0.166 | 0.233 | 1,299 | 46 |
| ripgrep (Rust) | Graphify | 15 | 0.689 | 0.215 | 0.287 | 16,872 | 293 |
| dub (TypeScript) | DevLens summarized | 133 | 0.624 | 0.024 | 0.042 | 3,224 | 154 |
| dub (TypeScript) | DevLens unsummarized | 133 | 0.610 | 0.026 | 0.045 | 2,484 | 125 |
| dub (TypeScript) | Graphify | 133 | 0.528 | 0.079 | 0.068 | 18,418 | 1,165 |

DevLens finds more of the correct files on four of the five repositories (httpx, gson, ripgrep, dub) while returning 6–14× fewer tokens and answering 6–45× faster. Graphify leads F1 on four of five because F1 rewards its much higher precision: it returns far fewer files, so a larger share of what it returns is correct — but it also misses more of the answer.

### 1c. F1 by question type, in the agent layer

F1 per question on the dub run, all nine tools; best score per row in bold.

| Question type | Questions | DevLens unsummarized | codegraph | BM25 | Graphify | serena | DevLens summarized | semble | grep and read | codebase-memory |
|---|---|---|---|---|---|---|---|---|---|---|
| definition | 40 | 0.634 | 0.658 | 0.661 | 0.661 | **0.668** | 0.638 | 0.663 | 0.646 | 0.620 |
| blast-radius | 20 | 0.835 | 0.835 | 0.816 | 0.840 | **0.843** | 0.828 | 0.815 | 0.836 | **0.843** |
| feature-intent | 16 | **0.515** | 0.466 | 0.485 | 0.477 | 0.433 | 0.458 | 0.449 | 0.470 | 0.502 |
| flow | 15 | **0.613** | 0.610 | 0.579 | 0.599 | 0.586 | 0.591 | 0.585 | 0.566 | 0.601 |
| module-overview | 14 | **0.196** | 0.181 | 0.133 | 0.161 | 0.143 | 0.144 | 0.117 | 0.168 | 0.126 |
| importers | 10 | **0.650** | 0.574 | 0.558 | 0.521 | 0.542 | 0.564 | 0.530 | 0.505 | 0.605 |
| feature-nav | 10 | 0.148 | **0.152** | 0.145 | 0.118 | 0.136 | 0.133 | 0.123 | 0.124 | **0.152** |

DevLens unsummarized leads four of the seven types: feature-intent, flow, module-overview, and importers. One caveat: module-overview and feature-nav sit near the floor for every tool in the field, which points at the gold set or scorer rather than the tools, so treat per-type claims on those two rows as provisional.

## 2. How the benchmark works

- **Harness.** The agent is Pi, a coding agent run headless. Each tool is attached over MCP, one tool per session, and the agent works inside a read-only clone of the repository. Every question starts a fresh session with no memory of the previous one.
- **Input.** Each question is a short natural-language request about the codebase, written from real pull requests and real symbols.
- **Questions.** The dub suite holds 133 questions: definition 40, blast-radius 20, feature-intent 16, flow 15, module-overview 14, importers 10, feature-nav 10, robustness 8. Every question except the eight robustness ones carries a known correct file set.
- **Runs.** Each tool answers every question twice — 266 runs per tool, 2,394 runs in the nine-tool table. A failed run is scored zero, counted, and disclosed rather than dropped.
- **Answer.** The agent finishes by listing the files it used. That list, not the prose, is what gets graded.
- **Model.** `space-bunny-alpha`, the id recorded in every row of the section 1 run. A control run on `deepseek-v4-flash` measured the same build and is reported in the internal record.
- **Repositories.** httpx (Python), gson (Java), cobra (Go), ripgrep (Rust), dub (TypeScript), aniversehd (TypeScript).

## 3. What the numbers mean

The grader compares the file list the agent submitted with the known correct set for that question:

- **Recall** — the share of the correct files that were found.
- **Precision** — the share of the submitted files that were correct.
- **F1** — the harmonic mean of the two; the main number for comparing tools.
- **Correctness** — a graded score per question: 1.0 when recall ≥ 0.8 and precision ≥ 0.15, 0.5 when recall ≥ 0.4, 0.0 otherwise. The eight robustness questions have no correct file set, are checked only for not submitting an unreasonable number of files, and are left out of the means.
- **Latency** — median time for one call in the per-call column; median answer time per question at the agent layer.
- **Tokens** — reported three ways: what a tool returns in one call, the budgeted packet in the retrieval-layer run, and what the agent is billed per question.
- A failed run is scored zero. Paired comparisons use a sign test over per-question pairs, which is why the verdict quotes win/loss counts.

## 4. The two layers

- **L0, the retrieval layer** — calls the tool directly with the question and scores the list of files it returns. No agent, no model. Measures the quality and size of what the tool returns.
- **L2, the agent layer** — runs the full agent loop and scores the files the agent finally submits. Measures the answer a user actually receives.

## 5. Results: the agent layer (L2)

The dub run is the table in section 1; its per-type breakdown is in section 1c. One further measurement:

### 5a. Pooled over four languages

Source run: httpx, gson, cobra, ripgrep — 71 questions, two runs each, 142 runs per tool.

| Tool | Correctness | F1 | Recall | Precision | Latency (s) |
|---|---|---|---|---|---|
| grep and read floor | **0.965** | **0.728** | **0.966** | **0.633** | **8.5** |
| DevLens OSS MCP, summarized | 0.951 | 0.705 | 0.953 | 0.606 | 9.8 |
| Graphify | 0.937 | 0.701 | 0.938 | 0.609 | 9.4 |
| DevLens OSS MCP, unsummarized | 0.908 | 0.640 | 0.908 | 0.543 | 9.7 |

### 5b. F1 by question type

Covered in section 1c, which spans all nine tools rather than four.

## 6. Results: the retrieval layer (L0)

Source run: 6,000 token request, arms CS (summarized), CO (unsummarized), and D (Graphify). The summarized graph and Graphify were each sent some questions twice, so their raw run rows are higher than the question counts shown.

### 6a. Per repository

In section 1b.

### 6b. Pooled

| Tool | Questions | Recall | Precision | F1 | Tokens | Latency (ms) |
|---|---|---|---|---|---|---|
| DevLens OSS summarized | 204 | **0.708** | 0.046 | 0.076 | 2,806 | 123 |
| DevLens OSS unsummarized | 204 | 0.696 | 0.047 | 0.076 | **2,188** | **118** |
| Graphify | 204 | 0.634 | **0.104** | **0.124** | 16,892 | 1,009 |

### 6c. Packet size on the same questions

Median packet size in tokens, measured only on questions where both tools report a size, so both are doing identical work.

| Question set | Questions | Graphify | DevLens summarized | Graphify / DevLens | DevLens unsummarized | Graphify / DevLens |
|---|---|---|---|---|---|---|
| all five repositories | 54 | 15,020 | 3,686 | 4.1× | 2,230 | 6.7× |
| httpx | 6 | 12,050 | 2,292 | 5.3× | 1,322 | 9.1× |
| gson | 2 | 20,132 | 3,753 | 5.4× | 2,864 | 7.0× |
| cobra | 10 | 15,180 | 2,380 | 6.4× | 1,116 | 13.6× |
| ripgrep | 8 | 16,076 | 1,164 | 13.8× | 1,414 | 11.4× |
| dub | 28 | 15,282 | 3,978 | 3.8× | 2,458 | 6.2× |

DevLens is smaller on all 54 of 54 questions, on both the summarized and unsummarized graph, and it breached the requested 6,000 token budget on none of its 627 measured rows. Against that same request, Graphify's median packet is 2.5× the budget; DevLens summarized's median is 0.61 of it. Graphify reports a packet size only on the rows where it exceeded the budget (62 of 219 rows); on the other 157 it reports nothing, so the pooled token figure above covers the part of the suite where a like-for-like number exists.

## 7. Measurement notes

- **Latency per call and tokens returned per call** are the median of one call on each of eight questions, one per question type, from the same question set. Each tool's server was started once, warmed with one uncounted call, then timed. Tokens count the characters of the JSON a tool returns divided by four — the same rule for every tool. A tool that expects a symbol name rather than a sentence was given the main identifier from the question, so every tool received a query it can answer. The grep-and-read floor runs no server, so it has no value in these columns.
- **Billed tokens per question** is what the agent was billed per question in the 133-question run, at the agent layer, and belongs to that run's model. The three smallest response payloads come from tools that return a list of matched lines rather than a structured answer, so a low figure there means less returned, not more efficient work.
- **The two DevLens billed figures predate the smaller response** (see below), but refreshing them barely moves a per-question median: only about a fifth of the questions call the front door. On the questions that do, the smaller response cut what the agent was billed by 28.6 percent.
- **Graph nodes and edges** are the size of the index each tool built at the same pinned commit `a8db3fdd1a`. Definitions differ between tools, so read them as scale rather than like-for-like; BM25, semble, and serena build lexical/semantic/language-server indexes, so a node count does not apply. DevLens reaches the highest quality of all with 10,346 nodes; codebase-memory has the largest index and the lowest quality.
- **serena** returned no results from its symbol tool on every question, in both this measurement and the 133-question run, so its score comes from the shell and grep work it did instead. Its 8 tokens per call mean it found nothing, not that it is efficient.
- **Failures.** 21 of the 2,394 runs (0.9 percent) failed with a model endpoint rejection or timeout and are scored zero. Every failure billed zero tokens and stopped on the first turn — endpoint rejections, not tool behaviour. Spread: BM25 5, serena 5, DevLens unsummarized 5, codebase-memory 2, semble 2, DevLens summarized 1, grep floor 1, none for codegraph or Graphify.
- **Build change during the work.** The quality run was recorded before the DevLens response was made smaller. The front door used to return 76,087 characters for a 6,000 token request (packet 11,456); it now returns 11,871, and per-call time fell 22×. The packet content did not change, so every quality number stands.

## 8. Verdict

**DevLens OSS MCP ranked first of nine tools on correctness, F1, recall, and precision in a 133-question run on a real TypeScript codebase**, taking four of the seven question types (importers 0.650 F1 against 0.605 for the next best, plus feature-intent, flow, and module-overview).

The paired per-question comparison supports the routing: against the grep-and-read floor, DevLens wins 18 questions and loses 6 (+0.046 correctness, the only statistically significant paired result in the run, p = 0.023); against Graphify it wins 15 and loses 9 (+0.032, p = 0.31); against its own summarized graph it wins 17 and loses 7 (+0.042, p = 0.064).

**The efficiency case is large.** On identical questions DevLens returns a packet 4–7× smaller than Graphify's, on all 54 comparable questions, with 100 percent budget compliance. Per call on the current build the front door answers in 67 ms unsummarized and 192 ms summarized, against 2,469 ms for Graphify and 2,736 ms for codegraph, returning a smaller response than either — while also finding more of the correct files at that layer (0.708 / 0.696 recall against 0.634).

**Summaries are a workload choice.** On the four-language suite they lift F1 from 0.640 to 0.705; on the dub suite the unsummarized graph leads. Both configurations are strong, and the better one depends on the questions a team asks.
