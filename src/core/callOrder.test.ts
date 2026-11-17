// callOrder/v1 — the per-node callee position map the query core renders from.
//
// Node metadata is the ordering truth (docs/CALL_ORDER.md §7), and it is optional:
// a graph analysed by an older engine has no `resolvedCalls` at all. These tests
// pin both directions — a position when one was recorded, an EMPTY map (never a
// zero) when none was.

import { describe, test, expect } from "bun:test";
import { buildCalleeOrder } from "./queries.js";

describe("buildCalleeOrder", () => {
  test("maps each resolved callee to its first source position", () => {
    const positions = buildCalleeOrder({
      resolvedCalls: [
        { name: "save", nodeId: "a.ts::save", firstOrder: 1, line: 5 },
        { name: "load", nodeId: "a.ts::load", firstOrder: 3, line: 7 },
      ],
    });
    expect([...positions]).toEqual([
      ["a.ts::save", { order: 1, line: 5 }],
      ["a.ts::load", { order: 3, line: 7 }],
    ]);
  });

  test("no ordering data means no positions — the caller falls back to edge order", () => {
    expect(buildCalleeOrder(undefined).size).toBe(0);
    expect(buildCalleeOrder({}).size).toBe(0);
    expect(buildCalleeOrder({ calls: ["save", "load"] }).size).toBe(0); // pre-callOrder metadata
    expect(buildCalleeOrder({ resolvedCalls: [] }).size).toBe(0);
  });

  test("entries without a numeric firstOrder are dropped, never defaulted to 0", () => {
    const positions = buildCalleeOrder({
      resolvedCalls: [
        { name: "a", nodeId: "x::a" },
        { name: "b", nodeId: "x::b", firstOrder: "2" },
        { name: "c", nodeId: "x::c", firstOrder: 2, line: 9 },
      ],
    });
    expect([...positions.keys()]).toEqual(["x::c"]);
  });

  test("a malformed resolvedCalls is ignored instead of throwing", () => {
    expect(buildCalleeOrder({ resolvedCalls: "nope" }).size).toBe(0);
    expect(buildCalleeOrder({ resolvedCalls: [null, 42] }).size).toBe(0);
  });

  test("a twice-called target keeps its FIRST position only", () => {
    // The repeat ordinals live in the edge mirror; node metadata is de-duplicated
    // by nodeId, so this map is a first-position lookup and nothing more.
    const positions = buildCalleeOrder({
      resolvedCalls: [{ name: "a", nodeId: "x::a", firstOrder: 1, line: 3 }],
    });
    expect(positions.get("x::a")).toEqual({ order: 1, line: 3 });
  });

  test("position survives without a line (line is display, order is the claim)", () => {
    const positions = buildCalleeOrder({
      resolvedCalls: [{ name: "a", nodeId: "x::a", firstOrder: 4 }],
    });
    expect(positions.get("x::a")).toEqual({ order: 4 });
  });
});
