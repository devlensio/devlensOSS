// Sync the CLI to a new devlensio engine release in ONE command.
//
// "Whenever I update the engine for these languages, automatically the CLI
// package should also be updated" — this is that script. It bumps the devlensio
// dependency to the version you name (or latest), fetches it (bun install), and
// regenerates the embedded extractor assets (python module zip + the host
// platform's go/rust wrappers + active.ts) from the NEW engine, so the next
// `bun run build:binaries` embeds the new engine's extractors.
//
// Usage:
//   node scripts/update-engine.mjs                # devlensio → latest
//   node scripts/update-engine.mjs 1.0.2          # devlensio → 1.0.2
//   node scripts/update-engine.mjs latest --bump  # also bump CLI patch version
//
// What it does (verbose — prints every step):
//   1. reads the current devlensio pin from package.json
//   2. resolves the target version (latest via `npm view`, or the one you gave)
//   3. updates package.json dependencies.devlensio
//   4. bun install  (fetches the new engine + its new extractor binaries/zip)
//   5. node scripts/embed-python.mjs   (regenerate the python module zip)
//   6. node scripts/embed-active.mjs linux-amd64  (regenerate host active.ts)
//   7. npx tsc --noEmit  (sanity: types still clean)
//   8. prints what changed + the exact next steps to release
//
// It NEVER commits, tags, or publishes — those stay manual (see MAINTAINERS.md).
// Run it from anywhere; it cd's to the repo root itself.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const HOST_TARGET = process.platform === "darwin"
  ? (process.arch === "arm64" ? "darwin-arm64" : "darwin-x64")
  : process.platform === "win32"
    ? "windows-x64"
    : process.platform === "linux"
      ? (process.arch === "arm64" ? "linux-arm64" : "linux-x64")
      : null;

function log(...a) { console.log("\n  [engine]", ...a); }
function fail(...a) { console.error("\n  [engine] ✖", ...a); }

function readPkg() {
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}
function writePkg(p) {
  fs.writeFileSync(pkgPath, JSON.stringify(p, null, 2) + "\n");
}
function npmViewLatest() {
  return execSync("npm view devlensio version", { stdio: ["ignore", "pipe", "ignore"] })
    .toString().trim();
}
function run(cmd, args, label) {
  log(`▶ ${label}`);
  // shell:true only where genuinely needed (npx on win32); otherwise plain spawn
  // avoids Node's DEP0190 (passing args with shell:true is an injection risk).
  const shell = process.platform === "win32" && cmd === "npx";
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell });
  if (r.status !== 0) {
    fail(`${label} failed (exit ${r.status})`);
    process.exit(1);
  }
}

// --- argparse ---
const args = process.argv.slice(2);
const bumpCli = args.includes("--bump");
const versionArg = args.find((a) => !a.startsWith("--"));

// 1) current pin
const pkg0 = readPkg();
const currentPin = pkg0.dependencies?.devlensio;
if (!currentPin) { fail("no `devlensio` dependency found in package.json"); process.exit(1); }
log(`current devlensio pin: ${currentPin}`);

// 2) resolve target
let target;
if (!versionArg || versionArg === "latest") {
  log("resolving latest devlensio via `npm view` ...");
  target = npmViewLatest();
} else {
  target = /^\d/.test(versionArg) ? versionArg : versionArg; // accept "1.0.2"
}
log(`target devlensio: ${target}`);

if (!HOST_TARGET) { fail(`unsupported host platform ${process.platform}/${process.arch}`); process.exit(1); }

// 3) update package.json pin
const pkg1 = readPkg();
pkg1.dependencies = pkg1.dependencies ?? {};
const wasExact = pkg1.dependencies.devlensio;
pkg1.dependencies.devlensio = `^${target}`;   // caret pin: stays in lockstep via bun.lock
writePkg(pkg1);
log(`updated package.json: devlensio ${wasExact} -> ^${target}`);

// 4) bun install  (fetch the new engine)
run("bun", ["install"], "bun install (fetch new devlensio)");

// 5) regenerate the embedded python module zip from the NEW engine
run("node", ["scripts/embed-python.mjs"], "regenerate embedded python zip");

// 6) regenerate the host platform's active.ts from the NEW engine binaries
run("node", ["scripts/embed-active.mjs", HOST_TARGET], `regenerate active.ts (${HOST_TARGET})`);

// 7) typecheck
run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], "tsc --noEmit");

// 8) optional CLI patch bump
if (bumpCli) {
  const v = pkg1.version;
  const [maj, min, pat] = v.split(".").map(Number);
  const nextPatch = `${maj}.${min}.${pat + 1}`;
  log(`--bump: also bumping CLI version ${v} -> ${nextPatch} via set-version.mjs`);
  run("node", ["scripts/set-version.mjs", nextPatch], `set CLI version ${nextPatch}`);
}

// 9) summary + next steps
log(`done. devlensio engine synced: ${currentPin} -> ^${target}`);
console.log(`
  Next steps to release the CLI (manual; see MAINTAINERS.md):
     node scripts/set-version.mjs <new-cli-version>     # bump the CLI version (unless --bump did it)
     bun run build:binaries                              # rebuild all 5 platform binaries (embeds new engine)
     bun run stage:binaries                              # stage binaries into npm/<platform>/
     git add -A && git commit -m "release: @devlensio/cli <version>"
     git tag v<version> && git push origin main v<version>   # CI publishes
`);
