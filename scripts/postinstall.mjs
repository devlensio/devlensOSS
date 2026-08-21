// Verbose post-install reporter for @devlensio/cli.
//
// Runs automatically after `npm install @devlensio/cli` (global or local). It
// does NOT download or set anything up — the native binary for your platform is
// already installed by npm as an `optionalDependencies` sub-package
// (@devlensio/cli-<os>-<arch>, auto-selected via the os/cpu filter). This script
// just CONFIRMS that happened and tells you what's going on, so a failed
// optional-dependency install (the most common install problem) is obvious
// immediately instead of surfacing later as "devlens: the platform binary is
// not installed" at first run.
//
// Verbose on interactive installs, one line on CI. It NEVER fails the install:
// every step is guarded, and it always exits 0.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const PLATFORM_PACKAGES = {
  "darwin-arm64": "@devlensio/cli-darwin-arm64",
  "darwin-x64": "@devlensio/cli-darwin-x64",
  "linux-x64": "@devlensio/cli-linux-x64",
  "linux-arm64": "@devlensio/cli-linux-arm64",
  "win32-x64": "@devlensio/cli-windows-x64",
};

const isCI = !!(
  process.env.CI ||
  process.env.CONTINUOUS_INTEGRATION ||
  process.env.GITHUB_ACTIONS ||
  process.env.BUILD_NUMBER
);

const BANNER = `
  ╭───────────────────────────────────────────────────────╮
  │  DevLens CLI — codebase intelligence.                 │
  │  https://github.com/devlensio/devlensOSS              │
  ╰───────────────────────────────────────────────────────╯`;

function dim(s) {
  console.log("   \x1b[2m%s\x1b[0m", s);
}
function green(s) {
  console.log("   \x1b[32m✓\x1b[0m %s", s);
}
function red(s) {
  console.log("   \x1b[31m✖\x1b[0m %s", s);
}
function yellow(s) {
  console.log("   \x1b[33m!\x1b[0m %s", s);
}
function line(s) {
  if (s === undefined) console.log("");
  else console.log("  ", s);
}

function readVersion() {
  try {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return JSON.parse(fs.readFileSync(p, "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

function resolveNativeBinary(pkgName) {
  const req = createRequire(import.meta.url);
  const binName = process.platform === "win32" ? "devlens.exe" : "devlens";
  try {
    const resolved = req.resolve(`${pkgName}/${binName}`);
    return resolved;
  } catch {
    return null;
  }
}

function main() {
  const key = `${process.platform}-${process.arch}`;
  const pkgName = PLATFORM_PACKAGES[key];
  const version = readVersion();

  // CI: one parseable line, never noisy.
  if (isCI) {
    if (!pkgName) {
      console.log(`devlens: unsupported platform ${key} (CI mode, non-fatal)`);
      return 0;
    }
    console.log(`devlens ${version} installed for ${key}; platform package ${pkgName}.`);
    return 0;
  }

  console.log(BANNER);
  line(`version ${version}`);
  line(`detected platform: ${process.platform} / ${process.arch}  →  ${key}`);

  if (!pkgName) {
    red(`unsupported platform "${key}".`);
    line(`  supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`);
    line(`  you can still use the GitHub releases binaries if yours isn't listed.`);
    return 0;
  }

  dim(`looking for native binary in optional dependency ${pkgName} ...`);
  const binPath = resolveNativeBinary(pkgName);

  if (!binPath) {
    red(`native binary not found in ${pkgName}.`);
    line(`  the optional platform dependency was skipped during install.`);
    line(`  this is non-fatal — to fix, re-install forcing optional deps:`);
    line(`     npm install -g @devlensio/cli --force`);
    line(`  or download a binary from the GitHub releases page.`);
    yellow(`  until then, the \`devlens\` command will print this same notice.`);
    return 0;
  }

  if (!fs.existsSync(binPath)) {
    red(`native binary entry resolves but the file is missing on disk.`);
    dim(`  tried: ${binPath}`);
    yellow(`  re-run: npm install -g @devlensio/cli --force`);
    return 0;
  }

  green(`native binary ready:`);
  dim(`  ${binPath}`);

  line();
  green(`DevLens CLI is ready.`);
  line(`next steps:`);
  dim(`  devlens doctor            # check environment + extractor runtimes`);
  dim(`  devlens analyze <repo>    # build a codebase graph (TS/JS/Py/Go/Rust/Java)`);
  dim(`  devlens --help            # all commands`);
  line();
  dim(`first run materializes go/rust/java extractors to ~/.devlens (a few seconds).`);
  dim(`set DEVLENS_VERBOSE=1 for verbose bootstrapping.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  // Never fail the install over a reporting script.
  console.log(`  devlens: postinstall reporter skipped (${e?.message ?? e})`);
}
