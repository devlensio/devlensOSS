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

### 4. Commit and push (Plugin channel)

The Claude Plugin is served from the git repo, so push the new version:

```bash
git commit -am "skill <version>"
git push origin main
```

Users get the update via `/plugin update`.

### 5. Publish to npm (Installer channel)

`npx @devlensio/skill` resolves from npm.

```bash
cd packages/skill-installer
npm publish --dry-run    # Preview the tarball — verify skill/commands/*.md and SKILL.md are included
npm publish              # prepack hook runs bundle-skill.mjs automatically
cd ../..
```

**What `npm publish` does:**
- Runs the `prepack` hook, which executes `scripts/bundle-skill.mjs`
- This copies `plugins/devlens/skills/devlens/` into `packages/skill-installer/skill/`
- `skill/` is gitignored — it only exists transiently during publish
- The tarball ships `bin/` + `skill/` contents

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
