import { countConnections } from "./connectionCounter";
import { scoreNode } from "./nodeScorer";
import { scoreFile } from "./fileScorer";
import { filterNoise } from "./noiseFilter";
import { scoreAndFilter } from "./index";
import { CodeNode, CodeEdge } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<CodeNode> & { id: string; name: string }): CodeNode {
  return {
    type:      "FUNCTION",
    filePath:  "src/test.ts",
    startLine: 1,
    endLine:   10,
    parentFile: "file::src/test.ts",
    metadata:  {},
    ...overrides,
  };
}

function makeFileNode(filePath: string): CodeNode {
  return {
    id:        `file::${filePath}`,
    name:      filePath.split("/").pop()!,
    type:      "FILE",
    filePath,
    startLine: 0,
    endLine:   100,
    parentFile: `file::${filePath}`,
    metadata:  { nodeCount: 0 },
  };
}

function makeEdge(
  from: string,
  to: string,
  type: CodeEdge["type"]
): CodeEdge {
  return { from, to, type, metadata: {} };
}

// ─── connectionCounter ────────────────────────────────────────────────────────

describe("countConnections", () => {

  it("should count incoming and outgoing CALLS correctly", () => {
    const nodes = [
      makeNode({ id: "a", name: "funcA" }),
      makeNode({ id: "b", name: "funcB" }),
      makeNode({ id: "c", name: "funcC" }),
    ];
    const edges = [
      makeEdge("a", "b", "CALLS"),
      makeEdge("a", "c", "CALLS"),
    ];

    const { profiles } = countConnections(nodes, edges);

    expect(profiles.get("a")!.outgoingCalls).toBe(2);
    expect(profiles.get("b")!.incomingCalls).toBe(1);
    expect(profiles.get("c")!.incomingCalls).toBe(1);
  });

  it("should count READS_FROM and WRITES_TO on the target node", () => {
    const nodes = [
      makeNode({ id: "store",     name: "useCartStore", type: "STATE_STORE" }),
      makeNode({ id: "readerA",   name: "ComponentA",   type: "COMPONENT" }),
      makeNode({ id: "readerB",   name: "ComponentB",   type: "COMPONENT" }),
      makeNode({ id: "writer",    name: "ComponentC",   type: "COMPONENT" }),
    ];
    const edges = [
      makeEdge("readerA", "store", "READS_FROM"),
      makeEdge("readerB", "store", "READS_FROM"),
      makeEdge("writer",  "store", "WRITES_TO"),
    ];

    const { profiles } = countConnections(nodes, edges);

    expect(profiles.get("store")!.incomingReads).toBe(2);
    expect(profiles.get("store")!.incomingWrites).toBe(1);
  });

  it("should count PROP_PASS incoming and outgoing", () => {
    const nodes = [
      makeNode({ id: "parent", name: "Parent", type: "COMPONENT" }),
      makeNode({ id: "child",  name: "Child",  type: "COMPONENT" }),
    ];
    const edges = [
      makeEdge("parent", "child", "PROP_PASS"),
    ];

    const { profiles } = countConnections(nodes, edges);

    expect(profiles.get("parent")!.outgoingProps).toBe(1);
    expect(profiles.get("child")!.incomingProps).toBe(1);
  });

  it("should count IMPORTS as importedBy on the target FILE node", () => {
    const nodes = [
      makeFileNode("src/a.ts"),
      makeFileNode("src/b.ts"),
      makeFileNode("src/c.ts"),
    ];
    const edges = [
      makeEdge("file::src/a.ts", "file::src/b.ts", "IMPORTS"),
      makeEdge("file::src/c.ts", "file::src/b.ts", "IMPORTS"),
    ];

    const { profiles } = countConnections(nodes, edges);

    expect(profiles.get("file::src/b.ts")!.importedBy).toBe(2);
    expect(profiles.get("file::src/a.ts")!.importedBy).toBe(0);
  });

  it("should compute p75 maxima that are at least 1", () => {
    const nodes = [
      makeNode({ id: "a", name: "a" }),
      makeNode({ id: "b", name: "b" }),
    ];
    const edges: CodeEdge[] = [];

    const { maxima } = countConnections(nodes, edges);

    expect(maxima.p75IncomingCalls).toBeGreaterThanOrEqual(1);
    expect(maxima.p75OutgoingCalls).toBeGreaterThanOrEqual(1);
  });

  it("should give a node with more connections a higher p75 signal", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode({ id: `n${i}`, name: `func${i}` })
    );

    // n0 is called by 8 nodes — highest incoming
    const edges: CodeEdge[] = Array.from({ length: 8 }, (_, i) =>
      makeEdge(`n${i + 1}`, "n0", "CALLS")
    );

    const { profiles, maxima } = countConnections(nodes, edges);

    expect(profiles.get("n0")!.incomingCalls).toBe(8);
    expect(maxima.p75IncomingCalls).toBeGreaterThanOrEqual(1);
  });

});

