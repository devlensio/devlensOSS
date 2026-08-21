# CLI Release Checklist

> **This file is for maintainers only.** It documents the exact steps to cut a release of the DevLens CLI (`@devlensio/cli`).

When you make changes under `src/**` (CLI, MCP, core, server), you need to release the CLI. The skill (`@devlensio/skill`) is versioned separately — see [`packages/skill-installer/MAINTAINERS.md`](packages/skill-installer/MAINTAINERS.md).

---

## How the CLI is self-contained (6 languages out of the box)

The compiled CLI binary bundles **every extractor a user needs**, so `npm install -g @devlensio/cli` (or a GitHub-release download) works on a clean machine with no `node_modules/devlensio` and no install-time setup:

| Language | How it ships | Runtime needed on the user's machine |
|---|---|---|
| TypeScript / JavaScript | devlensio's ts-morph inline extractor (compiled into the binary's JS) | none |
| Go | static binary embedded as a `/$bunfs` blob, materialized to `~/.devlens/extractors/v1` at first run | none |
| Rust | static binary embedded as a `/$bunfs` blob, materialized at first run | none |
| Java | fat jar embedded as a `/$bunfs` blob, materialized at first run | a JVM (Java 17+) on `PATH` |
| Python | the `devlens_extractors_python` module (pure stdlib) zipped and embedded; materialized zip is put on `PYTHONPATH` so `python3 -m devlens_extractors_python` imports straight out of it | `python3` (3.11+) on `PATH` |

At startup (`src/cli/preload.ts`, the **first** import in `src/cli/index.ts`), the binary materializes those blobs to `~/.devlens/extractors/v1/` and sets `DEVLENS_EXTRACTORS_DIR` (and `PYTHONPATH`) **before** devlensio is imported — devlensio resolves its subprocess-extractor paths at module-load time.

### Per-target embedding (why each binary is ~120 MB, not ~160 MB)
A binary built for `--target=bun-linux-x64` only runs on linux-x64, so it embeds **only** that platform's Go/Rust binaries (plus the portable Java jar and the portable Python zip — both platform-independent). Embedding all five platforms would be ~37 MB of dead bytes. `scripts/embed-active.mjs <target>` generates `src/cli/embedded/active.ts` importing only the host platform's wrappers; the other wrappers stay type-checked (via `src/cli/embedded/assets.d.ts`) but unreachable from the entry, so `bun build` drops them.

---

## Updating the engine (one command)

When you publish a new `devlensio` (e.g. an extractor bugfix or a new language version), sync the CLI to it with **one command**:

```bash
node scripts/update-engine.mjs            # devlensio → latest on npm
node scripts/update-engine.mjs 1.0.2      # devlensio → exact version
node scripts/update-engine.mjs latest --bump   # also bumps the CLI patch version
```

It is verbose and prints every step. It:

1. reads the current `devlensio` pin in `package.json`
2. resolves the target version (`npm view devlensio version`, or the one you passed)
3. updates `dependencies.devlensio` in `package.json`
4. `bun install` — fetches the new engine **and its new extractor binaries / Python module**
5. `node scripts/embed-python.mjs` — regenerates the Python module zip from the new `node_modules/devlensio/extractors/python/`
6. `node scripts/embed-active.mjs <host-target>` — regenerates `active.ts` from the new binaries
7. `npx tsc --noEmit` — sanity check

It **never** commits, tags, or publishes. After it runs, continue with the release checklist below (`set-version` → `build:binaries` → `stage:binaries` → commit → tag).

