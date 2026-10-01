import { describe, test, expect } from "bun:test";
import { EventEmitter } from "node:events";
import { JobProgress, clampPct, makeBar, makeBarLine, type ProgressIO } from "./progress.js";

interface Recorded {
  out: string[];
  info: string[];
  success: string[];
  warn: string[];
}

function mkIO(): { io: ProgressIO; rec: Recorded } {
  const rec: Recorded = { out: [], info: [], success: [], warn: [] };
  return {
    rec,
    io: {
      out: (s) => rec.out.push(s),
      info: (s) => rec.info.push(s),
      success: (s) => rec.success.push(s),
      warn: (s) => rec.warn.push(s),
    },
  };
}

function mkQueue() {
  return {
    pauseJob: () => true,
    resumeJob: () => true,
    cancelJob: () => true,
  };
}

function setup(opts: { tty?: boolean; json?: boolean } = {}) {
  const { io, rec } = mkIO();
  const input = new EventEmitter() as EventEmitter & { isTTY?: boolean; setRawMode?: (on: boolean) => void };
  input.isTTY = opts.tty ?? true;
  const rawModes: boolean[] = [];
  input.setRawMode = (on) => rawModes.push(on);
  const interrupts: number[] = [];
  const calls: string[] = [];
  const queue = {
    pauseJob: () => (calls.push("pause"), true),
    resumeJob: () => (calls.push("resume"), true),
    cancelJob: () => (calls.push("cancel"), true),
  };
  const p = new JobProgress({
    jobId: "j1",
    queue,
    io,
    input: input as never,
    json: opts.json ?? false,
    onInterrupt: () => interrupts.push(1),
    throttleMs: 0,
  });
  return { p, rec, input, calls, interrupts, rawModes };
}

describe("bar math", () => {
  test("clampPct", () => {
    expect(clampPct(50, 100)).toBe(50);
    expect(clampPct(0, 0)).toBe(0);
    expect(clampPct(150, 100)).toBe(100);
    expect(clampPct(-5, 100)).toBe(0);
    expect(clampPct(1, 3)).toBe(33);
  });
  test("makeBar fills proportionally", () => {
    expect(makeBar(0, 100, 4)).toBe("[░░░░]");
    expect(makeBar(100, 100, 4)).toBe("[████]");
    expect(makeBar(50, 100, 4)).toBe("[██░░]");
    expect(makeBar(0, 0, 4)).toBe("[░░░░]");
  });
  test("makeBarLine carries counts, percent and node name", () => {
    expect(makeBarLine(42, 512, "foo.bar", 8)).toBe("[█░░░░░░░] 42/512 (8%) — foo.bar");
    expect(makeBarLine(42, 512, undefined, 8)).toBe("[█░░░░░░░] 42/512 (8%)");
    expect(makeBarLine(0, 0)).toBe("[░░░░░░░░░░░░░░░░░░░░░░░░] 0/0 (0%)");
  });
});

