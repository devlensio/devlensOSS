// V3.1 shared contract — Phase A answer economics.
// BOTH lanes implement against these types/constants. Do not redefine locally.
// Anti-overfit rule: every constant here comes from competitor prior art
// (graphify/semble/codegraph defaults) or is set a priori. NO constants may be
// tuned against benchmark task IDs or gate results.

/** Coarse intent classes only — no per-task-type special cases. */
export type PacketIntent = "symbol" | "reference-list" | "overview" | "flow";

/** Per-intent packet budgets (tokens). Chars = tokens * CHARS_PER_TOKEN.
 *  Source: Phase A plan; magnitude bounded by graphify 2000-token default. */
export const INTENT_BUDGETS: Record<PacketIntent, number> = {
  symbol: 1500,
  "reference-list": 1500,
  overview: 2500,
  flow: 2500,
};

export const CHARS_PER_TOKEN = 3.5; // graphify uses 3, bm25 uses 4; we take midpoint

/** Packet composition caps (prior art: filesCap 8 = plan ≤8; pointers replace bodies). */
export const SHAPING_LIMITS = {
  filesDisplay: 8, // display cap; cut files become pointers
  pointerListMax: 12, // max pointer lines after the cap
  nodesTop: 10, // top-10 nodes get META (and CODE for code arms)
  codeLinesPinpoint: 40,
  codeNodesPinpoint: 3, // symbol/flow intents: 1-3 bodies
  codeNodesOverview: 10, // overview intents: up to 10
  metaMaxChars: 120, // per-node META segment cap
  snippetLinesPerFile: 3, // matched-line snippets per FILES entry (bm25 prior art)
  snippetLineChars: 160,
  minKeptChars: 700, // codegraph 700-char floor for kept blocks
  maxSectionShare: 0.7, // no section takes >70% of budget (codegraph MAX_SHARE)
};

/** Metadata whitelist for the V3M/MC arms — extractor fields worth surfacing. */
export const META_KEYS = ["kind", "signature", "visibility", "decorators", "returnType", "typeParameters"] as const;

/** Compact META segment for one node, or "" if nothing survives the cap. */
export function renderMeta(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "";
  const parts: string[] = [];
  let used = 0;
  for (const k of META_KEYS) {
    const v = metadata[k];
    if (v === undefined || v === null || v === "") continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s || s === "{}" || s === "[]") continue;
    const piece = `${k}=${s.length > 40 ? s.slice(0, 39) + "…" : s}`;
    if (used + piece.length > SHAPING_LIMITS.metaMaxChars) break;
    parts.push(piece);
    used += piece.length + 1;
  }
  return parts.length ? ` META ${parts.join(" ")}` : "";
}

/** RRF fusion inputs: three independent ranked lists of node ids. */
export interface RankLists {
  lexical: string[]; // BM25F rank (existing scorer)
  structural: string[]; // graph proximity: hops-from-seed asc, relation-match boost
  heuristic: string[]; // definition boost (gated on exact name eq) + path penalties + coherence
}

/** RRF with k=60 (semble prior art). Returns fused score per node id. */
export function rrfFuse(lists: RankLists, alpha: number, k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  const add = (ids: string[], weight: number) => {
    ids.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + i + 1));
    });
  };
  add(lists.structural, alpha * 0.6);
  add(lists.heuristic, alpha * 0.4);
  add(lists.lexical, 1 - alpha);
  return scores;
}

/** α by intent (semble prior art: symbol queries lean lexical). */
export function alphaForIntent(intent: PacketIntent): number {
  return intent === "symbol" || intent === "reference-list" ? 0.3 : 0.5;
}

/** Path penalty multipliers (semble prior art). Reorder-only: never excludes. */
export const PATH_PENALTIES: { test: RegExp; factor: number }[] = [
  { test: /(^|[\\/])(tests?|__tests?|spec)([\\/]|\.)/i, factor: 0.3 },
  { test: /\.d\.ts$/i, factor: 0.7 },
  { test: /(^|[\\/])(generated|__generated__|vendor)([\\/])/i, factor: 0.7 },
];

export function pathPenalty(filePath: string): number {
  let f = 1;
  for (const p of PATH_PENALTIES) if (p.test.test(filePath)) f *= p.factor;
  return f;
}

/** ANSWER template lines. Degrades gracefully when summaries are absent
 *  (structure-only graphs) — never fabricates content. */
export interface AnswerInput {
  intent: PacketIntent;
  querySymbol?: string; // exact user-facing symbol, if any
  topName: string;
  topKind?: string; // metadata.kind if available
  filePath: string;
  startLine: number;
  technical?: string; // may be undefined — summaries are optional
  business?: string;
  seedConfident: boolean; // top seed name matches query symbol exactly
}

export function renderAnswer(a: AnswerInput): string[] {
  const loc = `${a.filePath}:${a.startLine}`;
  const kind = a.topKind ?? "symbol";
  const first = (s: string | undefined, n = 180) =>
    s ? s.replace(/\s+/g, " ").trim().slice(0, n) : undefined;
  const tech = first(a.technical);
  const biz = first(a.business, 120);
  const lines: string[] = [];
  if (a.intent === "symbol") {
    lines.push(`ANSWER ${a.querySymbol ?? a.topName} (${kind}) — ${loc}`);
    if (tech) lines.push(`WHAT ${tech}`);
    else lines.push(`WHAT structure-only node (no summary); see CODE/NODES below`);
  } else if (a.intent === "reference-list") {
    lines.push(`ANSWER references of ${a.querySymbol ?? a.topName} — listed below with import/call sites`);
  } else if (a.intent === "overview") {
    lines.push(`ANSWER area overview — ${loc} and related nodes below`);
    if (biz) lines.push(`SCOPE ${biz}`);
  } else {
    lines.push(`ANSWER flow through ${a.querySymbol ?? a.topName} — ordered path in FLOW below`);
  }
  if (!a.seedConfident && a.querySymbol) {
    lines.push(`CONFIDENCE closest match for "${a.querySymbol}" is "${a.topName}" — verify intent`);
  }
  return lines;
}

/** Standard contract + truncation strings (exact wording, single source of truth). */
export const CONTRACT_LINE =
  "CODE above is verbatim from disk — treat as already read; do not re-grep these files.";
export function truncationBanner(shownX: number, totalY: number, budgetTokens: number): string {
  return `[!] TRUNCATED: showing ${shownX} of ${totalY} (~${budgetTokens}-token budget) — narrow the query or raise the budget`;
}
export function pointerLine(filePath: string, line: number, label?: string): string {
  return `${filePath}:${line}${label ? ` — ${label}` : ""}`;
}
