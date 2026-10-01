import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { Command } from "commander";
import { withGlobalFlags } from "../options.js";
import { emit, info, success, warn, die, isJsonMode } from "../output.js";
import { CLI_VERSION } from "../version.js";

// `devlens update` — check the npm registry for a newer @devlensio/cli and
// (unless --check) install it globally with the detected package manager.
//
// Design: the whole flow lives in runUpdate(opts, deps) with injectable
// dependencies so every message path (offline, up-to-date, not-global,
// install failure, JSON shapes) is unit-testable. registerUpdateCommand is a
// thin wrapper wiring the real deps.

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

export type InstallKind = "source" | "global" | "local" | "unknown";

/** Running from a source checkout (bun src/cli/index.ts …)? */
export function isSourceRun(): boolean {
  const main = (process.argv[1] ?? "").replace(/\\/g, "/");
  return main.endsWith("src/cli/index.ts");
}

/**
 * Classify how the running CLI was installed:
 *   source — repo checkout (must never self-update; use git pull)
 *   global — under the npm global root (or a known global scheme)
 *   local  — under some project's node_modules (self-updating the GLOBAL
 *            copy would not change what is running; warn clearly)
 *   unknown — could not determine (do not block anything)
 */
export function classifyInstall(
  entryPath: string,
  globalRoot?: string,
  source?: boolean,
): InstallKind {
  const p = (entryPath ?? "").replace(/\\/g, "/");
  if (source || p.endsWith("src/cli/index.ts")) return "source";
  const root = (globalRoot ?? "").replace(/\\/g, "/").replace(/\/$/, "");
  if (root && p.startsWith(root + "/")) return "global";
  // other well-known global schemes (bun, yarn classic)
  if (/\/\.bun\/install\/global\//.test(p) || /\/yarn\/global\//.test(p)) return "global";
  if (p.includes("/node_modules/")) return "local";
  return "unknown";
}

/** npm root -g with a bounded timeout; undefined when npm is unavailable. */
export function globalRoot(timeoutMs = 5000): string | undefined {
  try {
    const r = spawnSync("npm", ["root", "-g"], { encoding: "utf8", timeout: timeoutMs });
    if (!r.error && r.status === 0) {
      const out = (r.stdout ?? "").trim().split("\n").pop();
      return out || undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export type Spawner = (cmd: string, args: string[], opts: Record<string, unknown>) => SpawnSyncReturns<string>;

/**
 * Registry version check with a BOUNCED timeout (default 15s) so an offline
 * or hung npm can never stall the CLI.
 */
export function checkLatest(timeoutMs = 15000, spawn: Spawner = spawnSync as Spawner): VersionCheck {
  let r: SpawnSyncReturns<string>;
  try {
    r = spawn("npm", ["view", UPDATE_PACKAGE, "version"], {
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    });
  } catch (err) {
    return { installed: CLI_VERSION, error: err instanceof Error ? err.message : String(err) };
  }
  if (r.error) {
    return { installed: CLI_VERSION, error: `could not run npm: ${r.error.message}` };
  }
  if (r.status !== 0) {
    const errText = (r.stderr ?? "").trim().split("\n").slice(-1)[0] || `npm exited ${r.status}`;
    return { installed: CLI_VERSION, error: `registry lookup failed: ${errText}` };
  }
  const latest = parseLatestVersion(r.stdout ?? "");
  if (!latest) return { installed: CLI_VERSION, error: "registry returned an unexpected response" };
  return { installed: CLI_VERSION, latest };
}

// ── The update flow (injectable, unit-tested) ────────────────────────────────

export interface UpdateIO {
  info(s: string): void;
  success(s: string): void;
  warn(s: string): void;
  emit(o: Record<string, unknown>): void;
  isJson(): boolean;
  /** Terminate with a message (default: die(msg, code)). */
  fail(msg: string, code: number): void;
}

export interface UpdateDeps {
  checkLatest: () => VersionCheck;
  pickPM: () => string | undefined;
  /** Runs the global install; returns the spawn result (status/error/stderr). */
  install(pm: string, json: boolean): { status: number | null; error?: Error | null; stderr?: string };
  kind(): InstallKind;
  version(): string;
  io: UpdateIO;
}

export interface UpdateOpts {
  check: boolean;
}

export function runUpdate(opts: UpdateOpts, deps: UpdateDeps): void {
  const { io } = deps;

  // Source checkout: never self-update a linked dev copy.
  if (deps.kind() === "source") {
    io.warn(
      "You are running DevLens from source — update with git pull + bun install instead of `devlens update`.",
    );
    if (opts.check) io.emit({ installed: deps.version(), sourceRun: true });
    return;
  }

  io.info(`Checking for the latest ${UPDATE_PACKAGE}…`);
  const check = deps.checkLatest();

  if (check.error) {
    // Offline / registry trouble: --check and --json still report cleanly.
    if (opts.check || io.isJson()) {
      io.emit({ installed: check.installed, latest: null, error: check.error });
    }
    io.fail(`Could not check for updates: ${check.error}`, 1);
    return;
  }

  const latest = check.latest!;
  const cmp = compareVersions(check.installed, latest);

  if (opts.check) {
    io.emit({ installed: check.installed, latest, upToDate: cmp >= 0 });
    if (cmp >= 0) io.success(`DevLens CLI v${check.installed} is up to date.`);
    else io.info(`DevLens CLI v${latest} is available (installed: v${check.installed}).`);
    return;
  }

  if (cmp >= 0) {
    io.success(`DevLens CLI v${check.installed} is already the latest version.`);
    io.emit({ installed: check.installed, latest, updated: false });
    return;
  }

  // Not-global guard: updating the global copy does not change a local run.
  if (deps.kind() === "local") {
    io.warn(
      `DevLens is running from a LOCAL install — \`update\` changes the global copy only.\n` +
        `  Update here with:  npm install ${UPDATE_PACKAGE}@latest\n` +
        `  Or install globally:  npm install -g ${UPDATE_PACKAGE}`,
    );
  }

  const pm = deps.pickPM();
  if (!pm) {
    io.fail(
      "No package manager found (npm/pnpm/yarn/bun). " +
        `Update manually: npm install -g ${UPDATE_PACKAGE}@latest`,
      1,
    );
    return;
  }

  io.info(`Updating ${check.installed} → ${latest} with ${pm}…`);
  const r = deps.install(pm, io.isJson());

  if (r.error || r.status !== 0) {
    const detail = r.error
      ? r.error.message
      : (r.stderr ?? "").trim().split("\n").slice(-1)[0] || `${pm} exited ${r.status}`;
    io.fail(
      `Update failed: ${detail}\n` +
        `  You can update manually: ${pm} ${installArgs(pm).join(" ")}`,
      1,
    );
    return;
  }

  io.success(
    `DevLens CLI updated to v${latest} — restart your shell if 'devlens' still reports v${check.installed}.`,
  );
  io.emit({ installed: check.installed, latest, updated: true, packageManager: pm });
}

function realIO(): UpdateIO {
  return {
    info,
    success,
    warn,
    emit,
    isJson: () => isJsonMode(),
    fail: (msg, code) => die(msg, code),
  };
}

function realDeps(): UpdateDeps {
  return {
    checkLatest: () => checkLatest(),
    pickPM: () => pickPackageManager(),
    install: (pm, json) =>
      spawnSync(pm, installArgs(pm), {
        stdio: json ? "pipe" : "inherit",
        encoding: "utf8",
        timeout: 10 * 60 * 1000, // bounded: a hung install cannot stall forever
      }),
    kind: () => classifyInstall(process.argv[1] ?? process.execPath, globalRoot(), isSourceRun()),
    version: () => CLI_VERSION,
    io: realIO(),
  };
}

// `devlens update` — check for / install the latest CLI.
export function registerUpdateCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("update")
      .description("Update the DevLens CLI to the latest published version")
      .option("--check", "only check for a newer version (no install)")
      .action(async (opts) => {
        runUpdate({ check: !!opts.check }, realDeps());
      })
  );
}
