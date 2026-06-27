# @devlensio/skill

Installs the **DevLens Agent Skill** (`/devlens`) into your AI coding tool. The skill teaches the agent to drive the [DevLens CLI](https://www.npmjs.com/package/@devlensio/cli) — querying a precomputed code graph (nodes, typed edges, technical/business/security summaries) instead of grepping and reading whole files.

## Install

```bash
# Install into the AI tools detected in this project (defaults to Claude Code if none found)
npx @devlensio/skill install

# Force a specific tool
npx @devlensio/skill install --harness=cursor

# Install into your home directory instead of the current project
npx @devlensio/skill install --global

# Re-copy after an update / overwrite an existing install
npx @devlensio/skill update          # or: install --force

# See whether your install is up to date
npx @devlensio/skill check
```

> Requires the DevLens CLI itself: `npm install -g @devlensio/cli`. Behind a corporate proxy? set `NODE_EXTRA_CA_CERTS` to your org root CA.

After installing, reload your tool and type `/devlens` — e.g. `/devlens architecture`, `/devlens security-analysis`, `/devlens diagram`.

## Supported tools

| Harness | Project skills dir | Global (`--global`) dir |
| :-- | :-- | :-- |
| Claude Code | `.claude/skills/devlens/` | `~/.claude/skills/devlens/` |
| Cursor | `.cursor/skills/devlens/` | `~/.cursor/skills/devlens/` |
| Kilo Code | `.kilo/skills/devlens/` | `~/.kilocode/skills/devlens/` |
| opencode | `.opencode/skills/devlens/` | `~/.config/opencode/skills/devlens/` |
| pi | `.agents/skills/devlens/` | `~/.pi/agent/skills/devlens/` |

Without `--harness`, the installer auto-detects which tools are in use from their marker dirs (`.claude`, `.cursor`, `.kilo`/`.kilocode`, `.opencode`, `.pi`/`.agents`) and installs to each. (`.agents/skills/` is a shared convention also read by Kilo Code and opencode.)

Claude Code users can alternatively install via the plugin marketplace:

```text
/plugin marketplace add devlensio/devlensOSS
/plugin install devlens@devlensio
```

---

## For maintainers

### How this package is built

The skill content has **one source of truth**: [`plugins/devlens/skills/devlens/`](../../plugins/devlens/skills/devlens) in this repo (the Claude plugin). This installer package does **not** keep its own copy in git. Instead, a copy is generated at publish time:

- `scripts/bundle-skill.mjs` copies that source skill into `packages/skill-installer/skill/`.
- It runs automatically on the **`prepack`** npm lifecycle hook (i.e. before `npm pack` / `npm publish`).
- `skill/` is gitignored — it only exists transiently during a publish.

This is why the package can't just reference `../../plugins/...`: an npm tarball can only contain files inside the package directory, so the skill must be bundled in.

### `package.json` fields that matter

- **`bin`** (`{ "skill": "bin/skill.mjs" }`) — declares the executable. This is what makes `npx @devlensio/skill …` resolve to and run `bin/skill.mjs`.
- **`files`** (`["bin/", "skill/"]`) — the whitelist of what ships in the tarball. Paths are **relative to this `package.json`**, so `bin/` = `packages/skill-installer/bin/` and `skill/` = `packages/skill-installer/skill/`. `scripts/` is intentionally **not** listed — `bundle-skill.mjs` is a build-time tool and must not ship.
- **`prepack`** script — runs `bundle-skill.mjs` to populate `skill/` before packing.

So `bin/skill.mjs` runs on the **user's** machine; `scripts/bundle-skill.mjs` runs on the **publisher's** machine. Same package, two roles.

### Releasing a new version

The skill product is versioned **independently of the `@devlensio/cli`**, and ships on **two channels** that must carry the **same** version:

- `packages/skill-installer/package.json` → the npm package `@devlensio/skill` (drives `npx @devlensio/skill update`).
- `plugins/devlens/.claude-plugin/plugin.json` → the Claude plugin (served from the git repo via the root `.claude-plugin/marketplace.json`; this version gates `/plugin update`).

> This is the **skill** channel. It is **separate** from the **CLI + MCP** channel (`@devlensio/cli`, platform packages, `server.json`/MCP registry), which is tag-driven via `scripts/set-version.mjs` + `.github/workflows/release.yml` (see [`src/cli/README.md`](../../src/cli/README.md#release--publish-the-cli)). A skill release never bumps the CLI, and vice-versa. Use this section for changes under `plugins/devlens/**`.

#### 0. Pick the version (mind the drift)

Both files must match, and npm won't accept a version **≤** what's already published. Check both before choosing:

```bash
npm view @devlensio/skill version                                  # installer's published version
node -e "console.log(require('./plugins/devlens/.claude-plugin/plugin.json').version)"   # plugin's version
```

Pick a version **greater than both**. (Bump minor for a behavior change like the MCP-transport switch or a new subcommand; patch for fixes.)

#### Steps

```bash
# 1. Be on a clean, green main.
git checkout main && git pull

# 2. Stamp BOTH channels to the same version (installer package.json + plugin.json).
node scripts/set-skill-version.mjs 0.4.0

# 3. Plugin channel = the git repo. Commit + push to main; users get it via /plugin update.
git commit -am "skill 0.4.0" && git push origin main

# 4. npx-installer channel. Preview the tarball FIRST, then publish.
cd packages/skill-installer
npm publish --dry-run      # confirm skill/commands/*.md (incl. onboard.md) and SKILL.md are in the file list
npm publish                # prepack re-runs bundle-skill.mjs to rebundle skill/ from the source of truth
cd ../..
```

#### What `npm publish` does here

`packages/skill-installer/skill/` is **gitignored and generated** — the authored skill lives only at [`plugins/devlens/skills/devlens/`](../../plugins/devlens/skills/devlens). The `prepack` hook runs `scripts/bundle-skill.mjs`, which wipes and re-copies that source into `skill/` so the tarball always ships the latest authored recipes (that's how a freshly added recipe like `onboard.md` gets in). The `--dry-run` above is your check that it actually did.

#### After publishing — verify

```bash
npm view @devlensio/skill version            # registry shows the new version
npx -y @devlensio/skill@latest check         # an end-user install reports up to date
# In Claude Code: /plugin update   → the plugin moves to the new version
```

#### Cross-dependency to check (don't skip)

The skill/plugin now auto-registers the DevLens **MCP** via `npx -y @devlensio/cli mcp`. That only works if the **published** CLI already has the `mcp` subcommand:

```bash
npx -y @devlensio/cli@latest mcp --help      # must work; if not, release the CLI first (see src/cli/README.md)
```

> Do **not** add these versions to the CLI's `scripts/set-version.mjs` — keeping the two version systems separate ensures a CLI release never bumps the skill.
