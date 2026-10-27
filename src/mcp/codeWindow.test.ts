// get_node code windows — pure slicing contract.
//
// These tests exercise the renderer directly: no graph, no storage, no model.
// That is the point of the design — the tool already holds the source (stored
// rawCode or the disk fallback), so paging must never trigger a re-analysis.

import { describe, test, expect } from "bun:test";
import {
  CODE_WINDOW_DEFAULT,
  CODE_WINDOW_MAX,
  renderCodeWindow,
  validateCodeWindowRequest,
} from "./codeWindow.js";

const makeCode = (n: number): string =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

describe("renderCodeWindow — default window", () => {
  test("shows the first 120 raw lines, numbers them, and offers the next window", () => {
    const res = renderCodeWindow(makeCode(300), {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 309,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.from).toBe(10);
    expect(res.to).toBe(10 + CODE_WINDOW_DEFAULT - 1);
    expect(res.total).toBe(300);
    expect(res.truncated).toBe(true);
    expect(res.next).toEqual([130, 249]);
    expect(res.text).toContain(`CODE src/a.ts:10-129 (node 10-309, 300 lines)`);
    expect(res.text).toContain(" 10| line 1");
    expect(res.text).toContain("129| line 120");
    expect(res.text).toContain("showing 10-129 of 10-309");
    expect(res.text).toContain("next: codeLines [130, 249]");
  });

  test("short node is returned whole: no banner, no next hint", () => {
    const res = renderCodeWindow(makeCode(5), {
      filePath: "src/a.ts",
      startLine: 1,
      endLine: 5,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.from).toBe(1);
    expect(res.to).toBe(5);
    expect(res.total).toBe(5);
    expect(res.truncated).toBe(false);
    expect(res.next).toBeUndefined();
    expect(res.text).toContain("CODE src/a.ts:1-5 (node 1-5, 5 lines)");
    expect(res.text).toContain("1| line 1");
    expect(res.text).toContain("5| line 5");
    expect(res.text).not.toContain("showing");
    expect(res.text).not.toContain("next:");
  });
});

describe("renderCodeWindow — explicit window", () => {
  test("returns exactly the requested absolute file lines", () => {
    const res = renderCodeWindow(makeCode(300), {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 309,
      window: [100, 159],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.from).toBe(100);
    expect(res.to).toBe(159);
    expect(res.total).toBe(300);
    expect(res.truncated).toBe(true);
    expect(res.next).toEqual([160, 219]); // same 60-line step
    expect(res.text).toContain("CODE src/a.ts:100-159 (node 10-309, 300 lines)");
    expect(res.text).toContain("100| line 91");
    expect(res.text).toContain("159| line 150");
    expect(res.text).toContain("showing 100-159 of 10-309");
    expect(res.text).toContain("next: codeLines [160, 219]");
  });

  test("clamps the window to the node span", () => {
    const res = renderCodeWindow(makeCode(300), {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 309,
      window: [1, 10_000],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.from).toBe(10);
    expect(res.to).toBe(309);
    expect(res.truncated).toBe(false);
    expect(res.next).toBeUndefined();
    expect(res.text).not.toContain("showing");
  });

  test("caps an oversized window at 400 lines and says so", () => {
    const res = renderCodeWindow(makeCode(2000), {
      filePath: "src/a.ts",
      startLine: 1,
      endLine: 2000,
      window: [1, 1000],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.from).toBe(1);
    expect(res.to).toBe(CODE_WINDOW_MAX);
    expect(res.truncated).toBe(true);
    expect(res.next).toEqual([401, 800]);
    expect(res.text).toContain(`window capped at ${CODE_WINDOW_MAX} of 1000 requested lines`);
    expect(res.text).toContain("showing 1-400 of 1-2000");
    expect(res.text).toContain("next: codeLines [401, 800]");
  });

  test("rejects a window that does not overlap the node", () => {
    const res = renderCodeWindow(makeCode(300), {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 309,
      window: [500, 600],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("does not overlap");
  });

  test("rejects a reversed window", () => {
    const res = renderCodeWindow(makeCode(300), {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 309,
      window: [200, 100],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("must be <=");
  });
});

describe("renderCodeWindow — exactness", () => {
  test("preserves blank lines 1:1 instead of compacting them away", () => {
    const code = ["function f() {", "", "  return 1;", "", "}"].join("\n");
    const res = renderCodeWindow(code, {
      filePath: "src/a.ts",
      startLine: 7,
      endLine: 11,
      window: [8, 10],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.total).toBe(5);
    expect(res.from).toBe(8);
    expect(res.to).toBe(10);
    // File line 8 is the blank line, 9 the body, 10 the blank line after it.
    expect(res.text).toContain(" 8| \n 9|   return 1;\n10| ");
  });

  test("never emits a line past the source it was given (stale span)", () => {
    const res = renderCodeWindow(makeCode(3), {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 100,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.from).toBe(10);
    expect(res.to).toBe(12);
    expect(res.total).toBe(3);
    expect(res.truncated).toBe(false);
  });

  test("renders from the source text alone — no graph or reindex step", () => {
    // A stored rawCode body is all this needs; the tool path is
    // getNodeCodeFor (rawCode or disk) -> renderCodeWindow, with no pipeline call.
    const res = renderCodeWindow("const x = 1;\nconst y = 2;", {
      filePath: "src/a.ts",
      startLine: 50,
      endLine: 51,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toContain("50| const x = 1;");
    expect(res.text).toContain("51| const y = 2;");
  });
});

describe("validateCodeWindowRequest", () => {
  test("codeLines without include:['code'] is rejected", () => {
    expect(validateCodeWindowRequest(false, [1, 2])).toBe(
      "codeLines requires include: ['code']."
    );
  });

  test("reversed range is rejected before the graph is touched", () => {
    expect(validateCodeWindowRequest(true, [5, 4])).toBe(
      "codeLines start (5) must be <= end (4)."
    );
  });

  test("valid and absent requests pass", () => {
    expect(validateCodeWindowRequest(true, [1, 2])).toBeUndefined();
    expect(validateCodeWindowRequest(true, undefined)).toBeUndefined();
    expect(validateCodeWindowRequest(false, undefined)).toBeUndefined();
  });
});
