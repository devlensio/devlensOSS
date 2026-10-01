// End-to-end CLI tests: spawn the real CLI (source run) against isolated
// HOMEs and fixture repos. These are the regression net for GitHub issue #10
// (config validation must never block structure-only analysis or config
// display) and for clean error presentation (issues 1 + 2).
import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.join(import.meta.dir, "index.ts"); // src/cli/index.ts

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], home: string, timeout = 120_000): RunResult {
  const r = spawnSync("bun", [CLI, ...args], {
    env: {
      ...process.env,
      HOME: home,
      // strip any ambient LLM config so fixtures are hermetic
      DEVLENS_LLM_KEY: undefined,
      DEVLENS_LLM_MODEL: undefined,
      DEVLENS_LLM_PROVIDER: undefined,
      DEVLENS_LLM_PROVIDER_NAME: undefined,
      DEVLENS_LLM_BASE_URL: undefined,
    } as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout,
  });
  if (r.error) throw r.error;
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function mkHome(name: string, files: Record<string, string>): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `devlens-e2e-${name}-`));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(home, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return home;
}

function mkRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "devlens-e2e-repo-"));
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0", devDependencies: { typescript: "^5.0.0" } }));
  fs.writeFileSync(path.join(repo, "app.ts"), `export function greet(n: string): string { return "hi " + n; }\nexport class Foo { bar() { return 1; } }\n`);
  return repo;
}

// HOMEs + repo are process-wide fixtures (module scope → created before tests).
const homeIncomplete = mkHome("incomplete", {
  ".devlens/config.json": JSON.stringify({ summarization: { provider: "openai", providerName: "deepseek", model: "deepseek-chat" } }, null, 2),
});
const homeFresh = mkHome("fresh", {}); // no .devlens at all
const homeBroken = mkHome("broken", {
  ".devlens/config.json": "{ this is NOT valid json ]",
});
const homeValid = mkHome("valid", {
  ".devlens/config.json": JSON.stringify({
    summarization: {
      active: "openai:deepseek",
      providers: {
        "openai:deepseek": { provider: "openai", providerName: "deepseek", model: "deepseek-chat", apiKey: "sk-test-123", baseUrl: "https://api.deepseek.com", batchSize: 25 },
      },
    },
  }, null, 2),
});
const repo = mkRepo();

describe("analyze never needs an LLM key (issue #10b)", () => {
  test("incomplete config, no --summarize → completes", () => {
    const r = runCli(["analyze", repo, "--json"], homeIncomplete);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.status).toBe("completed");
    expect(out.graphId).toBeTruthy();
  }, 120_000);

  test("FRESH install (no config file at all) → completes", () => {
    const r = runCli(["analyze", repo, "--json"], homeFresh);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).status).toBe("completed");
  }, 120_000);

  test("broken config JSON → analysis still completes (config not even read)", () => {
    const r = runCli(["analyze", repo, "--json"], homeBroken);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).status).toBe("completed");
  }, 120_000);

  test("--json stdout is pure JSON (progress stays on stderr)", () => {
    const r = runCli(["analyze", repo, "--json"], homeIncomplete);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  }, 120_000);
});

describe("--summarize fails FAST with an actionable message (no stack)", () => {
  test("missing key → clean error, exit 1, no '    at ' frames", () => {
    const r = runCli(["analyze", repo, "--summarize"], homeIncomplete, 60_000);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("summarization.apiKey is required");
    expect(r.stderr).toContain("devlens init");
    expect(r.stderr).not.toContain("    at ");
    expect(r.stderr).not.toContain("$bunfs");
  }, 70_000);

  test("broken config JSON → clean 'invalid JSON' error", () => {
    const r = runCli(["analyze", repo, "--summarize"], homeBroken, 60_000);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid JSON");
    expect(r.stderr).not.toContain("    at ");
  }, 70_000);
});

describe("config display works on a broken/incomplete config (issues 3 + 5)", () => {
  test("incomplete config → exit 0 and shows the summarization block", () => {
    const r = runCli(["config"], homeIncomplete, 30_000);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Summarization");
    expect(r.stdout).toContain("deepseek");
    expect(r.stderr).not.toContain("    at ");
  }, 40_000);

  test("broken config JSON → friendly message, no stack", () => {
    const r = runCli(["config"], homeBroken, 30_000);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid JSON");
    expect(r.stderr).not.toContain("    at ");
  }, 40_000);

  test("--json keeps the SafeConfig shape (embedding field for API compat)", () => {
    const r = runCli(["config", "--json"], homeValid, 30_000);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.summarization.providerName).toBe("deepseek");
    expect(out.embedding).toBeDefined(); // webUI/cloud API shape unchanged
  }, 40_000);

  test("init reaches the provider prompt on an incomplete config (issue #10a)", () => {
    const r = runCli(["init"], homeIncomplete, 30_000); // stdin closed → prompt EOF
    expect(r.status).toBe(0);
    const all = r.stdout + r.stderr;
    expect(all).toContain("Choose a summarization provider"); // prompt rendered
    expect(all).not.toContain("apiKey is required"); // no config-error wall
    expect(all).not.toContain("    at ");
  }, 40_000);
});

describe("devlens update", () => {
  test("--check from a source run reports sourceRun cleanly", () => {
    const r = runCli(["update", "--check", "--json"], homeFresh, 60_000);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.sourceRun).toBe(true);
    expect(r.stderr).toContain("running DevLens from source");
  }, 70_000);
});

describe("doctor survives an incomplete config", () => {
  test("reports provider + key status without throwing", () => {
    const r = runCli(["doctor", "--json"], homeIncomplete, 60_000);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.checks.provider.ok).toBe(true);
    expect(out.checks.apiKey.ok).toBe(false); // honest: no key yet
    expect(out.checks.apiKey.detail).toContain("no API key");
  }, 70_000);
});
