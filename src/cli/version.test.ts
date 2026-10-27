// Release lockstep guard.
//
// 0.7.1 shipped with package.json at 0.7.1 while src/cli/version.ts still said
// 0.7.0, so the published binary reported the wrong `devlens --version` (and
// `devlens update --check` saw a phantom update forever). `set-version.mjs`
// now patches src/cli/version.ts and verifies the whole release surface; this
// test keeps that invariant visible in the normal `bun test` run too.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CLI_VERSION } from "./version.js";

const ROOT = path.join(import.meta.dir, "..", "..");
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "windows-x64"];

const readJson = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

describe("CLI release lockstep", () => {
  test("CLI_VERSION matches package.json", () => {
    expect(CLI_VERSION).toBe(readJson("package.json").version);
  });

  test("package.json, platform packages, optionalDependencies and server.json agree", () => {
    const main = readJson("package.json");
    expect(CLI_VERSION).toBe(main.version);

    for (const platform of PLATFORMS) {
      expect(readJson(`npm/${platform}/package.json`).version).toBe(main.version);
      expect(main.optionalDependencies[`@devlensio/cli-${platform}`]).toBe(main.version);
    }

    const server = readJson("server.json");
    expect(server.version).toBe(main.version);
    for (const pkg of server.packages ?? []) {
      expect(pkg.version).toBe(main.version);
    }
  });
});