> **Before you run it:** `devlensio` must already be published (it's a normal npm dependency, not a workspace package). If you also changed `devlensio` locally, publish it first, then run `update-engine.mjs`.

---

## Pre-push / pre-publish checklist

Run these **before** every commit/tag that's intended to ship. All must pass:

```bash
# 1. Types clean (extensionless binary imports are typed via src/cli/embedded/assets.d.ts)
npx tsc --noEmit -p tsconfig.json

# 2. Regenerate embedded assets for the host (or run update-engine.mjs if the engine changed)
node scripts/embed-python.mjs
node scripts/embed-active.mjs linux-amd64       # ...or your host bun target

# 3. Build one binary for your host and SMOKE-TEST it on a clean machine:
bun build src/cli/index.ts --compile --target=bun-linux-x64 --outfile /tmp/devlens-fixed
/tmp/devlens-fixed doctor                          # all 4 extractors must be ✓
# (decisive clean test) temporarily move node_modules/devlensio aside and re-run
#   doctor + analyze on go/rust/java/python/js-ts repos from /tmp — see the
#   "Verifying embedding is real" section of the devlens skill.

# 4. Build the full per-target matrix (this regenerates active.ts per target)
bun run build:binaries

# 5. Stage binaries into the per-platform npm packages
bun run stage:binaries
```

Then proceed to the release steps below.

> **Do not commit generated artifacts under `dist/` or `src/cli/embedded/active.ts`/`python/devlens_python.zip` unless intentionally pinning a build.** `active.ts` for the dev host (`linux-amd64`) is committed so `tsc`/`bun run` work out-of-the-box; build-time regeneration overwrites it per target and restores the host copy.

---

## Release checklist

### 1. Check current version

```bash
npm view @devlensio/cli version
```

### 2. Switch to clean main

```bash
git checkout main && git pull
```

### 3. Sync the engine (if it changed) + bump version

If `devlensio` changed:

```bash
node scripts/update-engine.mjs latest
```

Then bump the CLI version everywhere (`package.json`, all 5 `npm/<platform>/package.json`, pinned `optionalDependencies`, `server.json`, and the `.version()` string in `src/cli/index.ts`):

```bash
node scripts/set-version.mjs <new-version>      # e.g. 0.4.1
```

`update-engine.mjs latest --bump` does both the engine sync and a CLI patch bump in one pass — use that when you want both.

### 4. Commit the version bump

```bash
git add -A
git commit -m "release: @devlensio/cli <version>"
git push origin main
```

### 5. Tag and push

Push a `v*` tag — CI detects this and runs the release pipeline automatically.

```bash
git tag v<version>
git push origin v<version>
```

### 6. What the CI does automatically

When the tag is pushed, `.github/workflows/release.yml`:

1. Installs deps (`bun install`)
2. Derives version from the tag name
3. `node scripts/set-version.mjs <version>` — syncs every manifest
4. `bun run build:binaries` — for each target: regenerates `active.ts` (`scripts/build-binaries.mjs`), typechecks, cross-compiles a native binary embedding only that platform's extractors
5. `bun run stage:binaries` — copies each binary into its `npm/<platform>/` package
6. **Publishes platform packages** first, then the **main package** (npm Trusted Publishing via OIDC — no token needed)
7. Runs the **postinstall reporter** (`scripts/postinstall.mjs`) so users see a verbose, confirmed install
8. Uploads raw binaries to GitHub Release (for the `install.sh` / `install.ps1` channel)
9. Publishes `server.json` to the MCP Registry (via OIDC)

### 7. Verify

```bash
npm view @devlensio/cli version
npx -y @devlensio/cli@latest --version
npx -y @devlensio/cli@latest doctor        # all 4 extractors ✓
```

---

## Script reference

| Script | What it does | When to run |
|---|---|---|
| `scripts/update-engine.mjs [ver] [--bump]` | Sync CLI to a new `devlensio` engine (pin + install + regen embeds + tsc) | after publishing a new `devlensio` |
| `scripts/set-version.mjs <ver>` | Stamp one version across main + 5 platform packages + `server.json` + CLI `.version()` | every release |
| `scripts/embed-python.mjs` | Zip `devlens_extractors_python` → `src/cli/embedded/python/devlens_python.zip` + `module.ts` wrapper | (auto by update-engine / build:binaries) |
| `scripts/embed-active.mjs <target>` | Generate `active.ts` importing only one platform's Go/Rust wrappers (+ jar + py) | (auto by update-engine / build:binaries) |
| `scripts/build-binaries.mjs [target...]` | Per-target: regen embeds → tsc → `bun build --compile` → restore host `active.ts` | `bun run build:binaries` |
| `scripts/stage-binaries.mjs` | Copy `dist/bin/*` into `npm/<platform>/` | `bun run stage:binaries` |
| `scripts/postinstall.mjs` | Verbose npm postinstall: confirms the platform binary installed, prints next steps | auto on `npm install` |

---

## Notes

- The git tag is what triggers the release. CI re-derives the version from the tag and re-runs `set-version.mjs`, so step 3–4 is for repo consistency (committed files matching what ships).
- **Binaries bundle whatever `devlensio` resolves at build time.** If the engine changed, run `update-engine.mjs` first (it publishes nothing — just fetches + regenerates embeds), then release the CLI.
- **CLI release does NOT bump the skill.** The two are versioned independently.
- The `postinstall` reporter and the `install.sh` / `install.ps1` channels are the only code paths a user's install touches — keep them non-fatal and cross-platform.
