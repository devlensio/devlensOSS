import type { EdgeType } from "@/lib/types";

/** Short verb used in lists and chips. */
export const EDGE_LABEL: Record<string, string> = {
  CALLS: "Calls",
  USES: "Uses",
  READS_FROM: "Reads",
  WRITES_TO: "Writes",
  HANDLES: "Handles",
  PROP_PASS: "Passes",
  IMPORTS: "Imports",
  EMITS: "Emits",
  LISTENS: "Listens",
  NAVIGATES_TO: "Navigates",
  TESTS: "Tests",
  THROWS: "Throws",
  EXTENDS: "Extends",
  IMPLEMENTS: "Implements",
  EXPORTS: "Exports",
  WRAPPED_BY: "Wrapped by",
  GUARDS: "Guards",
  NEXTJS_API_CALL: "Fetches",
};

/** One sentence per relation, shown as a tooltip on the badge. */
export const EDGE_INFO: Record<string, string> = {
  CALLS: "This node invokes the target inside its own body.",
  USES: "References the target without calling it — a type, constant or import.",
  READS_FROM: "Reads state or data owned by the target.",
  WRITES_TO: "Mutates state or data owned by the target.",
  HANDLES: "Registers the target as an event/callback handler.",
  PROP_PASS: "Passes the target down as a prop, slot or child component.",
  IMPORTS: "Imports the target's module.",
  EMITS: "Emits an event that the target listens for.",
  LISTENS: "Subscribes to an event emitted by the target.",
  NAVIGATES_TO: "Navigation target — a URL this node routes to.",
  TESTS: "A test that exercises the target.",
  THROWS: "Throws or raises the target's error type.",
  EXTENDS: "Inherits from the target class.",
  IMPLEMENTS: "Implements the target interface or trait.",
  EXPORTS: "Re-exports the target from this module.",
  WRAPPED_BY: "Wrapped by the target (higher-order component or decorator).",
  GUARDS: "Middleware or guard that protects the target.",
  NEXTJS_API_CALL: "Calls the target Next.js API route over HTTP.",
};

/** Long form for the relation chips in the overview. */
export const EDGE_VERB: Record<string, string> = {
  CALLS: "calls",
  USES: "uses",
  READS_FROM: "reads from",
  WRITES_TO: "writes to",
  HANDLES: "handles",
  PROP_PASS: "passes",
  IMPORTS: "imports",
  EMITS: "emits to",
  LISTENS: "listens to",
  NAVIGATES_TO: "navigates to",
  TESTS: "tests",
  THROWS: "throws",
  EXTENDS: "extends",
  IMPLEMENTS: "implements",
  EXPORTS: "exports",
  WRAPPED_BY: "wrapped by",
  GUARDS: "guards",
  NEXTJS_API_CALL: "fetches",
};

/** Groups used to order the relation chips consistently across panels. */
export const EDGE_ORDER: EdgeType[] = [
  "CALLS",
  "PROP_PASS",
  "USES",
  "HANDLES",
  "EMITS",
  "LISTENS",
  "READS_FROM",
  "WRITES_TO",
  "NAVIGATES_TO",
  "NEXTJS_API_CALL",
  "TESTS",
  "IMPORTS",
  "EXPORTS",
  "EXTENDS",
  "IMPLEMENTS",
  "THROWS",
  "GUARDS",
  "WRAPPED_BY",
];

export interface MarkerInfo {
  label: string;
  tone: "blue" | "amber" | "green" | "violet" | "pink" | "teal" | "grey";
  info: string;
}

/** Markers a resolved call can carry, in reading order. */
export function markerList(call: {
  awaited?: boolean;
  defer?: string;
  deferDetail?: string;
  conc?: boolean;
  repeat?: boolean;
  maybe?: boolean;
  orders?: number[];
  conditional?: boolean;
  renderCount?: number;
}): MarkerInfo[] {
  const out: MarkerInfo[] = [];
  if (call.awaited)
    out.push({
      label: "await",
      tone: "blue",
      info: "The caller suspends here until this call settles.",
    });
  if (call.defer)
    out.push({
      label: call.deferDetail ? `${call.defer}: ${call.deferDetail}` : call.defer,
      tone: call.defer === "onReturn" ? "green" : call.defer === "timer" ? "amber" : "violet",
      info:
        call.defer === "timer"
          ? "Scheduled on a timer — runs after the current frame returns."
          : call.defer === "onReturn"
            ? "Runs when the frame exits, in reverse order of registration (defer, finally, Drop)."
            : call.defer === "postRender"
              ? "Runs after the framework commits the render (useEffect, onMounted, afterRender)."
              : call.defer === "event"
                ? "Dispatched to an event listener — runs when that event fires."
                : call.defer === "microtask"
                  ? "Queued as a microtask — runs right after the current frame, before timers."
                  : "Detached from the frame: resolves later asynchronously.",
    });
  if (call.conc)
    out.push({
      label: "concurrent",
      tone: "pink",
      info: "May run on another thread or task (spawn, go, thread, worker).",
    });
  if (call.repeat)
    out.push({
      label: "loop",
      tone: "teal",
      info: "May run 0..N times — inside a loop or an iteration callback.",
    });
  if (call.maybe)
    out.push({
      label: "maybe",
      tone: "grey",
      info: "Guarded by a branch, early exit, or optional chain — may not run at all.",
    });
  if (call.conditional)
    out.push({
      label: "conditional",
      tone: "amber",
      info: "Rendered only when the surrounding condition holds.",
    });
  if (call.renderCount && call.renderCount > 1)
    out.push({
      label: `×${call.renderCount}`,
      tone: "pink",
      info: `Written ${call.renderCount} times in this component; each occurrence renders it once.`,
    });
  if (call.orders && call.orders.length > 1)
    out.push({
      label: `×${call.orders.length}`,
      tone: "pink",
      info: `Reached from ${call.orders.length} separate call sites in this node.`,
    });
  return out;
}

export const MARKER_TONES: Record<MarkerInfo["tone"], { text: string; bg: string; border: string }> = {
  blue:   { text: "#1d4ed8", bg: "rgba(29,78,216,0.08)",  border: "rgba(29,78,216,0.22)" },
  amber:  { text: "#b45309", bg: "rgba(180,83,9,0.08)",   border: "rgba(180,83,9,0.22)" },
  green:  { text: "#15803d", bg: "rgba(21,128,61,0.08)",  border: "rgba(21,128,61,0.22)" },
  violet: { text: "#6d28d9", bg: "rgba(109,40,217,0.08)", border: "rgba(109,40,217,0.22)" },
  pink:   { text: "#be185d", bg: "rgba(190,24,93,0.08)",  border: "rgba(190,24,93,0.22)" },
  teal:   { text: "#0e766e", bg: "rgba(14,118,110,0.08)", border: "rgba(14,118,110,0.22)" },
  grey:   { text: "#57534e", bg: "rgba(87,83,78,0.08)",   border: "rgba(87,83,78,0.2)" },
};