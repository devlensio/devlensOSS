// Tests for the deterministic security query: coverage counting, severity filtering,
// impact ranking, paging and summary clipping. It reads a plain node array, so no
// storage, resolver or model is involved and the tests are pure.

import { describe, test, expect } from "bun:test";
import type { CodeNode } from "devlensio";
import { rankSecurityFindings } from "./queries.js";

const node = (over: { id: string; filePath: string; score?: number; security?: { severity: string; summary?: string }; technicalSummary?: string }): CodeNode =>
  ({
    name: over.id.split("::").pop() ?? over.id,
    type: "FUNCTION",
    startLine: 1,
    endLine: 10,
    parentFile: over.filePath,
    metadata: {},
    ...over,
  }) as unknown as CodeNode;

const finding = (severity: "low" | "medium" | "high" | "none", summary?: string) => ({ severity, summary: summary ?? `${severity} concern` });

const FIXTURE: CodeNode[] = [
  node({ id: "a::highTopScore", filePath: "src/a.ts", score: 9, security: finding("high", "hardcoded credential used for signing"), technicalSummary: "signs the session token" }),
  node({ id: "b::highLowScore", filePath: "src/b.ts", score: 2, security: finding("high") }),
  node({ id: "c::medium", filePath: "src/c.ts", score: 7, security: finding("medium") }),
  node({ id: "d::low", filePath: "src/d.ts", score: 1, security: finding("low") }),
  node({ id: "e::assessedClean", filePath: "src/e.ts", score: 5, security: finding("none") }),
  node({ id: "f::unassessed", filePath: "src/f.ts", score: 5 }),
];

describe("rankSecurityFindings coverage", () => {
  test("counts assessed nodes including clean ones and reports unassessed separately", () => {
    const r = rankSecurityFindings(FIXTURE);
    expect(r.nodesTotal).toBe(6);
    expect(r.nodesAssessed).toBe(5);
    expect(r.assessedPct).toBe(83);
    expect(r.nodesTotal - r.nodesAssessed).toBe(1);
  });

  test("the severity distribution covers every finding regardless of the filter", () => {
    const r = rankSecurityFindings(FIXTURE, { minSeverity: "high" });
    expect(r.findingsBySeverity).toEqual({ high: 2, medium: 1, low: 1 });
    expect(r.matched).toBe(2);
  });
});

describe("rankSecurityFindings filtering", () => {
  test("default returns every finding at or above low", () => {
    const r = rankSecurityFindings(FIXTURE);
    expect(r.matched).toBe(4);
    expect(r.findings.map((f) => f.severity)).toEqual(["high", "high", "medium", "low"]);
  });

  test("minSeverity filters at or above", () => {
    expect(rankSecurityFindings(FIXTURE, { minSeverity: "medium" }).matched).toBe(3);
    expect(rankSecurityFindings(FIXTURE, { minSeverity: "high" }).matched).toBe(2);
  });

  test("exactSeverity selects one bucket and overrides minSeverity", () => {
    const r = rankSecurityFindings(FIXTURE, { minSeverity: "high", exactSeverity: "medium" });
    expect(r.matched).toBe(1);
    expect(r.findings[0]?.severity).toBe("medium");
  });

  test("a clean graph returns no findings and is not truncated", () => {
    const clean = [node({ id: "x::clean", filePath: "src/x.ts", security: finding("none") })];
    const r = rankSecurityFindings(clean);
    expect(r.matched).toBe(0);
    expect(r.returned).toBe(0);
    expect(r.findings).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.nodesAssessed).toBe(1);
  });
});

describe("rankSecurityFindings ranking and paging", () => {
  test("ranks severity first, then impact score, then path", () => {
    const r = rankSecurityFindings(FIXTURE);
    expect(r.findings.map((f) => f.id)).toEqual([
      "a::highTopScore",
      "b::highLowScore",
      "c::medium",
      "d::low",
    ]);
    expect(r.findings[0]?.score).toBe(9);
  });

  test("breaks ties on score by file path so the order is stable", () => {
    const tied = [
      node({ id: "z::one", filePath: "src/z.ts", score: 4, security: finding("medium") }),
      node({ id: "a::two", filePath: "src/a.ts", score: 4, security: finding("medium") }),
    ];
    expect(rankSecurityFindings(tied).findings.map((f) => f.filePath)).toEqual(["src/a.ts", "src/z.ts"]);
  });

  test("pages with limit and offset and reports matched, returned and truncated", () => {
    const first = rankSecurityFindings(FIXTURE, { limit: 2 });
    expect(first.matched).toBe(4);
    expect(first.returned).toBe(2);
    expect(first.truncated).toBe(true);
    expect(first.offset).toBe(0);

    const second = rankSecurityFindings(FIXTURE, { limit: 2, offset: 2 });
    expect(second.returned).toBe(2);
    expect(second.truncated).toBe(false);
    expect(second.findings.map((f) => f.id)).toEqual(["c::medium", "d::low"]);

    const past = rankSecurityFindings(FIXTURE, { limit: 2, offset: 99 });
    expect(past.returned).toBe(0);
    expect(past.truncated).toBe(false);
  });

  test("clamps limit into range and never returns a negative offset", () => {
    expect(rankSecurityFindings(FIXTURE, { limit: 0 }).limit).toBe(1);
    expect(rankSecurityFindings(FIXTURE, { limit: 5000 }).limit).toBe(500);
    expect(rankSecurityFindings(FIXTURE, { offset: -5 }).offset).toBe(0);
  });
});

describe("rankSecurityFindings output shape", () => {
  test("includes the technical summary beside the security summary by default", () => {
    const top = rankSecurityFindings(FIXTURE).findings[0];
    expect(top?.technicalSummary).toBe("signs the session token");
    expect(top?.securitySummary).toBe("hardcoded credential used for signing");
  });

  test("omits the technical summary on request", () => {
    const top = rankSecurityFindings(FIXTURE, { includeTechnical: false }).findings[0];
    expect("technicalSummary" in (top ?? {})).toBe(false);
    expect(top?.securitySummary).toBe("hardcoded credential used for signing");
  });

  test("clips long summaries and collapses newlines", () => {
    const long = "x".repeat(500) + "\nsecond line";
    const r = rankSecurityFindings([node({ id: "long::one", filePath: "src/long.ts", score: 1, security: finding("high", long) })]);
    const summary = r.findings[0]?.securitySummary ?? "";
    expect(summary.length).toBeLessThanOrEqual(300);
    expect(summary.endsWith("...")).toBe(true);
    expect(summary.includes("\n")).toBe(false);
  });

  test("returns null summaries rather than empty strings", () => {
    const r = rankSecurityFindings([node({ id: "bare::one", filePath: "src/bare.ts", score: 1, security: { severity: "high" } })]);
    expect(r.findings[0]?.securitySummary).toBe(null);
  });

  test("is deterministic across calls", () => {
    expect(JSON.stringify(rankSecurityFindings(FIXTURE))).toBe(JSON.stringify(rankSecurityFindings(FIXTURE)));
  });
});
