#!/usr/bin/env node
// @devlensio/skill — installs the DevLens Agent Skill (/devlens) into your AI
// coding tool. Zero dependencies; just copies the bundled skill into the right
// per-harness skills directory.
//
//   npx @devlensio/skill install        # install into detected harness(es), project scope
//   npx @devlensio/skill install --global
//   npx @devlensio/skill update         # re-copy (overwrite) bundled skill
//   npx @devlensio/skill check          # report whether install is behind
//
// Flags: --global, --harness <claude|cursor>, --force

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_NAME = "devlens";
const MARKER = ".devlens-skill-version";
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");

// Bundled skill (prepack-copied) when published; repo source when run from a checkout.
function resolveSkillSrc() {
  const bundled = path.join(pkgRoot, "skill");
  if (fs.existsSync(path.join(bundled, "SKILL.md"))) return bundled;
  const repo = path.resolve(pkgRoot, "..", "..", "plugins", "devlens", "skills", "devlens");
  if (fs.existsSync(path.join(repo, "SKILL.md"))) return repo;
  fail(`could not find the skill to install (looked in ${bundled} and ${repo}).`);
}

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// harness → { label, markers[] (dirs that indicate the tool is in use, for
// autodetect), root(global): absolute skills root }. Command target is
// <root>/<SKILL_NAME>. Each tool's NATIVE skills dir is used.
const HARNESSES = {
  claude: {
    label: "Claude Code",
    markers: [".claude"],
    root: (g) => (g ? path.join(os.homedir(), ".claude", "skills") : path.join(process.cwd(), ".claude", "skills")),
  },
  cursor: {
    label: "Cursor",
    markers: [".cursor"],
    root: (g) => (g ? path.join(os.homedir(), ".cursor", "skills") : path.join(process.cwd(), ".cursor", "skills")),
  },
  kilo: {
    label: "Kilo Code",
    markers: [".kilo", ".kilocode"],
    root: (g) => (g ? path.join(os.homedir(), ".kilocode", "skills") : path.join(process.cwd(), ".kilo", "skills")),
  },
  opencode: {
    label: "opencode",
    markers: [".opencode"],
    root: (g) => (g ? path.join(os.homedir(), ".config", "opencode", "skills") : path.join(process.cwd(), ".opencode", "skills")),
  },
  pi: {
    label: "pi",
    markers: [".pi", ".agents"],
    root: (g) => (g ? path.join(os.homedir(), ".pi", "agent", "skills") : path.join(process.cwd(), ".agents", "skills")),
  },
};

function fail(msg) {
  console.error(`devlens-skill: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { cmd: argv[0] || "install", global: false, harness: null, force: false };
  for (const a of argv.slice(1)) {
    if (a === "--global" || a === "-g") out.global = true;
    else if (a === "--force" || a === "-f") out.force = true;
    else if (a === "--harness") fail("--harness needs a value: --harness=claude or --harness=cursor");
    else if (a.startsWith("--harness=")) out.harness = a.slice("--harness=".length);
    else fail(`unknown argument "${a}". Try: install | update | check  [--global] [--harness=claude|cursor|kilo|opencode|pi] [--force]`);
  }
  if (out.harness && !HARNESSES[out.harness]) fail(`unknown harness "${out.harness}". Known: ${Object.keys(HARNESSES).join(", ")}.`);
  return out;
}

// Which harnesses to target: explicit flag wins; else detect by marker dir; else default to claude.
function chooseHarnesses({ harness, global }) {
  if (harness) return [harness];
  const detected = Object.entries(HARNESSES)
    .filter(([, h]) => h.markers.some((m) => fs.existsSync(path.join(process.cwd(), m))))
    .map(([k]) => k);
  if (detected.length) return detected;
  if (global) return ["claude"];
  return ["claude"]; // sensible default; creates .claude/skills
}

function copySkill(src, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(src, destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, MARKER), version() + "\n");
}

function installedVersion(destDir) {
  try {
    return fs.readFileSync(path.join(destDir, MARKER), "utf8").trim();
  } catch {
    return null;
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "help" || args.cmd === "--help" || args.cmd === "-h") {
    console.log(`@devlensio/skill v${version()}

Harnesses: claude | cursor | kilo | opencode | pi

Usage:
  npx @devlensio/skill install [--global] [--harness=<harness>] [--force]
  npx @devlensio/skill update  [--global] [--harness=<harness>]
  npx @devlensio/skill check   [--global] [--harness=<harness>]

Installs the /devlens Agent Skill. Default scope is the current project; use
--global for your home directory. Without --harness, detects which tools are in
use from their marker dirs (.claude, .cursor, .kilo, .opencode, .pi/.agents) and
installs to each (defaults to Claude Code if none detected).`);
    return;
  }

  const src = resolveSkillSrc();
  const targets = chooseHarnesses(args);
  const scope = args.global ? "global" : "project";

  for (const key of targets) {
    const h = HARNESSES[key];
    const destDir = path.join(h.root(args.global), SKILL_NAME);

    if (args.cmd === "check") {
      const have = installedVersion(destDir);
      if (!have) console.log(`• ${h.label} (${scope}): not installed`);
      else if (have === version()) console.log(`• ${h.label} (${scope}): up to date (v${have})`);
      else console.log(`• ${h.label} (${scope}): v${have} installed, v${version()} available — run \`update\``);
      continue;
    }

    if (args.cmd === "install" || args.cmd === "update") {
      const have = installedVersion(destDir);
      if (have && args.cmd === "install" && !args.force) {
        console.log(`• ${h.label} (${scope}): already installed (v${have}). Use \`update\` or --force to overwrite.`);
        continue;
      }
      copySkill(src, destDir);
      console.log(`✔ ${h.label} (${scope}): installed /${SKILL_NAME} v${version()} → ${path.relative(process.cwd(), destDir) || destDir}`);
      continue;
    }

    fail(`unknown command "${args.cmd}". Try: install | update | check | help`);
  }

  if (args.cmd === "install" || args.cmd === "update") {
    console.log(`\nReload your tool and type \`/${SKILL_NAME}\` — e.g. \`/${SKILL_NAME} architecture\`, \`/${SKILL_NAME} security-analysis\`.`);
  }
}

run();
