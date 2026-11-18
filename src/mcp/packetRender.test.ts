// FLOW lines — call position rendering (callOrder/v1).
//
// FLOW reads `edges` only, so these tests hand the renderer the exact packet
// shapes the query core produces: an edge with no `order` (older graph or an
// edge kind that carries no position) must render byte-identically to before.

import { describe, test, expect } from "bun:test";
import { renderResolvePacket, type PacketEdge, type ResolvePacket } from "./packetRender.js";

const nodes = [
  { id: "n1", name: "run", type: "FUNCTION", filePath: "src/x.ts", startLine: 10, endLine: 20 },
  { id: "n2", name: "save", type: "FUNCTION", filePath: "src/x.ts", startLine: 40, endLine: 44 },
  { id: "n3", name: "load", type: "FUNCTION", filePath: "src/x.ts", startLine: 50, endLine: 55 },
];

const packetWith = (edges: PacketEdge[]): ResolvePacket => ({
  graphId: "g1",
  commitHash: "abc123def4",
  nodes,
  edges,
  code: [],
});

/** The rendered lines of one section, header excluded. */
function section(text: string, name: string): string[] {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => l.startsWith(`${name} `));
  if (head < 0) return [];
  const count = Number(lines[head].slice(name.length + 1));
  return lines.slice(head + 1, head + 1 + count);
}

