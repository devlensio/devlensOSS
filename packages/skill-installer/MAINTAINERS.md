# Skill Release Checklist

> **This file is for maintainers only.** It documents the exact steps to cut a release of the DevLens Agent Skill (`@devlensio/skill` + Claude Plugin).

The skill ships on **two channels** that must carry the **same version**:
- `packages/skill-installer/package.json` → npm package `@devlensio/skill` (drives `npx @devlensio/skill update`)
- `plugins/devlens/.claude-plugin/plugin.json` → Claude Plugin (served from the git repo; gates `/plugin update`)

When you make changes under `plugins/devlens/**` or `packages/skill-installer/**`, you need to release the skill. The CLI (`@devlensio/cli`) is versioned separately — see `MAINTAINERS.md` at repo root.

---

## Prerequisites

- [ ] Push access to the repo
- [ ] Maintainer rights on npm `@devlensio` org
- [ ] Clean working tree on `main`

---

## Release checklist

### 1. Check current versions on both channels

```bash
# npm channel
npm view @devlensio/skill version

# Plugin channel
node -e "console.log(require('./plugins/devlens/.claude-plugin/plugin.json').version)"
```

Pick a version **greater than both**. (Bump minor for behavior changes like a new subcommand; patch for fixes.)

### 2. Switch to clean main

```bash
git checkout main && git pull
```

### 3. Stamp both channels to the same version

```bash
node scripts/set-skill-version.mjs <new-version>
```

This updates: `packages/skill-installer/package.json` and `plugins/devlens/.claude-plugin/plugin.json`.

### 4. Commit and push (both channels)

```bash
git commit -am "skill <version>"
git push origin main
```

The Claude Plugin channel updates as soon as `main` is pushed — users get it via `/plugin update`.

### 5. Tag and publish (npm channel)

Push a `skill-v*` tag — CI detects this and publishes to npm automatically.

```bash
git tag skill-v<version>
git push origin skill-v<version>
```

**What the CI does (`.github/workflows/release-skill.yml`):**
- Derives version from the tag name (strips the `skill-v` prefix)
- Runs `node scripts/set-skill-version.mjs <version>` — syncs manifests
- Runs `npm publish` inside `packages/skill-installer/` (Trusted Publishing via OIDC — no token needed)
- The `prepack` hook runs `scripts/bundle-skill.mjs` automatically, which copies `plugins/devlens/skills/devlens/` into `packages/skill-installer/skill/` (that dir is gitignored — it only exists transiently during publish)

> **Manual fallback:** If CI is down, publish manually:
> ```bash
> cd packages/skill-installer
> npm publish --dry-run   # Preview tarball — verify skill/commands/*.md and SKILL.md
> npm publish
> cd ../..
> ```

### 6. Verify

```bash
# npm channel
npm view @devlensio/skill version
npx -y @devlensio/skill@latest check

# Plugin channel — in Claude Code
/plugin update    # should report the new version

# Cross-dep check: the Skill auto-registers MCP via the CLI
npx -y @devlensio/cli@latest mcp --help    # must work
```

---

## Notes

- **Skill release does NOT bump the CLI.** The two are versioned independently.
- If the Skill relies on a new CLI feature (e.g., a new MCP tool), release the CLI **first**, then the Skill.
- The `--dry-run` is important — it confirms `bundle-skill.mjs` actually populated `skill/` with the latest authored recipes (especially newly added command files like `onboard.md`).
- Do **not** add these versions to `scripts/set-version.mjs` — that script is for the CLI release pipeline only.
