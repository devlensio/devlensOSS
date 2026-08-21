// Builds the per-target compiled binaries, regenerating src/cli/embedded/active.ts
// for each target immediately before its `bun build`. This ensures each binary
// embeds ONLY its own platform's go+rust extractor binaries (+ the portable
// java jar) instead of all five platforms' worth (~37MB of dead bytes saved
// per binary).
//
// Usage:  bun run build:binaries      (builds all 5 targets)
//         node scripts/build-binaries.mjs linux-x64   (build one target only)
//
// Verbose by design: prints exactly what it's doing at each step so a release
// run is easy to follow and debug.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// bun build --target  ->  outfile name + dist staging dir
const ALL_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "windows-x64",
];

const requested = process.argv.slice(2);
const targets = requested.length ? requested : ALL_TARGETS;

function log(...a) {
  console.log("\n  [build]", ...a);
}
function fail(...a) {
  console.error("  [build] ✖", ...a);
}

let ok = 0;
let failed = 0;

for (const target of targets) {
  log(`▶ target ${target}`);

  // 1a) Regenerate the python module zip + wrapper (zip is platform-independent,
  //     so it's part of every target's active set).
  log(`  • regenerating src/cli/embedded/python/*`);
  const genPy = spawnSync("node", ["scripts/embed-python.mjs"], { cwd: root, stdio: "inherit" });
  if (genPy.status !== 0) {
    fail(`embed-python failed (exit ${genPy.status})`);
    failed++;
    continue;
  }

  // 1b) Regenerate the single-platform embedded/active.ts for this target.
  log(`  • regenerating src/cli/embedded/active.ts for ${target}`);
  const gen = spawnSync("node", ["scripts/embed-active.mjs", target], {
    cwd: root,
    stdio: "inherit",
  });
  if (gen.status !== 0) {
    fail(`embed-active failed for ${target} (exit ${gen.status})`);
    failed++;
    continue;
  }

  // 2) Typecheck before compiling.
  const tsc = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (tsc.status !== 0) {
    fail(`tsc failed for ${target} (exit ${tsc.status})`);
    failed++;
    continue;
  }

  // 3) Compile.
  const outName = `devlens-${target}${target.startsWith("windows") ? ".exe" : ""}`;
  const outFile = path.join("dist", "bin", outName);
  log(`  • bun build --compile --target=bun-${target} -> ${outFile}`);
  const build = spawnSync(
    "bun",
    ["build", "src/cli/index.ts", "--compile", `--target=bun-${target}`, "--outfile", outFile],
    { cwd: root, stdio: "inherit" },
  );
  if (build.status !== 0) {
    fail(`bun build failed for ${target} (exit ${build.status})`);
    failed++;
    continue;
  }

  const size = fs.statSync(path.join(root, outFile)).size;
  const mb = (size / 1024 / 1024).toFixed(1);
  log(`✔ ${target} -> ${outFile} (${mb} MB)`);
  ok++;
}

console.log(`\n  [build] done: ${ok} built, ${failed} failed.`);
console.log(`  [build] regenerate host active.ts (linux-amd64) so source runs still work...`);
const restore = spawnSync("node", ["scripts/embed-active.mjs", "linux-amd64"], {
  cwd: root,
  stdio: "inherit",
});
if (restore.status !== 0) {
  fail("could not restore host active.ts — run: node scripts/embed-active.mjs linux-amd64");
}

process.exit(failed === 0 ? 0 : 1);
