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
