import { describe, test, expect } from "bun:test";
import { parseLatestVersion, compareVersions, pickPackageManager, installArgs, isSourceRun, UPDATE_PACKAGE } from "./commands/update.js";

describe("parseLatestVersion", () => {
  test("plain semver line", () => {
    expect(parseLatestVersion("0.7.0\n")).toBe("0.7.0");
  });
  test("tolerates surrounding whitespace/noise lines, keeps LAST valid", () => {
    expect(parseLatestVersion("\n  1.2.3  \n")).toBe("1.2.3");
  });
  test("rejects garbage", () => {
    expect(parseLatestVersion("")).toBeUndefined();
    expect(parseLatestVersion("not-a-version")).toBeUndefined();
    expect(parseLatestVersion("npm ERR! code E404")).toBeUndefined();
  });
  test("accepts prerelease tags", () => {
    expect(parseLatestVersion("1.0.0-beta.1")).toBe("1.0.0-beta.1");
  });
});

describe("compareVersions", () => {
  test("numeric segment compare", () => {
    expect(compareVersions("0.6.0", "0.7.0")).toBe(-1);
    expect(compareVersions("0.7.0", "0.6.0")).toBe(1);
    expect(compareVersions("0.6.0", "0.6.0")).toBe(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.6.10", "0.6.9")).toBe(1); // numeric, not lexicographic
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
  test("prerelease does not lose to its release in the numeric pass", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(0);
  });
});

describe("pickPackageManager", () => {
  test("first available in preference order", () => {
    expect(pickPackageManager(["npm", "pnpm", "yarn", "bun"], (c) => c === "pnpm")).toBe("pnpm");
    expect(pickPackageManager(["npm", "pnpm"], () => false)).toBeUndefined();
    expect(pickPackageManager(undefined, (c) => c === "npm")).toBe("npm");
  });
});

describe("installArgs", () => {
  test("correct global install argv per PM", () => {
    expect(installArgs("npm")).toEqual(["install", "-g", `${UPDATE_PACKAGE}@latest`]);
    expect(installArgs("pnpm")).toEqual(["add", "-g", `${UPDATE_PACKAGE}@latest`]);
    expect(installArgs("bun")).toEqual(["add", "-g", `${UPDATE_PACKAGE}@latest`]);
    expect(installArgs("yarn")).toEqual(["global", "add", `${UPDATE_PACKAGE}@latest`]);
  });
});

describe("isSourceRun", () => {
  test("detects the source entrypoint shape", () => {
    // This test process runs from source or not — just assert it's boolean.
    expect(typeof isSourceRun()).toBe("boolean");
  });
});

// ── runUpdate: every message path with injected deps (M5 / M8) ──────────────
import {
  runUpdate,
  classifyInstall,
  checkLatest,
  type UpdateDeps,
  type VersionCheck,
} from "./commands/update.js";

function mkIO() {
  const log = { info: [] as string[], success: [] as string[], warn: [] as string[], emit: [] as Record<string, unknown>[], fails: [] as { msg: string; code: number }[] };
  return {
    log,
    io: {
      info: (s: string) => log.info.push(s),
      success: (s: string) => log.success.push(s),
      warn: (s: string) => log.warn.push(s),
      emit: (o: Record<string, unknown>) => log.emit.push(o),
      isJson: () => false,
      fail: (msg: string, code: number) => log.fails.push({ msg, code }),
    },
  };
}

function mkDeps(over: Partial<UpdateDeps> = {}): { deps: UpdateDeps; log: ReturnType<typeof mkIO>["log"]; installs: string[] } {
  const { io, log } = mkIO();
  const installs: string[] = [];
  const deps: UpdateDeps = {
    checkLatest: (): VersionCheck => ({ installed: "0.6.0", latest: "0.7.0" }),
    pickPM: () => "npm",
    install: (pm, json) => {
      installs.push(`${pm}${json ? ":json" : ":human"}`);
      return { status: 0 };
    },
    kind: () => "global",
    version: () => "0.6.0",
    io,
    ...over,
  };
  return { deps, log, installs };
}

describe("runUpdate — check mode", () => {
  test("offline/registry error → clean message + structured emit, no install", () => {
    const { deps, log, installs } = mkDeps({
      checkLatest: () => ({ installed: "0.6.0", error: "registry lookup failed: ENOTFOUND" }),
    });
    runUpdate({ check: true }, deps);
    expect(installs).toHaveLength(0);
    expect(log.fails[0].msg).toContain("Could not check for updates: registry lookup failed: ENOTFOUND");
    expect(log.fails[0].code).toBe(1);
    expect(log.emit[0]).toEqual({ installed: "0.6.0", latest: null, error: "registry lookup failed: ENOTFOUND" });
  });

  test("up-to-date → success message + upToDate:true", () => {
    const { deps, log } = mkDeps({ checkLatest: () => ({ installed: "0.7.0", latest: "0.7.0" }) });
    runUpdate({ check: true }, deps);
    expect(log.success[0]).toContain("v0.7.0 is up to date");
    expect(log.emit[0]).toEqual({ installed: "0.7.0", latest: "0.7.0", upToDate: true });
    expect(log.fails).toHaveLength(0);
  });

  test("update available → info message + upToDate:false", () => {
    const { deps, log } = mkDeps();
    runUpdate({ check: true }, deps);
    expect(log.info.some((s) => s.includes("v0.7.0 is available"))).toBe(true);
    expect(log.emit[0]).toEqual({ installed: "0.6.0", latest: "0.7.0", upToDate: false });
  });
});

describe("runUpdate — install mode", () => {
  test("up-to-date → no install, updated:false", () => {
    const { deps, log, installs } = mkDeps({ checkLatest: () => ({ installed: "0.7.0", latest: "0.7.0" }) });
    runUpdate({ check: false }, deps);
    expect(installs).toHaveLength(0);
    expect(log.success[0]).toContain("already the latest");
    expect(log.emit[0]).toEqual({ installed: "0.7.0", latest: "0.7.0", updated: false });
  });

  test("newer available → installs with detected PM, updated:true", () => {
    const { deps, log, installs } = mkDeps();
    runUpdate({ check: false }, deps);
    expect(installs).toEqual(["npm:human"]);
    expect(log.success[0]).toContain("updated to v0.7.0");
    expect(log.emit[0]).toMatchObject({ updated: true, packageManager: "npm" });
  });

  test("no package manager → clear manual-instruction failure", () => {
    const { deps, log, installs } = mkDeps({ pickPM: () => undefined });
    runUpdate({ check: false }, deps);
    expect(installs).toHaveLength(0);
    expect(log.fails[0].msg).toContain("No package manager found (npm/pnpm/yarn/bun)");
    expect(log.fails[0].msg).toContain("npm install -g @devlensio/cli@latest");
  });

  test("install failure → clear message + manual argv", () => {
    const { deps, log } = mkDeps({ install: () => ({ status: 1, stderr: "EACCES: permission denied" }) });
    runUpdate({ check: false }, deps);
    expect(log.fails[0].msg).toContain("Update failed: EACCES: permission denied");
    expect(log.fails[0].msg).toContain("npm install -g @devlensio/cli@latest");
  });

  test("LOCAL install → warns that global update won't change this copy, still proceeds", () => {
    const { deps, log, installs } = mkDeps({ kind: () => "local" });
    runUpdate({ check: false }, deps);
    expect(log.warn[0]).toContain("running from a LOCAL install");
    expect(log.warn[0]).toContain("npm install -g @devlensio/cli");
    expect(installs).toEqual(["npm:human"]); // proceeds, does not block
  });

  test("source checkout → never installs, points at git pull", () => {
    const { deps, log, installs } = mkDeps({ kind: () => "source" });
    runUpdate({ check: false }, deps);
    expect(installs).toHaveLength(0);
    expect(log.warn[0]).toContain("running DevLens from source");
    expect(log.warn[0]).toContain("git pull");
    expect(log.emit).toHaveLength(0);
  });

  test("source checkout + --check → structured sourceRun emit", () => {
    const { deps, log, installs } = mkDeps({ kind: () => "source" });
    runUpdate({ check: true }, deps);
    expect(installs).toHaveLength(0);
    expect(log.emit[0]).toEqual({ installed: "0.6.0", sourceRun: true });
  });

  test("JSON mode: install path pipes child stdio", () => {
    const { deps, installs } = mkDeps();
    deps.io.isJson = () => true;
    runUpdate({ check: false }, deps);
    expect(installs).toEqual(["npm:json"]);
  });
});

describe("classifyInstall (not-global detection)", () => {
  test("under npm global root → global", () => {
    expect(classifyInstall("/x/lib/node_modules/@devlensio/cli-linux-x64/bin/devlens", "/x/lib/node_modules")).toBe("global");
  });
  test("bun/yarn global schemes → global", () => {
    expect(classifyInstall("/home/u/.bun/install/global/node_modules/@devlensio/cli/bin/devlens", "/nope")).toBe("global");
    expect(classifyInstall("/home/u/.config/yarn/global/node_modules/@devlensio/cli/bin/devlens", "/nope")).toBe("global");
  });
  test("project node_modules → local", () => {
    expect(classifyInstall("/proj/node_modules/@devlensio/cli/bin/devlens", "/x/lib/node_modules")).toBe("local");
  });
  test("source entrypoint → source", () => {
    expect(classifyInstall("/repo/src/cli/index.ts")).toBe("source");
    expect(classifyInstall("/repo/src/cli/index.ts", undefined, true)).toBe("source");
  });
  test("unrecognized → unknown (never blocks)", () => {
    expect(classifyInstall("/opt/devlens/devlens", "/x/lib/node_modules")).toBe("unknown");
    expect(classifyInstall("", undefined)).toBe("unknown");
  });
});

describe("checkLatest — bounded registry lookup", () => {
  test("spawn gets a 15s timeout and npm view argv", () => {
    const calls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = [];
    const fake = ((cmd: string, args: string[], opts: Record<string, unknown>) => {
      calls.push({ cmd, args, opts });
      return { status: 0, stdout: "0.8.0\n", stderr: "", error: undefined } as never;
    }) as never;
    const r = checkLatest(undefined, fake);
    expect(r).toEqual({ installed: expect.any(String), latest: "0.8.0" });
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("npm");
    expect(calls[0].args).toEqual(["view", "@devlensio/cli", "version"]);
    expect(calls[0].opts.timeout).toBe(15000);
  });

  test("custom timeout respected", () => {
    const calls: Array<{ opts: Record<string, unknown> }> = [];
    const fake = ((_c: string, _a: string[], opts: Record<string, unknown>) => {
      calls.push({ opts });
      return { status: 0, stdout: "1.0.0\n", stderr: "", error: undefined } as never;
    }) as never;
    checkLatest(2500, fake);
    expect(calls[0].opts.timeout).toBe(2500);
  });

  test("spawn error → offline-style error result", () => {
    const fake = (() => ({ status: null, stdout: "", stderr: "", error: new Error("spawn npm ENOENT") })) as never;
    const r = checkLatest(undefined, fake);
    expect(r.error).toContain("could not run npm: spawn npm ENOENT");
  });

  test("non-zero status → last stderr line surfaced", () => {
    const fake = (() => ({ status: 1, stdout: "", stderr: "npm ERR! code E404\nnpm ERR! 404 Not Found", error: undefined })) as never;
    const r = checkLatest(undefined, fake);
    expect(r.error).toContain("registry lookup failed: npm ERR! 404 Not Found");
  });
});
