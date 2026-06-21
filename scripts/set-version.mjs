// Sets one version across the main package, all platform packages, and the
// main package's pinned optionalDependencies — so a release is always lockstep.
//
// Usage: node scripts/set-version.mjs 0.3.0   (CI derives this from the git tag)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("usage: node scripts/set-version.mjs <semver>  (e.g. 0.3.0)");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "windows-x64"];

const writeJson = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");

// Platform packages
for (const p of PLATFORMS) {
  const file = path.join(root, "npm", p, "package.json");
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = version;
  writeJson(file, pkg);
}

// Main package + its pinned optionalDependencies
const mainFile = path.join(root, "package.json");
const main = JSON.parse(fs.readFileSync(mainFile, "utf8"));
main.version = version;
main.optionalDependencies = main.optionalDependencies ?? {};
for (const p of PLATFORMS) main.optionalDependencies[`@devlensio/cli-${p}`] = version; // exact pin
writeJson(mainFile, main);

console.log(`Set version ${version} across main + ${PLATFORMS.length} platform packages.`);
