# CLI smoke harnesses (M8 verification)

Real-terminal / HTTP regression checks for the CLI fix plan. They spawn the
CLI **from source** (`bun src/cli/index.ts …`) against isolated HOMEs, so they
never touch `~/.devlens`.

```bash
# from the repo root
python3 scripts/smoke/websmoke.py    # webUI API contracts: config shapes,
                                      # keyless analyze auto-skip, SSE,
                                      # catalog without ollama, clean errors
python3 scripts/smoke/pty-init.py    # init stage flow over a real PTY:
                                      # wording, key/URL per-provider defaults,
                                      # ESC back/cancel, Ctrl+C -> 130
python3 scripts/smoke/pty-bar.py     # summarization bar over a real PTY:
                                      # p/r/c keys, counts, cancel -> 130
                                      # (uses $HOME copy of a working LLM
                                      # config — see the script header)
```

Requirements: python3, bun, network for the model-list/registry probes.
`pty-bar.py` additionally needs a summarizable fixture repo + a working
summarization config in the HOME it points at.

Exit code 0 = all checks passed; failures are listed on stdout.
