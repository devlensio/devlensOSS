import { describe, expect, test } from "bun:test";
import type { CallSite, CodeNode, ResolvedCall } from "./types";
import { buildCalleeOrder, orderCallees } from "./callOrder";

function node(id: string, metadata: Record<string, unknown> = {}): CodeNode {
  return {
    id,
    name: id,
    type: "FUNCTION",
    filePath: `${id}.ts`,
    startLine: 1,
    endLine: 10,
    metadata,
  };
}

function caller(
  metadata: { callSites?: CallSite[]; resolvedCalls?: ResolvedCall[] },
): CodeNode {
  return node("caller", metadata as Record<string, unknown>);
}

function site(name: string, order: number, extra: Partial<CallSite> = {}): CallSite {
  return { name, argCount: 0, order, ...extra };
}

describe("buildCalleeOrder", () => {
  test("uses firstOrder from resolvedCalls", () => {
    const index = buildCalleeOrder({
      caller: caller({
        resolvedCalls: [
          { name: "b", nodeId: "b", firstOrder: 2 },
          { name: "a", nodeId: "a", firstOrder: 1 },
        ],
      }),
    });

    expect(index.get("caller")?.get("a")?.order).toBe(1);
    expect(index.get("caller")?.get("b")?.order).toBe(2);
  });

  test("keeps markers from resolvedCalls", () => {
    const index = buildCalleeOrder({
      caller: caller({
        resolvedCalls: [
          {
            name: "save",
            nodeId: "save",
            firstOrder: 3,
            awaited: true,
            defer: "promise",
            deferDetail: "fetch().then",
            conc: true,
            repeat: true,
            maybe: true,
          },
        ],
      }),
    });

    expect(index.get("caller")?.get("save")).toEqual({
      order: 3,
      markers: {
        awaited: true,
        defer: "promise",
        deferDetail: "fetch().then",
        conc: true,
        repeat: true,
        maybe: true,
        handler: false,
      },
    });
  });

  test("takes handler scope from the call site at firstOrder", () => {
    const index = buildCalleeOrder({
      caller: caller({
        callSites: [
          site("render", 1, { scope: "inline" }),
          site("onClick", 2, {
            scope: "handler",
            defer: "event",
            deferDetail: "onClick",
          }),
        ],
        resolvedCalls: [{ name: "onClick", nodeId: "handler", firstOrder: 2 }],
      }),
    });

    expect(index.get("caller")?.get("handler")).toEqual({
      order: 2,
      markers: {
        awaited: false,
        defer: "event",
        deferDetail: "onClick",
        conc: false,
        repeat: false,
        maybe: false,
        handler: true,
      },
    });
  });

  test("matches a call site by name when firstOrder is absent", () => {
    const index = buildCalleeOrder({
      caller: caller({
        callSites: [site("effect", 1), site("loader", 4, { scope: "callback", repeat: true })],
        resolvedCalls: [{ name: "loader", nodeId: "loader" }],
      }),
    });

    const hit = index.get("caller")?.get("loader");
    expect(hit?.order).toBe(4);
    expect(hit?.markers.repeat).toBe(true);
  });

  test("no ordering data yields no entry", () => {
    const index = buildCalleeOrder({
      caller: caller({
        callSites: [{ name: "a", argCount: 0 }, { name: "b", argCount: 1 }],
        resolvedCalls: [{ name: "a", nodeId: "a" }, { name: "b", nodeId: "b" }],
      }),
      plain: node("plain"),
    });

    expect(index.get("caller")).toBeUndefined();
    expect(index.get("plain")).toBeUndefined();
    expect(index.size).toBe(0);
  });

  test("skips node-id-only resolvedCalls (Rust shape)", () => {
    const index = buildCalleeOrder({
      caller: caller({ resolvedCalls: ["a", "b"] as unknown as ResolvedCall[] }),
    });

    expect(index.size).toBe(0);
  });

  test("collapses duplicate resolvedCalls on the earliest order", () => {
    const index = buildCalleeOrder({
      caller: caller({
        resolvedCalls: [
          { name: "a", nodeId: "a", firstOrder: 5, maybe: true },
          { name: "a", nodeId: "a", firstOrder: 2, awaited: true },
        ],
      }),
    });

    const hit = index.get("caller")?.get("a");
    expect(hit?.order).toBe(2);
    expect(hit?.markers.awaited).toBe(true);
    expect(hit?.markers.maybe).toBe(true);
  });
});

describe("orderCallees", () => {
  test("sorts callees by declared order and attaches markers", () => {
    const a = node("a");
    const b = node("b");
    const c = node("c");
    const parent = caller({
      resolvedCalls: [
        { name: "c", nodeId: "c", firstOrder: 1, awaited: true },
        { name: "a", nodeId: "a", firstOrder: 3 },
      ],
    });

    const ordered = orderCallees(parent, [a, b, c]);

    expect(ordered.map((o) => o.node.id)).toEqual(["c", "a", "b"]);
    expect(ordered[0].order).toBe(1);
    expect(ordered[0].markers?.awaited).toBe(true);
    expect(ordered[2].order).toBeNull();
    expect(ordered[2].markers).toBeNull();
  });

  test("keeps the engine order and drops markers without ordering data", () => {
    const a = node("a");
    const b = node("b");
    const parent = caller({});

    const ordered = orderCallees(parent, [b, a]);

    expect(ordered.map((o) => o.node.id)).toEqual(["b", "a"]);
    expect(ordered.every((o) => o.order === null && o.markers === null)).toBe(true);
  });

  test("does not mutate the caller node", () => {
    const parent = caller({ resolvedCalls: [{ name: "a", nodeId: "a", firstOrder: 1 }] });
    orderCallees(parent, [node("a")]);

    expect(Object.keys(parent.metadata)).toEqual(["resolvedCalls"]);
  });
});