// ─── nodeScorer ───────────────────────────────────────────────────────────────

describe("scoreNode", () => {

  const defaultMaxima = {
    maxIncomingCalls:  10,
    maxOutgoingCalls:  10,
    maxIncomingReads:  10,
    maxIncomingWrites: 10,
    maxIncomingProps:  10,
    maxOutgoingProps:  10,
    maxImportedBy:     10,
    p75IncomingCalls:  3,
    p75OutgoingCalls:  3,
    p75IncomingReads:  3,
    p75IncomingProps:  3,
  };

  const emptyProfile = {
    incomingCalls:  0,
    outgoingCalls:  0,
    incomingReads:  0,
    incomingWrites: 0,
    incomingProps:  0,
    outgoingProps:  0,
    importedBy:     0,
  };

  it("should return 5.0 for GHOST nodes regardless of profile", () => {
    const ghost = makeNode({ id: "g", name: "event:payment", type: "GHOST" });
    const score = scoreNode(ghost, emptyProfile, defaultMaxima);
    expect(score).toBe(5.0);
  });

  it("should return 0 for FILE nodes", () => {
    const file = makeFileNode("src/payment.ts");
    const score = scoreNode(file, emptyProfile, defaultMaxima);
    expect(score).toBe(0);
  });

  it("should score within 0-10 range", () => {
    const node = makeNode({ id: "n", name: "processPayment", endLine: 60 });
    const score = scoreNode(node, emptyProfile, defaultMaxima);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("should score a complex function higher than a trivial one", () => {
    const complex = makeNode({
      id: "complex", name: "processPayment", endLine: 80,
      metadata: { apiCalls: ["/api/stripe"], hasErrorHandling: true },
    });
    const trivial = makeNode({
      id: "trivial", name: "getLabel", endLine: 3,
      metadata: {},
    });

    const complexScore = scoreNode(complex, emptyProfile, defaultMaxima);
    const trivialScore = scoreNode(trivial, emptyProfile, defaultMaxima);

    expect(complexScore).toBeGreaterThan(trivialScore);
  });

  it("should apply utility name penalty", () => {
    const utilNode = makeNode({ id: "u", name: "formatDate", endLine: 10 });
    const normalNode = makeNode({ id: "n", name: "processPayment", endLine: 10 });

    const utilScore   = scoreNode(utilNode,   emptyProfile, defaultMaxima);
    const normalScore = scoreNode(normalNode, emptyProfile, defaultMaxima);

    expect(utilScore).toBeLessThan(normalScore);
  });

  it("should apply isolation penalty to tiny disconnected nodes", () => {
    const isolated = makeNode({ id: "i", name: "doThing", endLine: 3 });
    const connected = makeNode({ id: "c", name: "doThing", endLine: 3 });

    const connectedProfile = { ...emptyProfile, incomingCalls: 2 };

    const isolatedScore  = scoreNode(isolated, emptyProfile,    defaultMaxima);
    const connectedScore = scoreNode(connected, connectedProfile, defaultMaxima);

    expect(isolatedScore).toBeLessThan(connectedScore);
  });

  it("should give STATE_STORE a higher type bonus than FUNCTION", () => {
    const store = makeNode({
      id: "s", name: "useCartStore", type: "STATE_STORE", endLine: 20,
    });
    const func = makeNode({
      id: "f", name: "processCart", type: "FUNCTION", endLine: 20,
    });

    const storeScore = scoreNode(store, emptyProfile, defaultMaxima);
    const funcScore  = scoreNode(func,  emptyProfile, defaultMaxima);

    expect(storeScore).toBeGreaterThan(funcScore);
  });

  it("should score a node with API calls higher than one without", () => {
    const withApi    = makeNode({
      id: "a", name: "fetchData", endLine: 30,
      metadata: { apiCalls: ["/api/users"] },
    });
    const withoutApi = makeNode({
      id: "b", name: "fetchData", endLine: 30,
      metadata: {},
    });

    const withApiScore    = scoreNode(withApi,    emptyProfile, defaultMaxima);
    const withoutApiScore = scoreNode(withoutApi, emptyProfile, defaultMaxima);

    expect(withApiScore).toBeGreaterThan(withoutApiScore);
  });

  it("should score a heavily connected node higher than an isolated one", () => {
    const node = makeNode({ id: "n", name: "processPayment", endLine: 30 });

    const isolatedProfile  = { ...emptyProfile };
    const connectedProfile = { ...emptyProfile, incomingCalls: 5, outgoingCalls: 3 };

    const isolatedScore  = scoreNode(node, isolatedProfile,  defaultMaxima);
    const connectedScore = scoreNode(node, connectedProfile, defaultMaxima);

    expect(connectedScore).toBeGreaterThan(isolatedScore);
  });

});

// ─── fileScorer ───────────────────────────────────────────────────────────────

describe("scoreFile", () => {

  it("should return 0 for non-FILE nodes", () => {
    const func = makeNode({ id: "f", name: "processPayment" });
    const scores = new Map<string, number>();
    expect(scoreFile(func, [], scores, 0)).toBe(0);
  });

  it("should score higher when best child scores higher", () => {
    const fileNode = makeFileNode("src/payment.ts");

    const childA = makeNode({ id: "a", name: "funcA", parentFile: fileNode.id });
    const childB = makeNode({ id: "b", name: "funcB", parentFile: fileNode.id });

    const lowScores  = new Map([["a", 3.0], ["b", 2.0]]);
    const highScores = new Map([["a", 8.0], ["b", 2.0]]);

    const lowScore  = scoreFile(fileNode, [childA, childB], lowScores,  0);
    const highScore = scoreFile(fileNode, [childA, childB], highScores, 0);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("should boost score when imported by more files", () => {
    const fileNode = makeFileNode("src/utils.ts");
    const child    = makeNode({ id: "c", name: "helper", parentFile: fileNode.id });
    const scores   = new Map([["c", 4.0]]);

    const lowImport  = scoreFile(fileNode, [child], scores, 0);
    const highImport = scoreFile(fileNode, [child], scores, 20);

    expect(highImport).toBeGreaterThan(lowImport);
  });

  it("should apply best child floor — file should not score below 90% of best child", () => {
    const fileNode = makeFileNode("src/payment.ts");

    const children = [
      makeNode({ id: "a", name: "criticalFn",  parentFile: fileNode.id }),
      makeNode({ id: "b", name: "helperOne",   parentFile: fileNode.id }),
      makeNode({ id: "c", name: "helperTwo",   parentFile: fileNode.id }),
      makeNode({ id: "d", name: "helperThree", parentFile: fileNode.id }),
    ];

    // One critical node, many helpers dragging G_int down
    const scores = new Map([
      ["a", 8.0],
      ["b", 1.0],
      ["c", 1.0],
      ["d", 1.0],
    ]);

    const fileScore = scoreFile(fileNode, children, scores, 0);

    // File should score at least 90% of best child (8.0 × 0.90 = 7.2)
    expect(fileScore).toBeGreaterThanOrEqual(7.2);
  });

  it("should give empty file a score based only on reputation", () => {
    const fileNode   = makeFileNode("src/types.ts");
    const scores     = new Map<string, number>();

    const noImports   = scoreFile(fileNode, [], scores, 0);
    const manyImports = scoreFile(fileNode, [], scores, 30);

    expect(noImports).toBeLessThan(manyImports);
    expect(noImports).toBeCloseTo(0, 0);
  });

  it("should never exceed 10", () => {
    const fileNode = makeFileNode("src/critical.ts");
    const child    = makeNode({ id: "c", name: "godFunction", parentFile: fileNode.id });
    const scores   = new Map([["c", 10.0]]);

    const fileScore = scoreFile(fileNode, [child], scores, 1000);

    expect(fileScore).toBeLessThanOrEqual(10);
  });

});

// ─── noiseFilter ─────────────────────────────────────────────────────────────

describe("filterNoise", () => {

  it("should remove nodes below threshold", () => {
    const nodes = [
      makeNode({ id: "important", name: "processPayment" }),
      makeNode({ id: "noise",     name: "formatDate"     }),
    ];
    const edges: CodeEdge[] = [];
    const scores = new Map([
      ["important", 7.0],
      ["noise",     1.0],
    ]);

    const result = filterNoise(nodes, edges, scores, { nodeMinScore: 3.0 });

    expect(result.nodes.find((n) => n.id === "important")).toBeDefined();
    expect(result.nodes.find((n) => n.id === "noise")).toBeUndefined();
  });

  it("should always keep STATE_STORE nodes regardless of score", () => {
    const store = makeNode({
      id: "store", name: "useCartStore", type: "STATE_STORE",
    });
    const scores  = new Map([["store", 0.5]]);
    const result  = filterNoise([store], [], scores, { nodeMinScore: 3.0 });

    expect(result.nodes.find((n) => n.id === "store")).toBeDefined();
  });

  it("should always keep GHOST nodes regardless of score", () => {
    const ghost  = makeNode({ id: "g", name: "event:payment", type: "GHOST" });
    const scores = new Map([["g", 0.1]]);
    const result = filterNoise([ghost], [], scores, { nodeMinScore: 3.0 });

    expect(result.nodes.find((n) => n.id === "g")).toBeDefined();
  });

  it("should remove edges where both nodes were removed", () => {
    const nodes = [
      makeNode({ id: "a", name: "funcA" }),
      makeNode({ id: "b", name: "funcB" }),
    ];
    const edges  = [makeEdge("a", "b", "CALLS")];
    const scores = new Map([["a", 1.0], ["b", 1.0]]);

    const result = filterNoise(nodes, edges, scores, { nodeMinScore: 3.0 });

    expect(result.edges.length).toBe(0);
  });

  it("should keep edges where at least one node survived", () => {
    const nodes = [
      makeNode({ id: "important", name: "processPayment" }),
      makeNode({ id: "noise",     name: "formatDate"     }),
    ];
    const edges  = [makeEdge("important", "noise", "CALLS")];
    const scores = new Map([["important", 7.0], ["noise", 1.0]]);

    const result = filterNoise(nodes, edges, scores, { nodeMinScore: 3.0 });

    // Edge removed because "noise" node was removed
    expect(result.edges.length).toBe(0);
  });

  it("should always keep GUARDS edges", () => {
    const nodes = [
      makeNode({ id: "mw",    name: "authMiddleware" }),
      makeNode({ id: "route", name: "adminRoute"     }),
    ];
    const edges  = [makeEdge("mw", "route", "GUARDS")];
    const scores = new Map([["mw", 1.0], ["route", 1.0]]);

    const result = filterNoise(nodes, edges, scores, { nodeMinScore: 3.0 });

    expect(result.edges.find((e) => e.type === "GUARDS")).toBeDefined();
  });

  it("should always keep READS_FROM edges", () => {
    const nodes = [
      makeNode({ id: "comp",  name: "CartButton",   type: "COMPONENT"   }),
      makeNode({ id: "store", name: "useCartStore", type: "STATE_STORE" }),
    ];
    const edges  = [makeEdge("comp", "store", "READS_FROM")];
    const scores = new Map([["comp", 1.0], ["store", 1.0]]);

    const result = filterNoise(nodes, edges, scores, { nodeMinScore: 3.0 });

    expect(result.edges.find((e) => e.type === "READS_FROM")).toBeDefined();
  });

  it("should rescue FILE node if it has a kept child", () => {
    const fileNode  = makeFileNode("src/payment.ts");
    const important = makeNode({
      id: "imp", name: "processPayment", parentFile: fileNode.id,
    });

    const nodes  = [fileNode, important];
    const edges: CodeEdge[] = [];
    const scores = new Map([
      [fileNode.id, 1.0],  // file scores below threshold
      ["imp",       7.0],  // but child is important
    ]);

    const result = filterNoise(nodes, edges, scores, {
      nodeMinScore: 3.0,
      fileMinScore: 2.0,
    });

    // File should be rescued because its child survived
    expect(result.nodes.find((n) => n.id === fileNode.id)).toBeDefined();
  });

  it("should respect UI threshold overrides", () => {
    const nodes = [
      makeNode({ id: "a", name: "funcA" }),
      makeNode({ id: "b", name: "funcB" }),
    ];
    const scores = new Map([["a", 5.0], ["b", 3.5]]);

    // Strict threshold — only a survives
    const strict = filterNoise(nodes, [], scores, { nodeMinScore: 4.0 });
    expect(strict.nodes.length).toBe(1);

    // Loose threshold — both survive
    const loose = filterNoise(nodes, [], scores, { nodeMinScore: 2.0 });
    expect(loose.nodes.length).toBe(2);
  });

  it("should report correct removed counts", () => {
    const nodes = [
      makeNode({ id: "a", name: "funcA" }),
      makeNode({ id: "b", name: "funcB" }),
      makeNode({ id: "c", name: "funcC" }),
    ];
    const edges  = [makeEdge("a", "b", "CALLS")];
    const scores = new Map([["a", 7.0], ["b", 1.0], ["c", 1.0]]);

    const result = filterNoise(nodes, edges, scores, { nodeMinScore: 3.0 });

    expect(result.removedNodeCount).toBe(2);
    expect(result.removedEdgeCount).toBe(1);
  });

});

// ─── Full pipeline ────────────────────────────────────────────────────────────

describe("scoreAndFilter", () => {

  it("should return filtered nodes and edges", () => {
    const nodes = [
      makeFileNode("src/payment.ts"),
      makeNode({
        id: "proc", name: "processPayment",
        endLine: 60, parentFile: "file::src/payment.ts",
        metadata: { apiCalls: ["/api/stripe"], hasErrorHandling: true },
      }),
      makeNode({
        id: "fmt", name: "formatDate",
        endLine: 3, parentFile: "file::src/payment.ts",
        metadata: {},
      }),
    ];
    const edges = [makeEdge("proc", "fmt", "CALLS")];

    const result = scoreAndFilter(nodes, edges);

    expect(result.filteredNodes).toBeDefined();
    expect(result.filteredEdges).toBeDefined();
    expect(result.nodeScores).toBeDefined();
    expect(result.stats).toBeDefined();
  });

  it("should score complex nodes higher than trivial ones", () => {
    const nodes = [
      makeFileNode("src/payment.ts"),
      makeNode({
        id: "complex", name: "processPayment",
        endLine: 80, parentFile: "file::src/payment.ts",
        metadata: { apiCalls: ["/api/stripe"], hasErrorHandling: true },
      }),
      makeNode({
        id: "trivial", name: "formatDate",
        endLine: 3, parentFile: "file::src/payment.ts",
        metadata: {},
      }),
    ];

    const result = scoreAndFilter(nodes, []);

    const complexScore = result.nodeScores.get("complex") ?? 0;
    const trivialScore = result.nodeScores.get("trivial") ?? 0;

    expect(complexScore).toBeGreaterThan(trivialScore);
  });

  it("should include top scoring nodes in stats", () => {
    const nodes = [
      makeFileNode("src/payment.ts"),
      makeNode({
        id: "n", name: "processPayment",
        endLine: 50, parentFile: "file::src/payment.ts",
        metadata: { apiCalls: ["/api/stripe"] },
      }),
    ];

    const result = scoreAndFilter(nodes, []);

    expect(result.stats.topScoringNodes.length).toBeGreaterThan(0);
    expect(result.stats.topScoringNodes[0]).toHaveProperty("name");
    expect(result.stats.topScoringNodes[0]).toHaveProperty("score");
  });

  it("should respect threshold overrides from UI", () => {
    const nodes = [
      makeFileNode("src/payment.ts"),
      makeNode({ id: "a", name: "funcA", endLine: 50, parentFile: "file::src/payment.ts" }),
      makeNode({ id: "b", name: "funcB", endLine: 3,  parentFile: "file::src/payment.ts" }),
    ];

    const strict = scoreAndFilter(nodes, [], { nodeMinScore: 8.0 });
    const loose  = scoreAndFilter(nodes, [], { nodeMinScore: 1.0 });

    expect(strict.filteredNodes.length).toBeLessThan(loose.filteredNodes.length);
  });

});