describe("FLOW — call position", () => {
  test("ordering absent renders exactly the pre-callOrder line", () => {
    const r = renderResolvePacket(
      packetWith([{ from: "n1", to: "n2", type: "CALLS", edgeSite: { file: "src/x.ts", line: 12 } }]),
      2000
    );
    expect(section(r.text, "FLOW")).toEqual(["N1 -calls-> N2 at=src/x.ts:12"]);
    expect(r.text).not.toContain("[#");
    expect(r.text).not.toContain("undefined");
    expect(r.text).not.toContain("#0");
  });

  test("a recorded position renders as #n before the arrow", () => {
    const r = renderResolvePacket(
      packetWith([
        { from: "n1", to: "n2", type: "CALLS", edgeSite: { file: "src/x.ts", line: 42 }, order: 3 },
      ]),
      2000
    );
    expect(section(r.text, "FLOW")).toEqual(["N1 -calls[#3]-> N2 at=src/x.ts:42"]);
  });

  test("a twice-called target lists every position", () => {
    const r = renderResolvePacket(
      packetWith([
        { from: "n1", to: "n2", type: "CALLS", edgeSite: { file: "src/x.ts", line: 12 }, order: 3, orders: [3, 7] },
        { from: "n1", to: "n3", type: "CALLS", edgeSite: { file: "src/x.ts", line: 14 }, order: 4, orders: [4] },
      ]),
      2000
    );
    expect(section(r.text, "FLOW")).toEqual([
      "N1 -calls[#3,#7]-> N2 at=src/x.ts:12",
      "N1 -calls[#4]-> N3 at=src/x.ts:14",
    ]);
  });

  test("other edge kinds keep their name and gain the position too", () => {
    const r = renderResolvePacket(
      packetWith([{ from: "n1", to: "n2", type: "USES", order: 2, edgeSite: { file: "src/x.ts", line: 11 } }]),
      2000
    );
    expect(section(r.text, "FLOW")).toEqual(["N1 -uses[#2]-> N2 at=src/x.ts:11"]);
  });

  test("positions do not disturb the chars/4 budget arithmetic", () => {
    const edges: PacketEdge[] = nodes.map((_, i) => ({
      from: "n1",
      to: i === 0 ? "n2" : "n3",
      type: "CALLS",
      edgeSite: { file: "src/x.ts", line: 11 + i },
      order: i + 1,
      ...(i === 0 ? { orders: [1, 9] } : {}),
    }));
    const r = renderResolvePacket(packetWith(edges), 2000);
    expect(r.approxTokens).toBe(Math.ceil(r.text.length / 4));
    expect(section(r.text, "FLOW")[0]).toBe("N1 -calls[#1,#9]-> N2 at=src/x.ts:11");
  });

  test("a cut FLOW section counts the same lines it counts today", () => {
    // One tight budget, positions on: the section still ends with a truncation
    // banner whose counts describe the rendered lines, not the raw edge list.
    const edges: PacketEdge[] = Array.from({ length: 20 }, (_, i) => ({
      from: "n1",
      to: i % 2 === 0 ? "n2" : "n3",
      type: "CALLS",
      edgeSite: { file: "src/x.ts", line: 11 + i },
      order: i + 1,
    }));
    const r = renderResolvePacket(packetWith(edges), 2000, { intent: "flow" });
    const flow = section(r.text, "FLOW");
    for (const line of flow) {
      if (line.startsWith("FLOW truncated")) continue;
      expect(line).toMatch(/^N1 -calls\[#\d+\]-> N[23] at=src\/x\.ts:\d+$/);
    }
    expect(r.approxTokens).toBe(Math.ceil(r.text.length / 4));
  });
});

// FLOW budget accounting. The section used to compare the running total (which
// already contains NODES, 45% of the budget) against a bound of 2x the FLOW
// share (16%), so it broke on the first edge on any graph whose NODES section
// filled up. These four tests are the regression net for that and for the
// filter-before-slice rule on the edge cap.

function flowNodes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i + 1}`,
    name: `handler_${i + 1}_for_the_flow_section`,
    type: "FUNCTION",
    filePath: `src/mod${i % 9}.ts`,
    startLine: 10 + i,
    endLine: 20 + i,
  }));
}

function flowPacket(nodeCount: number, edges: PacketEdge[]): ResolvePacket {
  return {
    graphId: "g-flow",
    commitHash: "abc123def4",
    nodes: flowNodes(nodeCount),
    edges,
    code: [],
  };
}

const flowEdge = (to: string, i = 0): PacketEdge => ({
  from: "n1",
  to,
  type: "CALLS",
  edgeSite: { file: "src/mod0.ts", line: 12 + i },
  order: i + 1,
});

describe("FLOW — budget accounting", () => {
  test("renders when NODES filled its budget and the edges fit", () => {
    // 60 nodes over a 3937-char NODES share forces a NODES cut, so the global
    // running total is far past the FLOW bound. The five edges still fit in the
    // 700-char FLOW share and must print.
    const edges = ["n2", "n3", "n4", "n5", "n6"].map((to, i) => flowEdge(to, i));
    const r = renderResolvePacket(flowPacket(60, edges), 0, { intent: "symbol" });
    const nodesSection = section(r.text, "NODES");
    expect(nodesSection.some((l) => l.includes("TRUNCATED"))).toBe(true);
    expect(section(r.text, "FLOW").filter((l) => l.includes("->"))).toHaveLength(5);
    expect(r.text).not.toContain("TRUNCATED: showing 0 of");
  });

  test("the edge cap is spent on edges that can actually print", () => {
    // 40 edges point at nodes outside the rendered set, then 5 valid ones. The
    // cap must be applied AFTER the admitted-node filter, or the invalid edges
    // consume every slot and FLOW prints nothing.
    const dead: PacketEdge[] = Array.from({ length: 40 }, (_, i) => flowEdge(`n${70 + i}`, i));
    const live = ["n2", "n3", "n4", "n5", "n6"].map((to, i) => flowEdge(to, i));
    const r = renderResolvePacket(flowPacket(120, [...dead, ...live]), 0, { intent: "flow" });
    const printed = section(r.text, "FLOW").filter((l) => l.includes("->"));
    expect(printed).toHaveLength(5);
    expect(printed.every((l) => /-> N([2-9])\b/.test(l))).toBe(true);
  });

  test("cut.flow only when the eligible edges exceed the FLOW share", () => {
    const fits = ["n2", "n3", "n4"].map((to, i) => flowEdge(to, i));
    const complete = renderResolvePacket(flowPacket(60, fits), 0, { intent: "symbol" });
    expect(section(complete.text, "FLOW").some((l) => l.includes("TRUNCATED"))).toBe(false);

    const many: PacketEdge[] = Array.from({ length: 40 }, (_, i) => flowEdge(`n${2 + (i % 40)}`, i));
    const cut = renderResolvePacket(flowPacket(60, many), 0, { intent: "symbol" });
    const flow = section(cut.text, "FLOW");
    expect(flow[0]).toContain("TRUNCATED");
    expect(flow.filter((l) => l.includes("->")).length).toBeLessThan(40);
  });

  test("a non-empty FLOW section keeps the packet inside its token budget", () => {
    const edges = Array.from({ length: 40 }, (_, i) => flowEdge(`n${2 + (i % 40)}`, i));
    const r = renderResolvePacket(flowPacket(60, edges), 0, { intent: "symbol" });
    expect(section(r.text, "FLOW").filter((l) => l.includes("->")).length).toBeGreaterThan(0);
    expect(r.approxTokens).toBeLessThanOrEqual(1500);
    expect(r.approxTokens).toBe(Math.ceil(r.text.length / 4));
  });
});
