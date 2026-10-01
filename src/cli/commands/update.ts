// `devlens update` — check the npm registry for a newer @devlensio/cli and
// (unless --check) install it globally with the detected package manager.
//
// Architecture: the whole flow lives in runUpdate(opts, deps) with fully
// injectable dependencies (registry check, package-manager pick, install
// spawn, install-kind classification, IO) so every message path is unit
// tested; registerUpdateCommand is a thin wrapper wiring the real deps.
//
// Behavior contract:
//   - registry lookup = `npm view @devlensio/cli version` with a BOUNDED 15s
//     timeout; the install spawn is bounded at 10min — neither can hang the
//     CLI. Offline/registry failures print one actionable line (--check and
//     --json still emit {installed, latest:null, error} first).
//   - package manager: first available of npm → pnpm → yarn → bun, each with
//     its correct global-install argv.
//   - classifyInstall(): source (repo checkout — never self-update; points at
//     git pull) | global (npm root -g, bun/yarn global schemes) | local
//     (project node_modules — warns that a global update will not change the
//     running copy) | unknown (never blocks).
//   - --check is a pure dry run: {installed, latest, upToDate} + one status
//     line, no install. Up-to-date installs emit {updated:false} without
//     spawning anything. --json keeps stdout machine-parseable.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { Command } from "commander";
import { withGlobalFlags } from "../options.js";
import { emit, info, success, warn, die, isJsonMode } from "../output.js";
import { CLI_VERSION } from "../version.js";

export const UPDATE_PACKAGE = "@devlensio/cli";

export interface VersionCheck {
  installed: string;
  latest?: string;
  error?: string;
}

export function parseLatestVersion(stdout: string): string | undefined {
  const line = (stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!line) return undefined;
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(line) ? line : undefined;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

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

export function installArgs(pm: string): string[] {
  switch (pm) {
    case "pnpm":
      return ["add", "-g", `${UPDATE_PACKAGE}@latest`];
    case "yarn":
      return ["global", "add", `${UPDATE_PACKAGE}@latest`];
    case "bun":
      return ["add", "-g", `${UPDATE_PACKAGE}@latest`];
    default:
      return ["install", "-g", `${UPDATE_PACKAGE}@latest`];
  }
}

export type InstallKind = "source" | "global" | "local" | "unknown";

export function isSourceRun(): boolean {
  const main = (process.argv[1] ?? "").replace(/\\/g, "/");
  return main.endsWith("src/cli/index.ts");
}

export function classifyInstall(
  entryPath: string,
  globalRoot?: string,
  source?: boolean,
): InstallKind {
  const p = (entryPath ?? "").replace(/\\/g, "/");
  if (source || p.endsWith("src/cli/index.ts")) return "source";
  const root = (globalRoot ?? "").replace(/\\/g, "/").replace(/\/$/, "");
  if (root && p.startsWith(root + "/")) return "global";
  if (/\/\.bun\/install\/global\//.test(p) || /\/yarn\/global\//.test(p)) return "global";
  if (p.includes("/node_modules/")) return "local";
  return "unknown";
}

export function globalRoot(timeoutMs = 5000): string | undefined {
  try {
    const r = spawnSync("npm", ["root", "-g"], { encoding: "utf8", timeout: timeoutMs });
    if (!r.error && r.status === 0) {
      const out = (r.stdout ?? "").trim().split("\n").pop();
      return out || undefined;
    }
  } catch {}
  return undefined;
}

export type Spawner = (cmd: string, args: string[], opts: Record<string, unknown>) => SpawnSyncReturns<string>;

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

export interface UpdateIO {
  info(s: string): void;
  success(s: string): void;
  warn(s: string): void;
  emit(o: Record<string, unknown>): void;
  isJson(): boolean;
  fail(msg: string, code: number): void;
}

export interface UpdateDeps {
  checkLatest: () => VersionCheck;
  pickPM: () => string | undefined;
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
        timeout: 10 * 60 * 1000,
      }),
    kind: () => classifyInstall(process.argv[1] ?? process.execPath, globalRoot(), isSourceRun()),
    version: () => CLI_VERSION,
    io: realIO(),
  };
}

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
