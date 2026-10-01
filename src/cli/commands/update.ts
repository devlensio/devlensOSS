import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { Command } from "commander";
import { withGlobalFlags } from "../options.js";
import { emit, info, success, warn, die, isJsonMode } from "../output.js";
import { CLI_VERSION } from "../version.js";

// `devlens update` — check the npm registry for a newer @devlensio/cli and
// (unless --check) install it globally with the detected package manager.
//
// Pure helpers are exported for unit tests (version parsing/compare, package
// manager selection).

export const UPDATE_PACKAGE = "@devlensio/cli";

export interface VersionCheck {
  installed: string;
  latest?: string;
  error?: string;
}

/** Parse `npm view @devlensio/cli version` stdout → a bare semver or undefined. */
export function parseLatestVersion(stdout: string): string | undefined {
  const line = (stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop(); // npm prints one version; tolerate trailing noise
  if (!line) return undefined;
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(line) ? line : undefined;
}

/** -1 older, 0 equal, 1 newer (numeric dot-segment compare; pre-release ignored). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** First available package manager from the preference list. */
export function pickPackageManager(
  candidates: string[] = ["npm", "pnpm", "yarn", "bun"],
  probe: (cmd: string) => boolean = defaultProbe,
): string | undefined {
  return candidates.find((c) => probe(c));
}

function defaultProbe(cmd: string): boolean {
  try {
    const r = spawnSync(cmd, ["--version"], { stdio: "ignore", timeout: 5000 });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

/** The install argv for a given package manager. */
export function installArgs(pm: string): string[] {
  switch (pm) {
    case "pnpm":
      return ["add", "-g", `${UPDATE_PACKAGE}@latest`];
    case "yarn":
      return ["global", "add", `${UPDATE_PACKAGE}@latest`];
    case "bun":
      return ["add", "-g", `${UPDATE_PACKAGE}@latest`];
    default:
      return ["install", "-g", `${UPDATE_PACKAGE}@latest`]; // npm
  }
}

/** Running from a source checkout (bun src/cli/index.ts …)? */
export function isSourceRun(): boolean {
  const main = (process.argv[1] ?? "").replace(/\\/g, "/");
  return main.endsWith("src/cli/index.ts");
}

export function checkLatest(timeoutMs = 15000): VersionCheck {
  let r: SpawnSyncReturns<string>;
  try {
    r = spawnSync("npm", ["view", UPDATE_PACKAGE, "version"], {
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    });
  } catch (err) {
    return { installed: currentVersion(), error: err instanceof Error ? err.message : String(err) };
  }
  if (r.error) {
    return { installed: currentVersion(), error: `could not run npm: ${r.error.message}` };
  }
  if (r.status !== 0) {
    const errText = (r.stderr ?? "").trim().split("\n").slice(-1)[0] || `npm exited ${r.status}`;
    return { installed: currentVersion(), error: `registry lookup failed: ${errText}` };
  }
  const latest = parseLatestVersion(r.stdout ?? "");
  if (!latest) return { installed: currentVersion(), error: "registry returned an unexpected response" };
  return { installed: currentVersion(), latest };
}

function currentVersion(): string {
  return CLI_VERSION;
}

// `devlens update` — check for / install the latest CLI.
export function registerUpdateCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("update")
      .description("Update the DevLens CLI to the latest published version")
      .option("--check", "only check for a newer version (no install)")
      .action(async (opts) => {
        if (isSourceRun()) {
          warn(
            "You are running DevLens from source — update with git pull + bun install instead of `devlens update`.",
          );
          if (opts.check) {
            emit({ installed: currentVersion(), sourceRun: true });
          }
          return;
        }

        info(`Checking for the latest ${UPDATE_PACKAGE}…`);
        const check = checkLatest();

        if (check.error) {
          // Offline / registry trouble: --check still reports cleanly.
          if (opts.check || isJsonMode()) {
            emit({ installed: check.installed, latest: null, error: check.error });
          }
          die(`Could not check for updates: ${check.error}`, 1);
        }

        const latest = check.latest!;
        const cmp = compareVersions(check.installed, latest);

        if (opts.check) {
          emit({
            installed: check.installed,
            latest,
            upToDate: cmp >= 0,
          });
          if (cmp >= 0) success(`DevLens CLI v${check.installed} is up to date.`);
          else info(`DevLens CLI v${latest} is available (installed: v${check.installed}).`);
          return;
        }

        if (cmp >= 0) {
          success(`DevLens CLI v${check.installed} is already the latest version.`);
          emit({ installed: check.installed, latest, updated: false });
          return;
        }

        const pm = pickPackageManager();
        if (!pm) {
          die(
            "No package manager found (npm/pnpm/yarn/bun). " +
              `Update manually: npm install -g ${UPDATE_PACKAGE}@latest`,
            1,
          );
        }

        info(`Updating ${check.installed} → ${latest} with ${pm}…`);
        const r = spawnSync(pm, installArgs(pm), {
          stdio: isJsonMode() ? "pipe" : "inherit",
          encoding: "utf8",
          timeout: 10 * 60 * 1000,
        });

        if (r.error || r.status !== 0) {
          const detail = r.error
            ? r.error.message
            : (r.stderr ?? "").trim().split("\n").slice(-1)[0] || `${pm} exited ${r.status}`;
          die(
            `Update failed: ${detail}\n` +
              `  You can update manually: ${installArgs(pm).join(" ")}`,
            1,
          );
        }

        success(`DevLens CLI updated to v${latest} — restart your shell if 'devlens' still reports v${check.installed}.`);
        emit({ installed: check.installed, latest, updated: true, packageManager: pm });
      })
  );
}
