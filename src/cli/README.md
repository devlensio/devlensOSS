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

## Release / publish the CLI

The CLI release is **tag-driven and fully automated** — pushing a `v*` git tag triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml), which builds and publishes everything. You do **not** build or `npm publish` by hand.

> This is the **CLI + MCP** channel (`@devlensio/cli`, the 5 platform packages, `server.json` → MCP registry). It is **separate** from the `/devlens` **skill** channel (`@devlensio/skill` + the plugin), which is versioned by `scripts/set-skill-version.mjs`. A CLI release does not bump the skill, and vice-versa. Use this section for changes under `src/**`.

### Steps to cut a release

```bash
# 1. Be on a clean, green main.
git checkout main && git pull

# 2. Sync the version everywhere, then commit (keeps the repo honest).
#    set-version.mjs updates: package.json + the 5 npm/<platform>/package.json,
#    the main package's pinned optionalDependencies, server.json (+ its packages),
#    and the hardcoded .version("x.y.z") in src/cli/index.ts.
node scripts/set-version.mjs 0.3.0
git commit -am "cli 0.3.0"
git push origin main

# 3. Tag with the SAME version (prefixed with v) and push the tag — this fires the release.
git tag v0.3.0
git push origin v0.3.0
```

The git tag is what actually triggers publishing; the CI job re-derives the version from the tag name and re-runs `set-version.mjs` itself, so step 2 is for repo consistency (committed files matching what ships). Tag-only would still publish correctly.

### What the GitHub Action does automatically (in order)

1. Installs deps (`bun install --frozen-lockfile`) and derives the version from the tag (`v0.3.0` → `0.3.0`).
2. `node scripts/set-version.mjs <version>` — syncs every package + `server.json` + the CLI version string.
3. `bun run build:binaries` — cross-compiles all 5 native targets from one Linux runner (darwin arm64/x64, linux x64/arm64, windows x64).
4. `bun run stage:binaries` — copies each binary into its `npm/<platform>/` package.
5. **Publishes platform packages first**, then the **main package** (so the main package's pinned `optionalDependencies` resolve). npm **Trusted Publishing via OIDC** — no `NPM_TOKEN` needed.
6. Uploads the raw binaries to the **GitHub Release** (for the install-script channel).
7. Publishes `server.json` to the **MCP Registry** (`mcp-publisher`, tokenless via GitHub OIDC) — last, so a registry hiccup can't block the npm release.

### Before you tag — local sanity (optional)

```bash
bun install
bun run build:binaries
./dist/bin/devlens-windows-x64.exe --version   # smoke-test your platform's binary
```

### After the action finishes — verify

```bash
npm view @devlensio/cli version                 # the registry shows the new version
npx -y @devlensio/cli@latest --version          # end users get it
npx -y @devlensio/cli@latest mcp --help         # the `mcp` subcommand the plugin depends on works
```

### Prerequisites

- Push access to the repo (to push tags) and maintainer rights on the npm `@devlensio` org / the MCP-registry namespace.
- Trusted Publishing must be configured for each npm package (already set up; OIDC means no secrets in the repo).
