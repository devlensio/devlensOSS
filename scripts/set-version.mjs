// Sets one version across the main package, all platform packages, the pinned
// optionalDependencies, server.json, and the bundled CLI version constant — so
// a release is always lockstep.
//
// Usage: node scripts/set-version.mjs 0.7.2   (CI derives this from the git tag)
//
// Run this BEFORE build:binaries. It verifies the whole version surface after
// writing and exits non-zero if any source of truth disagrees, so a release
// can never ship a stale `devlens --version`.

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

// MCP registry manifest — keep its server + npm-package version in lockstep too.
const serverFile = path.join(root, "server.json");
if (fs.existsSync(serverFile)) {
  const srv = JSON.parse(fs.readFileSync(serverFile, "utf8"));
  srv.version = version;
  for (const pkg of srv.packages ?? []) pkg.version = version;
  writeJson(serverFile, srv);
}

// ── CLI version constant ─────────────────────────────────────────────────────
// `devlens --version` is bundled from this constant at build time, so it MUST
// be patched BEFORE build:binaries. This is the file that was missed in 0.7.1
// (package.json said 0.7.1 while the binary still reported 0.7.0).
const cliVersionFile = path.join(root, "src", "cli", "version.ts");
const cliVersionPattern = /(export const CLI_VERSION = )"[^"]*"/;

if (!fs.existsSync(cliVersionFile)) {
  console.error(
    `set-version: missing ${path.relative(root, cliVersionFile)} — cannot sync devlens --version.`
  );
  process.exit(1);
}

const cliVersionSrc = fs.readFileSync(cliVersionFile, "utf8");
if (!cliVersionPattern.test(cliVersionSrc)) {
  console.error(
    `set-version: no \`export const CLI_VERSION = "..."\` in ${path.relative(root, cliVersionFile)}. ` +
      `Refusing to continue — the published CLI would report a stale version.`
  );
  process.exit(1);
}
fs.writeFileSync(cliVersionFile, cliVersionSrc.replace(cliVersionPattern, `$1"${version}"`));

// Legacy: very old branches hardcoded the version in src/cli/index.ts. Patch a
// literal/constant there too when present; harmless on current branches.
const cliIndexFile = path.join(root, "src", "cli", "index.ts");
if (fs.existsSync(cliIndexFile)) {
  const src = fs.readFileSync(cliIndexFile, "utf8");
  const next = src
    .replace(/\.version\("[^"]*"\)/, `.version("${version}")`)
    .replace(/(const CLI_VERSION = )"[^"]*"/, `$1"${version}"`);
  if (next !== src) fs.writeFileSync(cliIndexFile, next);
}

// ── Verify lockstep ─────────────────────────────────────────────────────────
// Fail the release if any source of truth disagrees. This is the guard that
// prevents another 0.7.1-style drift (package.json bumped, --version stale).
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const mainPkg = readJson(mainFile);
const checks = [
  ["package.json", mainPkg.version],
  ["src/cli/version.ts", fs.readFileSync(cliVersionFile, "utf8").match(/export const CLI_VERSION = "([^"]+)"/)?.[1]],
];

if (fs.existsSync(serverFile)) {
  const srv = readJson(serverFile);
  checks.push(["server.json", srv.version]);
  for (const pkg of srv.packages ?? []) {
    checks.push([`server.json packages[${pkg.identifier ?? pkg.registryType ?? "?"}]`, pkg.version]);
  }
}

for (const p of PLATFORMS) {
  checks.push(
    [`npm/${p}/package.json`, readJson(path.join(root, "npm", p, "package.json")).version],
    [`package.json optionalDependencies[@devlensio/cli-${p}]`, mainPkg.optionalDependencies?.[`@devlensio/cli-${p}`]]
  );
}

const mismatches = checks.filter(([, actual]) => actual !== version);
if (mismatches.length > 0) {
  console.error("set-version: lockstep verification FAILED:");
  for (const [label, actual] of mismatches) {
    console.error(`  ${label}: expected ${version}, got ${actual}`);
  }
  process.exit(1);
}

console.log(
  `Set version ${version} across main + ${PLATFORMS.length} platform packages + server.json + src/cli/version.ts (verified).`
);
