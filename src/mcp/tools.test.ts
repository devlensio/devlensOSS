// get_node — the compact CALLS section.
//
// A React component records one callSite per occurrence, so inlining
// metadata.callSites into the METADATA json blob can exceed the transport's
// 50 KiB cap on its own. CALLS renders the same truth as ordered lines and the
// blob keeps only the scalar metadata.

import { describe, test, expect } from "bun:test";
import { CALLS_LIMIT, renderCallSiteLines, renderGraphNode } from "./tools.js";

const nodeDetail = (metadata: Record<string, unknown>) => ({
  id: "src/x.ts::run",
  name: "run",
  type: "FUNCTION",
  filePath: "src/x.ts",
  lines: "10-40",
  score: 7,
  metadata,
});

describe("renderCallSiteLines", () => {
  test("one ordered line per occurrence, with line and markers", () => {
    const lines = renderCallSiteLines([
      { name: "useClient", argCount: 0, kind: "hook", order: 1, line: 11, scope: "inline" },
      { name: "fetchUser", argCount: 1, order: 2, line: 12, awaited: true, scope: "inline" },
      { name: "saveLocal", argCount: 0, order: 3, line: 13, defer: "timer", deferDetail: "setTimeout", scope: "callback" },
      { name: "shard", argCount: 1, order: 4, line: 14, conc: true, repeat: true, maybe: true },
    ]);
    expect(lines).toEqual([
      "  #1 useClient() :11 hook",
      "  #2 fetchUser() :12 await",
      "  #3 saveLocal() :13 timer:setTimeout callback",
      "  #4 shard() :14 conc repeat maybe",
    ]);
  });

  test("a repeated call site renders twice, in position order", () => {
    const lines = renderCallSiteLines([
      { name: "saveLocal", argCount: 0, order: 1, line: 12 },
      { name: "loadUser", argCount: 0, order: 2, line: 13 },
      { name: "saveLocal", argCount: 0, order: 3, line: 15 },
    ]);
    expect(lines).toEqual(["  #1 saveLocal() :12", "  #2 loadUser() :13", "  #3 saveLocal() :15"]);
  });

  test("a graph without positions lists call sites and claims no order", () => {
    const lines = renderCallSiteLines([{ name: "saveLocal", argCount: 0 }, { name: "loadUser", argCount: 0 }]);
    expect(lines).toEqual(["  saveLocal()", "  loadUser()"]);
  });

  test("nothing to list renders nothing", () => {
    expect(renderCallSiteLines(undefined)).toEqual([]);
    expect(renderCallSiteLines([])).toEqual([]);
    expect(renderCallSiteLines("nope")).toEqual([]);
  });

  test("the tail becomes a hint after the cap", () => {
    const sites = Array.from({ length: CALLS_LIMIT + 5 }, (_, i) => ({ name: "f", order: i + 1, line: i + 1 }));
    const lines = renderCallSiteLines(sites);
    expect(lines).toHaveLength(CALLS_LIMIT + 1);
    expect(lines[CALLS_LIMIT]).toBe(`  ... (+5 more)`);
  });
});

describe("renderGraphNode", () => {
  test("CALLS replaces the call blob inside METADATA", () => {
    const text = renderGraphNode(
      nodeDetail({
        calls: ["saveLocal"],
        resolvedCalls: [{ name: "saveLocal", nodeId: "src/x.ts::saveLocal", firstOrder: 1, line: 12 }],
        callSites: [{ name: "saveLocal", argCount: 0, order: 1, line: 12 }],
        isAsync: false,
      }),
      "src/x.ts",
      "10-40"
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe("NODE run function src/x.ts:10-40 score:7");
    expect(lines[1]).toBe(`METADATA {"calls":["saveLocal"],"isAsync":false}`);
    expect(lines[2]).toBe("CALLS 1");
    expect(lines[3]).toBe("  #1 saveLocal() :12");
    expect(text).not.toContain("callSites");
    expect(text).not.toContain("resolvedCalls");
  });

  test("an old graph keeps its metadata blob verbatim and gets no CALLS header", () => {
    const text = renderGraphNode(nodeDetail({ calls: ["saveLocal"], isAsync: true }), "src/x.ts", "10-40");
    expect(text.split("\n")).toEqual([
      "NODE run function src/x.ts:10-40 score:7",
      `METADATA {"calls":["saveLocal"],"isAsync":true}`,
    ]);
  });

  test("a hub node stays far under the transport cap", () => {
    // 400 recorded occurrences is routine for a component with handlers.
    const callSites = Array.from({ length: 400 }, (_, i) => ({
      name: `handler${i}`,
      argCount: 1,
      order: i + 1,
      line: 10 + i,
      scope: "handler",
      defer: "event",
      deferDetail: "onClick",
    }));
    const text = renderGraphNode(nodeDetail({ callSites, resolvedCalls: [] }), "src/x.ts", "1-500");
    expect(text.length).toBeLessThan(4000);
    expect(text).toContain("CALLS 400");
    expect(text).toContain(`... (+${400 - CALLS_LIMIT} more)`);
    expect(text.split("\n").filter((l) => l.startsWith("  #"))).toHaveLength(CALLS_LIMIT);
  });
});
