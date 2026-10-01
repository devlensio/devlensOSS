import { describe, test, expect } from "bun:test";
import { handleFatal, isExitPromptError } from "./fatal.js";

function mkDeps(argv: string[] = []) {
  const err: string[] = [];
  const out: string[] = [];
  const codes: number[] = [];
  return {
    err,
    out,
    codes,
    deps: {
      argv,
      writeErr: (s: string) => err.push(s),
      writeOut: (s: string) => out.push(s),
      exit: (c: number) => codes.push(c),
    },
  };
}

const exitPrompt = Object.assign(new Error("User force closed the prompt with SIGINT"), {
  name: "ExitPromptError",
});

describe("isExitPromptError", () => {
  test("detects inquirer's ExitPromptError by name and by message", () => {
    expect(isExitPromptError(exitPrompt)).toBe(true);
    expect(isExitPromptError(new Error("User force closed the prompt with SIGINT"))).toBe(true);
    expect(isExitPromptError(new Error("boom"))).toBe(false);
    expect(isExitPromptError(null)).toBe(false);
    expect(isExitPromptError("str")).toBe(false);
  });
});

describe("handleFatal (issues 1 + 2)", () => {
  test("Ctrl+C in a prompt → 'Cancelled.', exit 130, NO stack", () => {
    const { err, out, codes, deps } = mkDeps();
    handleFatal(exitPrompt, deps);
    expect(err.join("")).toBe("\nCancelled.\n");
    expect(out).toHaveLength(0);
    expect(codes).toEqual([130]);
  });

  test("plain error → message only (no 'at …' stack frames), exit 1", () => {
    const { err, codes, deps } = mkDeps();
    const e = new Error("DevLens config error: boom");
    handleFatal(e, deps);
    expect(err.join("")).toBe("✖ DevLens config error: boom\n");
    expect(err.join("")).not.toContain("at ");
    expect(codes).toEqual([1]);
  });

  test("--verbose includes the stack", () => {
    const { err, deps } = mkDeps(["--verbose"]);
    handleFatal(new Error("boom"), deps);
    expect(err.join("")).toContain("boom");
    expect(err.join("")).toContain("    at ");
  });

  test("--json puts {error} on STDOUT, nothing on stderr", () => {
    const { err, out, deps } = mkDeps(["analyze", "--json"]);
    handleFatal(new Error("boom"), deps);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toEqual({ error: "boom" });
    expect(err).toHaveLength(0);
  });

  test("non-Error values stringify", () => {
    const { err, deps } = mkDeps();
    handleFatal({ weird: true }, deps);
    expect(err.join("")).toContain("[object Object]");
  });
});