describe("event state machine (mirrors webUI JobsPanel)", () => {
  test("analysis spinner → analysis_complete line → summarization bar", () => {
    const { p, rec } = setup();
    p.onEvent({ event: "analysis_started" });
    p.onEvent({ event: "analysis_progress", step: "parse" });
    p.onEvent({ event: "analysis_complete", nodeCount: 10, edgeCount: 4 });
    expect(rec.info.join("\n")).toContain("analysis complete — 10 nodes, 4 edges");

    p.onEvent({ event: "summarization_started", totalNodes: 512 });
    p.onEvent({ event: "summarization_progress", completed: 128, total: 512, nodeName: "x.y" });
    const bars = rec.out.filter((s) => s.includes("Summarizing"));
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[bars.length - 1]).toContain("128/512 (25%)");
    expect(bars[bars.length - 1]).toContain("x.y");
    expect(rec.info.filter((i) => i.includes("[p] pause")).length).toBe(1);
    p.stop();
  });

  test("paused/resumed/cancelled render status (issue 17)", () => {
    const { p, rec } = setup();
    p.onEvent({ event: "summarization_started", totalNodes: 100 });
    p.onEvent({ event: "summarization_progress", completed: 40, total: 100, nodeName: "n" });
    p.onEvent({ event: "paused", completedNodes: 40, totalNodes: 100 });
    expect(rec.out.join("")).toContain("paused [███");
    expect(rec.out.join("")).toContain("[r] resume");
    p.onEvent({ event: "resumed" });
    expect(rec.info.join("")).toContain("resumed — 40/100");
    p.onEvent({ event: "cancelled", cleanedUp: false });
    expect(rec.info.join("")).toContain("cancelled at 40/100");
    expect(rec.info.join("")).toContain("analysis kept");
    p.stop();
  });

  test("summarization_complete success line", () => {
    const { p, rec } = setup();
    p.onEvent({ event: "summarization_started", totalNodes: 10 });
    p.onEvent({ event: "summarization_complete" });
    expect(rec.success).toContain("Summarization complete");
    p.stop();
  });

  test("json mode: absolutely no output", () => {
    const { p, rec } = setup({ json: true });
    p.onEvent({ event: "analysis_started" });
    p.onEvent({ event: "summarization_started", totalNodes: 10 });
    p.onEvent({ event: "summarization_progress", completed: 5, total: 10, nodeName: "n" });
    p.onEvent({ event: "cancelled", cleanedUp: true });
    p.noteInterrupt();
    p.stop();
    expect(rec.out).toHaveLength(0);
    expect(rec.info).toHaveLength(0);
    expect(rec.success).toHaveLength(0);
    expect(rec.warn).toHaveLength(0);
  });

  test("non-TTY: plain lines every 5%, not per-event spam", () => {
    const { p, rec } = setup({ tty: false });
    p.onEvent({ event: "summarization_started", totalNodes: 100 });
    for (let c = 1; c <= 20; c++) p.onEvent({ event: "summarization_progress", completed: c, total: 100 });
    const lines = rec.info.filter((i) => i.startsWith("summarizing "));
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.length).toBeGreaterThan(0);
    expect(rec.out).toHaveLength(0);
    p.stop();
  });
});

describe("keys p/r/c + Ctrl+C", () => {
  test("'p' pauses, 'r' resumes, 'c' cancels via the queue", () => {
    const { p, input, calls } = setup({ tty: true });
    p.onEvent({ event: "summarization_started", totalNodes: 10 });
    (input as EventEmitter).emit("data", Buffer.from("p"));
    (input as EventEmitter).emit("data", Buffer.from("r"));
    (input as EventEmitter).emit("data", Buffer.from("c"));
    expect(calls).toEqual(["pause", "resume", "cancel"]);
    p.stop();
  });

  test("raw 0x03 byte → onInterrupt (graceful cancel), not a crash", () => {
    const { p, input, interrupts } = setup({ tty: true });
    p.onEvent({ event: "summarization_started", totalNodes: 10 });
    (input as EventEmitter).emit("data", Buffer.from([0x03]));
    expect(interrupts).toHaveLength(1);
    p.stop();
  });

  test("raw mode toggles on attach and off on stop", () => {
    const { p, rawModes } = setup({ tty: true });
    p.onEvent({ event: "summarization_started", totalNodes: 10 });
    expect(rawModes).toEqual([true]);
    p.stop();
    expect(rawModes).toEqual([true, false]);
  });

  test("non-TTY: no key handling, no raw mode", () => {
    const { p, input, rawModes } = setup({ tty: false });
    p.onEvent({ event: "summarization_started", totalNodes: 10 });
    expect(rawModes).toHaveLength(0);
    expect((input as EventEmitter).listenerCount("data")).toBe(0);
    p.stop();
  });

  test("interrupt note stops the spinner and warns once", () => {
    const { p, rec } = setup({ tty: true });
    p.onEvent({ event: "analysis_started" });
    p.noteInterrupt();
    expect(rec.warn.join("")).toContain("Cancel requested");
    expect(rec.warn.join("")).toContain("Ctrl+C again to force quit");
    p.stop();
  });
});
