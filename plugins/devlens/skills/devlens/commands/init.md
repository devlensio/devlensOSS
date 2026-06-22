# /devlens init — set up DevLens for this repo

Bootstrap so the other subcommands work. Arguments: none.

## Steps
1. **CLI present?** `devlens --version`. If missing: `npm install -g @devlensio/cli`. (Corporate proxy → set `NODE_EXTRA_CA_CERTS` to the org root CA.)
2. **Provider configured?** `devlens doctor` — checks git, storage, and the LLM provider used for summaries. If the provider isn't set, run `devlens init` (interactive) so summarization can work later.
3. **Build the structural graph:** `devlens analyze . --json`. This is structure only and safe to run.
4. **Offer summaries (ask first):** summaries (technical/business/security) cost LLM calls. **Ask the user** whether to generate them now; only if they agree run:
   `devlens analyze . --summarize --json`
5. **Confirm state:** `devlens status --json` — show the entry for this repo (`latestCommit`, `summarizedCommits`) so the user knows what's ready.

## Notes
- Summary-dependent subcommands (architecture, explain, security-analysis, summary) need step 4. Structure-only subcommands (find, impact, tech-debt, diagram) work after step 3.
- Re-run `init` after a big dependency or structure change if you want fresh summaries.
