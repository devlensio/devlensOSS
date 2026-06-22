// Sets ONE version across the DevLens Agent Skill's two channels so they never
// drift: the npx installer (`@devlensio/skill`) and the Claude plugin
// (`plugins/devlens`). This is the SKILL product version — deliberately separate
// from the CLI's `scripts/set-version.mjs`, so a CLI release never bumps the skill.
//
// Usage: node scripts/set-skill-version.mjs 0.2.0

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("usage: node scripts/set-skill-version.mjs <semver>  (e.g. 0.2.0)");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writeJson = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");

const targets = [
  { file: path.join(root, "packages", "skill-installer", "package.json"), label: "installer (@devlensio/skill)" },
  { file: path.join(root, "plugins", "devlens", ".claude-plugin", "plugin.json"), label: "plugin (devlens)" },
];

for (const { file, label } of targets) {
  if (!fs.existsSync(file)) {
    console.error(`set-skill-version: missing ${file}`);
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = version;
  writeJson(file, pkg);
  console.log(`✔ ${label} → ${version}`);
}

console.log(`\nSkill version set to ${version}. Next: republish the installer (cd packages/skill-installer && npm publish) and commit+push for the plugin channel.`);
