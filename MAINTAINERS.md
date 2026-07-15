# CLI Release Checklist

> **This file is for maintainers only.** It documents the exact steps to cut a release of the DevLens CLI (`@devlensio/cli`).

When you make changes under `src/**` (CLI, MCP, core, server), you need to release the CLI. The skill (`@devlensio/skill`) is versioned separately — see `packages/skill-installer/MAINTAINERS.md`.

---

## Prerequisites

- [ ] Push access to the repo
- [ ] Maintainer rights on npm `@devlensio` org
- [ ] Maintainer rights on the MCP registry namespace
- [ ] Clean working tree on `main`

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

### 3. Bump version everywhere

`set-version.mjs` stamps: `package.json`, all 5 `npm/<platform>/package.json`, pinned `optionalDependencies`, `server.json` (MCP registry), and the hardcoded `.version("x.y.z")` in `src/cli/index.ts`.

```bash
node scripts/set-version.mjs <new-version>
```

Example: `node scripts/set-version.mjs 0.3.0`

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

1. Installs deps (`bun install --frozen-lockfile`)
2. Derives version from the tag name
3. `node scripts/set-version.mjs <version>` — syncs every manifest
4. `bun run build:binaries` — cross-compiles all 5 native targets (darwin arm64/x64, linux x64/arm64, windows x64)
5. `bun run stage:binaries` — copies each binary into its `npm/<platform>/` package
6. **Publishes platform packages** first, then the **main package** (npm Trusted Publishing via OIDC — no token needed)
7. Uploads raw binaries to GitHub Release (for the install-script channel)
8. Publishes `server.json` to the MCP Registry (via OIDC)

### 7. Verify

```bash
npm view @devlensio/cli version
npx -y @devlensio/cli@latest --version
npx -y @devlensio/cli@latest mcp --help
```

---

## Notes

- The git tag is what triggers the release. The CI re-derives the version from the tag and re-runs `set-version.mjs`, so step 3-4 is for repo consistency (committed files matching what ships).
- **Binaries bundle whatever `devlensio` resolves at build time.** If the engine changed, publish `devlensio` first, then bump the pin here + `bun install`, then release the CLI.
- **CLI release does NOT bump the skill.** The two are versioned independently.
