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

The skill product is versioned **independently of the `@devlensio/cli`**. The version lives in two files that must stay identical:

- `packages/skill-installer/package.json` → drives `npx @devlensio/skill update`
- `plugins/devlens/.claude-plugin/plugin.json` → gates Claude `/plugin update`

Stamp both at once from the repo root:

```bash
node scripts/set-skill-version.mjs 0.2.0
```

Then publish each channel:

```bash
# npx installer
cd packages/skill-installer && npm publish        # prepack rebundles skill/; first publish: --access public + 2FA

# Claude plugin
git commit -am "skill 0.2.0" && git push           # users update via /plugin update
```

> Do **not** add these versions to the CLI's `scripts/set-version.mjs` — keeping them separate ensures a CLI release never bumps the skill.
