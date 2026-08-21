#!/usr/bin/env bun
/**
 * `bun start` — starts the DevLens backend + live web UI on a single port.
 *
 * Builds the frontend ONLY when a production build isn't already present, so
 * repeated `bun start` calls are fast. Pass `--rebuild` to force a fresh build.
 *
 * Usage:
 *   bun run start                # build if needed, then serve on :3000
 *   bun run start -- --rebuild   # force a frontend rebuild first
 *   bun run start -- --port 4100 # build if needed, serve on :4100
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const buildId = join(repoRoot, "frontend", ".next", "BUILD_ID");

const args = process.argv.slice(2);
const rebuild = args.includes("--rebuild");
const serverArgs = ["src/server/index.ts", "--frontend-dir", "./frontend"];
for (const a of args) if (a !== "--rebuild") serverArgs.push(a);

if (rebuild || !existsSync(buildId)) {
  console.log(rebuild
    ? "♻️  Forcing a frontend rebuild (--rebuild)..."
    : "⏳ No production web UI build found — building the frontend...");
  const build = spawnSync("bun", ["run", "build:ui"], { cwd: repoRoot, stdio: "inherit" });
  if (build.status !== 0) {
    console.error(`❌ Frontend build failed (exit ${build.status}).`);
    process.exit(build.status ?? 1);
  }
} else {
  console.log("✅ Web UI build already present — skipping rebuild.");
  console.log("   (Pass `bun run start -- --rebuild` to force a fresh build.)");
}

const srv = spawnSync("bun", serverArgs, { cwd: repoRoot, stdio: "inherit" });
process.exit(srv.status ?? 0);
