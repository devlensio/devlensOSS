# `src/cli` — the `devlens` CLI

The command-line interface for DevLens. It's a [commander](https://github.com/tj/commander.js) program that analyzes a repo and queries the resulting graph. The compiled binary (`@devlensio/cli`) is built from this folder's entrypoint.

> User-facing command docs (every command, arg, and option) live in the [root README](../../README.md#cli-command-reference). This file documents the **code**.

## Layout

```
src/cli/
├── index.ts            # entrypoint — builds the commander program, registers every command
├── options.ts          # withGlobalFlags() + the --json/--verbose preAction hook (setJsonMode)
├── output.ts           # emit() / info() / success() / warn() / die() — stdout vs stderr discipline
├── graphResolve.ts     # resolveGraphId() — map cwd (or -g) to a stored graphId
├── jobRunner.ts        # runs long-lived jobs (analyze/summarize) with progress on stderr
└── commands/
    ├── analyze.ts      # analyze
    ├── summarize.ts    # summarize
    ├── config.ts       # config
    ├── init.ts         # init
    ├── doctor.ts       # doctor
    ├── status.ts       # status
    ├── repos.ts        # repos
    ├── graphs.ts       # graphs list|delete
    ├── serve.ts        # serve (backend API for the Web UI)
    ├── mcp.ts          # mcp stdio|http
    └── query.ts        # overview, top-nodes, find-nodes, nodes-in-path, get-node,
                        # get-summaries, node-code, blast-radius, khop, subgraph,
                        # cycles, security, diff
```

## How it's wired

- **`index.ts`** creates the `commander` program (`.name("devlens")`, `.version(...)`), then calls each `register<X>Command(program)`. The hardcoded `.version("x.y.z")` is what `devlens --version` reports — `scripts/set-version.mjs` patches it at release time.
- **`options.ts`** — `withGlobalFlags()` adds `--json` / `--verbose` to a command, and a `preAction` hook calls `setJsonMode()` before any action runs.
- **`output.ts`** — the single output channel. Results go to **stdout** via `emit()` (JSON when `--json`, else human text); diagnostics/progress/errors go to **stderr** via `info`/`success`/`warn`/`die`. In `--json` mode it also redirects stray `console.log`/`info`/`debug` to stderr so machine output stays clean.
- **`graphResolve.ts`** — `resolveGraphId(optGraph)` returns the explicit `-g` id or the graph for the current working directory.
- **Query commands** (`commands/query.ts`) are thin: they parse flags, call a pure function in [`src/core`](../core), and `emit()` the result. **The CLI and the MCP server call the same `src/core` functions**, so the two never drift.
- **Job commands** (`analyze`, `summarize`) run through `jobRunner.ts`, which drives the `devlensio` pipeline and streams progress to stderr.

## Develop

```bash
# run any command straight from source (no build)
bun src/cli/index.ts <command> [args]
bun src/cli/index.ts overview --json

# build the native binaries (all 5 targets)
bun run build:binaries
```

`import.meta.main` guards mean entry files only auto-run when executed directly. Entry files need `/// <reference types="bun" />` for `import.meta.main` to type-check.

## Add a command

1. Create `commands/my-command.ts` exporting `registerMyCommand(program)`.
2. For a **query**, add it to `query.ts` and back it with a pure function in `src/core` (so the MCP tool can reuse it).
3. Wrap the command with `withGlobalFlags(...)` and emit results with `emit()`.
4. Register it in `index.ts`.
