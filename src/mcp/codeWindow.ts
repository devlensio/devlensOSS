// get_node code windows — absolute 1-based file-line slicing.
//
// The packet path (packetRender.compactCodeLines) deliberately dedents and
// drops blank lines to save wire cost. That is fine for a short preview, but it
// destroys the mapping back to file lines — exactly what a drill-in tool needs.
// This module slices the raw source 1:1 so:
//   - every rendered line carries its absolute file line number;
//   - the "showing X-Y of A-B" banner is exact;
//   - the `next:` hint is a real, callable codeLines value.
//
// Pure string in / text out: no storage, no resolver, no graph access, and no
// re-analysis. The caller passes whatever source it already has (stored
// rawCode or the disk fallback from getNodeCodeFor).

export const CODE_WINDOW_DEFAULT = 120;
export const CODE_WINDOW_MAX = 400;

export interface CodeWindowOptions {
  filePath: string;
  /** Node span, absolute 1-based inclusive. Used to clamp the window. */
  startLine: number;
  endLine: number;
  /** Absolute 1-based inclusive window. Defaults to the first 120 lines. */
  window?: readonly [number, number];
  defaultLines?: number;
  maxLines?: number;
}

export type CodeWindowResult =
  | {
      ok: true;
      text: string;
      /** First/last absolute file line emitted. */
      from: number;
      to: number;
      /** Number of source lines available inside the node span. */
      total: number;
      truncated: boolean;
      /** Next window to request, or undefined when the node is fully shown. */
      next?: [number, number];
    }
  | { ok: false; error: string };

/** Fast request-level validation — runs before the graph is touched. */
export function validateCodeWindowRequest(
  wantCode: boolean,
  codeLines?: readonly [number, number]
): string | undefined {
  if (codeLines && !wantCode) {
    return "codeLines requires include: ['code'].";
  }
  if (codeLines && codeLines[0] > codeLines[1]) {
    return `codeLines start (${codeLines[0]}) must be <= end (${codeLines[1]}).`;
  }
  return undefined;
}

export function renderCodeWindow(code: string, opts: CodeWindowOptions): CodeWindowResult {
  const raw = code.split("\n").map((line) => line.replace(/\r$/, ""));

  const nodeStart = Math.max(1, Math.trunc(opts.startLine));
  const nodeEnd = Math.max(nodeStart, Math.trunc(opts.endLine));
  // The stored span is authoritative for file coordinates, but never emit a
  // line the source string does not contain (stale span / truncated rawCode).
  const last = Math.min(nodeEnd, nodeStart + raw.length - 1);
  const total = last - nodeStart + 1;
  if (total <= 0) {
    return { ok: false, error: "node has no source lines to show." };
  }

  const maxLines = Math.max(1, Math.trunc(opts.maxLines ?? CODE_WINDOW_MAX));
  const defaultLines = Math.max(
    1,
    Math.min(Math.trunc(opts.defaultLines ?? CODE_WINDOW_DEFAULT), maxLines)
  );

  let from: number;
  let to: number;
  let requestedSize: number;

  if (opts.window) {
    const [rawFrom, rawTo] = opts.window;
    if (!Number.isFinite(rawFrom) || !Number.isFinite(rawTo)) {
      return { ok: false, error: "codeLines must be two finite integers: [start, end]." };
    }
    const reqFrom = Math.trunc(rawFrom);
    const reqTo = Math.trunc(rawTo);
    if (reqFrom > reqTo) {
      return { ok: false, error: `codeLines start (${reqFrom}) must be <= end (${reqTo}).` };
    }
    if (reqFrom > last || reqTo < nodeStart) {
      return {
        ok: false,
        error: `codeLines [${reqFrom}, ${reqTo}] does not overlap the node span (${nodeStart}-${last}).`,
      };
    }
    from = Math.max(nodeStart, reqFrom);
    to = Math.min(last, reqTo);
    requestedSize = to - from + 1;
  } else {
    from = nodeStart;
    to = Math.min(last, nodeStart + defaultLines - 1);
    requestedSize = to - from + 1;
  }

  // Cap the emitted window, but say so in the banner — never truncate silently.
  const capped = requestedSize > maxLines;
  if (capped) to = from + maxLines - 1;

  const step = opts.window ? Math.min(requestedSize, maxLines) : defaultLines;
  const truncated = to < last;
  const next: [number, number] | undefined = truncated
    ? [to + 1, Math.min(last, to + step)]
    : undefined;

  const gutter = String(to).length;
  const body = raw
    .slice(from - nodeStart, to - nodeStart + 1)
    .map((line, i) => `${String(from + i).padStart(gutter, " ")}| ${line}`)
    .join("\n");

  const header = `CODE ${opts.filePath}:${from}-${to} (node ${nodeStart}-${nodeEnd}, ${total} lines)`;
  const notes = [`showing ${from}-${to} of ${nodeStart}-${last}`];
  if (capped) notes.push(`window capped at ${maxLines} of ${requestedSize} requested lines`);
  if (next) {
    const remaining = last - to;
    notes.push(
      `${remaining} line${remaining === 1 ? "" : "s"} remain — next: codeLines [${next[0]}, ${next[1]}]`
    );
  }

  return {
    ok: true,
    text: [header, body, ...(truncated ? [`(${notes.join("; ")})`] : [])].join("\n"),
    from,
    to,
    total,
    truncated,
    next,
  };
}
