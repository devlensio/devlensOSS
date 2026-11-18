import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeRepo, resolveContext, getNodeDetail, findSymbols } from "../core/queries.js";
import * as tools from "./tools.js";
import { storage } from "devlensio";

// End to end: a real analysis of a real temp repo, then the two surfaces the MCP
// exposes (resolve_context packet and get_node detail). This is the test that proves
// the ordering reaches the agent, not just the helper functions.

function createRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlens-e2e-callorder-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const SOURCE = `
export function first(x: number): number { return x + 1; }
export function second(x: number): number { return x * 2; }
export function third(x: number): number { return x - 1; }

export function run(input: number): number {
  const a = first(input);
  const b = second(a);
  const c = first(b);
  return third(c);
}
`;

describe("callOrder reaches the MCP output", () => {
  test("packet and node detail expose declared call order", async () => {
    const repo = createRepo({
      "package.json": JSON.stringify({ name: "e2e-fixture", version: "1.0.0" }),
      "src/flow.ts": SOURCE,
    });
    let graphId: string | undefined;
    try {
      const analyzed = await analyzeRepo(repo);
      graphId = analyzed.graphId;

      const found = findSymbols(graphId, { query: "run", limit: 5 });
      const runId = found.symbols.find((s: any) => s.name === "run")?.nodeId;
      expect(runId).toBeDefined();

      const packet = String(
        resolveContext(graphId, {
          task: "trace what run() calls and in what order",
          intent: "flow",
          focus: [runId!],
        }).packet,
      );

      // The ordering marker and the real call-site line.
      expect(packet).toMatch(/\[#\d+(?:,#\d+)*\]/);
      expect(packet).toMatch(/at=[\w./-]+\.ts:\d+/);

      const detail = getNodeDetail(graphId, runId!, ["callees", "metadata"]) as {
        callees?: Array<{ id: string; name?: string }>;
        metadata?: { resolvedCalls?: Array<{ name: string; firstOrder?: number }> };
      };

      // `first` is the first call site, `third` the last one.
      const names = (detail.callees ?? []).map((c) => c.name);
      expect(names[0]).toBe("first");
      expect(names).toContain("third");

      // Callee refs carry their position, so the agent does not need a second
      // call to learn the order, and the renderer prints it as `#n`.
      const first = (detail.callees ?? []).find((c) => c.name === "first") as any;
      expect(first?.order).toBe(1);

      const rendered = tools.renderGraphNode(
        { ...(getNodeDetail(graphId, runId!, ["callees", "metadata"]) as any) },
        "src/flow.ts",
        "1-20"
      );
      expect(rendered).toMatch(/CALLEES \d+\n  #1 first/);
      expect(rendered).toContain("ORDER #n = position of the call inside this node");

      const ordered = (detail.metadata?.resolvedCalls ?? []).filter((c) => c.firstOrder !== undefined);
      expect(ordered.length).toBeGreaterThanOrEqual(3);
      expect(ordered.some((c) => c.name === "first" && c.firstOrder === 1)).toBe(true);
    } finally {
      if (graphId) storage.deleteGraph(graphId);
      fs.rmSync(repo, { recursive: true, force: true });
    }
  }, 120_000);
});
