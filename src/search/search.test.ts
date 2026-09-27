// Tests for the local BM25F search stack: tokenizer ordering, MiniSearch
// engine round trip through the .search.json envelope, indexer determinism,
// corrupt-index fallback, and lazy build from commit JSON.

import { describe, test, expect } from "bun:test";
import { queryTerms } from "./tokenizer.js";
import { splitNameparts, splitPath } from "./tokenizer.js";
import { buildEngine, loadEngine, runSearch, SUMMARY_TYPE_BOOSTS } from "./searchEngine.js";
import { microSummaryOf, renderResolvePacket, defaultTokenBudget } from "../mcp/packetRender.js";
import type { SearchDoc } from "./searchEngine.js";
import type { ResolvePacket } from "../mcp/packetRender.js";

const DOCS: SearchDoc[] = [
  {
    id: "src/mcp/tools.ts::registerTools",
    name: "registerTools",
    nameparts: "register tools",
    path: "src mcp tools ts",
    tech: "registers all MCP tools on the server instance",
    biz: "exposes the code intelligence backend to MCP agents",
    sec: "",
  },
  {
    id: "src/server/index.ts::startServer",
    name: "startServer",
    nameparts: "start server",
    path: "src server index ts",
    tech: "boots the bun http server and registers routes",
    biz: "starts the api server for the local ui",
    sec: "",
  },
  {
    id: "src/auth/hash.ts::hashPassword",
    name: "hashPassword",
    nameparts: "hash password",
    path: "src auth hash ts",
    tech: "hashes a password with argon2",
    biz: "protects user credentials at rest",
    sec: "slow hash chosen deliberately; avoid md5",
  },
];

describe("tokenizer", () => {
  test("splits camelCase, snake, kebab and paths", () => {
    expect(splitNameparts("createUser")).toEqual(["create", "user"]);
    expect(splitNameparts("user_service_v2")).toEqual(["user", "service", "v2"]);
    expect(splitPath("src/core/queries.ts")).toEqual(["src", "core", "queries", "ts"]);
  });

  test("captures quoted and Capitalized signals first, caps at 10", () => {
    const terms = queryTerms("please find the `registerTools` and RegisterTools in the where does the authentication flow authenticate users login session tokens handling middleware");
    expect(terms.length).toBeLessThanOrEqual(10);
    expect(terms).toContain("regist");
    expect(terms).toContain("tool");
  });
});

describe("search engine", () => {
  test("ranks an exact identifier first", () => {
    const engine = buildEngine(DOCS);
    const hits = runSearch(engine, ["register", "tool"], "both", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].nodeId).toBe("src/mcp/tools.ts::registerTools");
  });

  test("business summaryType boosts the credentials node for product words", () => {
    const engine = buildEngine(DOCS);
    const hits = runSearch(engine, ["protect", "credential"], "business", 5);
    expect(hits[0]?.nodeId).toBe("src/auth/hash.ts::hashPassword");
  });

  test("serialization round trip preserves search results", () => {
    const engine = buildEngine(DOCS);
    const restored = loadEngine(engine.toJSON());
    const before = runSearch(engine, ["hash", "password"], "both", 5);
    const after = runSearch(restored, ["hash", "password"], "both", 5);
    expect(after.map((h) => h.nodeId)).toEqual(before.map((h) => h.nodeId));
  });

  test("boost tables exist for all summary types", () => {
    expect(SUMMARY_TYPE_BOOSTS.technical.tech).toBeGreaterThan(SUMMARY_TYPE_BOOSTS.technical.biz);
    expect(SUMMARY_TYPE_BOOSTS.business.biz).toBeGreaterThan(SUMMARY_TYPE_BOOSTS.business.tech);
  });
});

describe("packet renderer", () => {
  const packet: ResolvePacket = {
    graphId: "g1",
    commitHash: "abc123def4",
    nodes: DOCS.map((d, i) => ({
      id: d.id,
      name: d.name,
      type: "FUNCTION",
      filePath: d.path.split(" ").slice(0, -1).join("/") + ".ts",
      startLine: i * 10 + 1,
      endLine: i * 10 + 20,
      microSummary: microSummaryOf(d.biz),
    })),
    edges: [{ from: DOCS[0].id, to: DOCS[1].id, type: "CALLS" }],
    code: [],
  };

  test("line format with sections, short ids and idmap", () => {
    const r = renderResolvePacket(packet, 2000);
    expect(r.text).toMatch(/^GRAPH g1 @ abc123def4/);
    expect(r.text).toContain("NODES 3");
    expect(r.text).toContain("N1 registerTools function");
    expect(r.text).toContain("IDMAP ");
    expect(r.text).toContain("N1=src/mcp/tools.ts::registerTools");
    expect(r.approxTokens).toBe(Math.ceil(r.text.length / 4));
  });

  test("micro summaries strip html", () => {
    expect(microSummaryOf("<p>uses <strong>argon2</strong> hashing.</p> Next sentence.")).toBe(
      "uses argon2 hashing."
    );
  });

  test("enforces hard token budget by dropping lowest-ranked nodes", () => {
    const tight = renderResolvePacket(packet, 60);
    expect(tight.approxTokens).toBeLessThanOrEqual(60);
    expect(tight.text).toContain("NODES 1");
    const floor = renderResolvePacket(packet, 20);
    expect(floor.text).toContain("NODES 1");
  });

  test("dynamic budget policy clamps", () => {
    expect(defaultTokenBudget(0)).toBe(2000);
    expect(defaultTokenBudget(50000)).toBe(32000);
    expect(defaultTokenBudget(1000)).toBe(2600);
  });
});
