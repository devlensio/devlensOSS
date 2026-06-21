#!/usr/bin/env node
"use strict";

// Launcher for the `devlens` CLI. The real program is a bun-compiled native
// binary shipped in a per-platform optional dependency (@devlensio/cli-<os>-<arch>).
// npm installs only the binary matching the user's os/cpu; this shim finds it
// and execs it, passing through all args. Runs on Node (present via npm); the
// actual work runs in the native binary, so the user never needs bun.

const { spawnSync } = require("node:child_process");

const PLATFORM_PACKAGES = {
  "darwin-arm64": "@devlensio/cli-darwin-arm64",
  "darwin-x64": "@devlensio/cli-darwin-x64",
  "linux-x64": "@devlensio/cli-linux-x64",
  "linux-arm64": "@devlensio/cli-linux-arm64",
  "win32-x64": "@devlensio/cli-windows-x64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORM_PACKAGES[key];

if (!pkg) {
  console.error(
    `devlens: unsupported platform "${key}". ` +
      `Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}.`
  );
  process.exit(1);
}

const binName = process.platform === "win32" ? "devlens.exe" : "devlens";

let binPath;
try {
  binPath = require.resolve(`${pkg}/${binName}`);
} catch {
  console.error(
    `devlens: the platform binary "${pkg}" is not installed.\n` +
      `Its optional dependency was likely skipped during install. Try:\n` +
      `  npm install -g @devlensio/cli --force\n` +
      `or download a binary from the GitHub releases page.`
  );
  process.exit(1);
}

const result = spawnSync(binPath, process.argv.slice(2), { stdio: "inherit" });

if (result.error) {
  console.error(`devlens: failed to launch binary: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 0);
