import fs from "fs";
import path from "path";
import os from "os";
import { analyzeFingerprint } from "./index";

function createFakeRepo(deps: Record<string, string>, extraFiles: string[] = []): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devlens-test-"));
  const packageJson = {
    name: "test-project",
    version: "1.0.0",
    dependencies: deps,
  };
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify(packageJson)
  );
  // Create any extra files/folders the test needs
  for (const file of extraFiles) {
    const fullPath = path.join(tmpDir, file);
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return tmpDir;
}

function deleteFakeRepo(repoPath: string): void {
  fs.rmSync(repoPath, { recursive: true, force: true });
}

describe("analyzeFingerprint", () => {

  // ─── Framework Detection ───────────────────────────────────────────────────

  it("should detect a Next.js project", () => {
    const repoPath = createFakeRepo({ next: "14.0.0", react: "18.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.framework).toBe("nextjs");
    deleteFakeRepo(repoPath);
  });

  it("should detect a plain React project", () => {
    const repoPath = createFakeRepo({ react: "18.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.framework).toBe("react");
    deleteFakeRepo(repoPath);
  });

  it("should return unknown for unrecognized project", () => {
    const repoPath = createFakeRepo({ lodash: "4.17.21" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.framework).toBe("unknown");
    deleteFakeRepo(repoPath);
  });

  // ─── Router Detection ──────────────────────────────────────────────────────

  it("should detect Next.js app router", () => {
    const repoPath = createFakeRepo({ next: "14.0.0" }, ["src/app"]);
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.router).toBe("app");
    deleteFakeRepo(repoPath);
  });

  it("should detect Next.js pages router", () => {
    const repoPath = createFakeRepo({ next: "14.0.0" }, ["src/pages"]);
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.router).toBe("pages");
    deleteFakeRepo(repoPath);
  });

  it("should detect React Router in plain React project", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", "react-router-dom": "6.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.router).toBe("react-router");
    deleteFakeRepo(repoPath);
  });

  it("should detect both routers during migration", () => {
  const repoPath = createFakeRepo({ next: "14.0.0" }, ["src/app", "src/pages"]);
  const fingerprint = analyzeFingerprint(repoPath);
  expect(fingerprint.router).toBe("app+pages");
  deleteFakeRepo(repoPath);
  });

  // ─── State Management Detection ───────────────────────────────────────────

  it("should detect zustand", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", zustand: "4.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.stateManagement).toContain("zustand");
    deleteFakeRepo(repoPath);
  });

  it("should detect redux", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", "@reduxjs/toolkit": "2.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.stateManagement).toContain("redux");
    deleteFakeRepo(repoPath);
  });

  it("should fall back to context-only when no state library found", () => {
    const repoPath = createFakeRepo({ react: "18.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.stateManagement).toContain("context-only");
    deleteFakeRepo(repoPath);
  });

  // ─── Data Fetching Detection ───────────────────────────────────────────────

  it("should detect axios", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", axios: "1.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.dataFetching).toContain("axios");
    deleteFakeRepo(repoPath);
  });

  it("should detect react-query", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", "@tanstack/react-query": "5.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.dataFetching).toContain("react-query");
    deleteFakeRepo(repoPath);
  });

  it("should fall back to fetch when no data fetching library found", () => {
    const repoPath = createFakeRepo({ react: "18.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.dataFetching).toContain("fetch");
    deleteFakeRepo(repoPath);
  });

  // ─── Database Detection ────────────────────────────────────────────────────

  it("should detect prisma", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", prisma: "5.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.databases).toContain("prisma");
    deleteFakeRepo(repoPath);
  });

  it("should detect supabase", () => {
    const repoPath = createFakeRepo({ react: "18.0.0", "@supabase/supabase-js": "2.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.databases).toContain("supabase");
    deleteFakeRepo(repoPath);
  });

  it("should return empty array when no database found", () => {
    const repoPath = createFakeRepo({ react: "18.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.databases).toHaveLength(0);
    deleteFakeRepo(repoPath);
  });

  // ─── Language Detection ────────────────────────────────────────────────────

  it("should detect typescript when tsconfig.json exists", () => {
    const repoPath = createFakeRepo({ react: "18.0.0" });
    fs.writeFileSync(path.join(repoPath, "tsconfig.json"), "{}");
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.language).toBe("typescript");
    deleteFakeRepo(repoPath);
  });

  it("should detect javascript when no tsconfig.json exists", () => {
    const repoPath = createFakeRepo({ react: "18.0.0" });
    const fingerprint = analyzeFingerprint(repoPath);
    expect(fingerprint.language).toBe("javascript");
    deleteFakeRepo(repoPath);
  });

  // ─── Error Handling ────────────────────────────────────────────────────────

  it("should throw if repo path does not exist", () => {
    expect(() => analyzeFingerprint("/fake/path/that/does/not/exist")).toThrow();
  });

  it("should throw if no package.json found", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devlens-test-"));
    expect(() => analyzeFingerprint(tmpDir)).toThrow();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

});