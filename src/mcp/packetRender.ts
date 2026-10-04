// packetRender.ts
//
// Architecture: renders resolve_context responses as line format instead of
// JSON. Measured on the cloud side: JSON inside a text content block costs
// roughly 2x on the wire because quotes re-escape, so the packet IS the wire
// format. Sections have ceiling shares of the token budget; unspent budget
// cascades forward to later sections, then back to NODES.
//
// Flow: ResolvePacket (nodes, flow edges, files, code, sec, idmap, hints)
// -> short ids N1..Nk assigned in rank order -> per-node lines carry only
// name/type/file:lines plus a micro summary (first sentence of the business
// summary, extracted here at pack time, never stored) -> CODE bodies are read
// from local files by the caller and passed in as text -> assemble sections
// under budget -> return { text, approxTokens } with approxTokens = len/4.

import fs from "node:fs";
import {
  CHARS_PER_TOKEN,
  CONTRACT_LINE,
  INTENT_BUDGETS,
  SHAPING_LIMITS,
  pointerLine,
  renderAnswer,
  renderMeta,
  truncationBanner,
  type PacketIntent,
} from "./packet-shape.js";

export const SECTION_SHARES: Record<string, number> = {
  NODES: 0.45,
  FLOW: 0.08,
  FILES: 0.2,
  CODE: 0.35,
  SEC: 0.05,
  IDMAP: 0.1,
  NEXT: 0.02,
};

export const PACKET_LIMITS = {
  filesCap: 200,
  // mcp-compact-test: include code for the top 10 ranked nodes, 40 compacted
  // lines each. Compaction (dedent + blank-line removal) runs BEFORE the cap.
  codeNodes: 10,
  codeLines: 40,
  codeBudgetMs: 2500,
  idmapNodes: 20,
  microSummaryChars: 110,
  flowEdgesCap: 40,
  nodesCap: 60,
};

export interface PacketNode {
  id: string;
  name: string;
  type: string;
  filePath: string;
  startLine: number;
  endLine: number;
  microSummary?: string;
  metadata?: Record<string, unknown>;
}

export interface PacketEdge {
  from: string;
  to: string;
  type: string;
  /** Rendered as at=file:line on FLOW edges (the referencing node's site). */
  edgeSite?: { file: string; line: number };
}

export interface PacketCode {
  nodeId: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface ResolvePacket {
  graphId: string;
  commitHash: string;
  nodes: PacketNode[];
  edges: PacketEdge[];
  code: PacketCode[];
  /** Seed node ids (BM25F/focus hits). Seeds render first and are never cut. */
  seeds?: string[];
  /** File-level importers for reference-list intents (import-site joins). */
  importerFiles?: { filePath: string; line?: number }[];
  /** Name ambiguity across files: never silently picked. */
  ambiguous?: boolean;
  rivalFiles?: string[];
  nextHint?: string;
  notes?: string[];
}

/** Optional render options. Passing opts switches the budget basis from the
 *  caller's tokenBudget to the intent budget from packet-shape.ts. */
export interface RenderOpts {
  intent?: PacketIntent;
  includeMeta?: boolean;
  querySymbol?: string;
  /** Stage-2 experiment flag: false omits the CODE section entirely. */
  includeCode?: boolean;
}

export interface RenderedPacket {
  text: string;
  approxTokens: number;
}

export function microSummaryOf(text: string | undefined, max = PACKET_LIMITS.microSummaryChars): string | undefined {
  if (!text) return undefined;
  const stripped = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return undefined;
  const sentence = stripped.split(/(?<=[.!?])\s/)[0] ?? stripped;
  const chosen = sentence.length >= 8 ? sentence : stripped;
  return chosen.length > max ? chosen.slice(0, max - 1) + "..." : chosen;
}

export function compactCodeLines(lines: string[], cap = PACKET_LIMITS.codeLines): { text: string; total: number } {
  // Compaction for wire cost, semantics-preserving for whitespace-sensitive
  // languages (Python): (1) drop blank lines — they carry no retrieval signal;
  // (2) remove the COMMON leading indent, which preserves RELATIVE indentation.
  // The cap applies AFTER compaction, so 40 lines are real content lines.
  const kept = lines.filter((l) => l.trim().length > 0);
  const indents = kept.map((l) => l.length - l.trimStart().length);
  const dedent = indents.length ? Math.min(...indents) : 0;
  const compact = dedent > 0 ? kept.map((l) => l.slice(dedent)) : kept;
  const total = compact.length;
  if (total > cap) {
    compact.length = cap;
    compact.push(`... (+${total - cap} more lines)`);
  }
  return { text: compact.join("\n"), total };
}

export function readCodeBody(
  code: PacketCode,
  deadline: number
): { body?: string; unavailable?: boolean } {
  if (Date.now() > deadline) return { unavailable: true };
  try {
    const raw = fs.readFileSync(code.filePath, "utf-8");
    const lines = raw.split("\n");
    const start = Math.max(0, code.startLine - 1);
    const end = Math.min(lines.length, code.endLine);
    const { text } = compactCodeLines(lines.slice(start, end), PACKET_LIMITS.codeLines);
    return { body: text || undefined };
  } catch {
    return { unavailable: true };
  }
}

export function defaultTokenBudget(totalFiles: number): number {
  const base = 2000;
  const perThousandFiles = 600;
  const raw = base + perThousandFiles * Math.ceil(totalFiles / 1000);
  return Math.max(1500, Math.min(32000, raw));
}

function nodeLine(short: string, n: PacketNode, includeMeta?: boolean): string {
  const parts = [
    `${short} ${n.name} ${n.type.toLowerCase()} ${n.filePath}:${n.startLine}-${n.endLine}`,
  ];
  if (n.microSummary) parts.push(`m:${n.microSummary}`);
  const meta = includeMeta ? renderMeta(n.metadata) : "";
  if (meta) parts.push(meta.trimStart());
  return parts.join("  ");
}

function normalizeIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Query terms for FILES snippets, derived only from the query symbol
 *  (split camelCase + non-alphanumerics). No task/repo special-casing. */
function queryTerms(querySymbol: string | undefined): string[] {
  if (!querySymbol) return [];
  return querySymbol
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
}

/** Matched-line snippets for one file: lines hitting query terms, ranked by
 *  hit count (most-hits-first, ties by line number), capped by
 *  SHAPING_LIMITS.snippetLinesPerFile / snippetLineChars. Missing files -> []. */
function fileSnippets(filePath: string, terms: string[]): string[] {
  try {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    const scored: { ln: number; text: string; hits: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      let hits = 0;
      for (const t of terms) if (lower.includes(t)) hits++;
      if (hits > 0) scored.push({ ln: i + 1, text: lines[i], hits });
    }
    scored.sort((a, b) => b.hits - a.hits || a.ln - b.ln);
    return scored.slice(0, SHAPING_LIMITS.snippetLinesPerFile).map(
      (s) => `L${s.ln}: ${s.text.length > SHAPING_LIMITS.snippetLineChars ? s.text.slice(0, SHAPING_LIMITS.snippetLineChars - 1) + "…" : s.text}`
    );
  } catch {
    return [];
  }
}

export function renderResolvePacket(packet: ResolvePacket, tokenBudget: number, opts?: RenderOpts): RenderedPacket {
  const intent = opts?.intent;
  // Budget basis: with opts, the intent budget from packet-shape.ts (chars =
  // tokens * CHARS_PER_TOKEN); without opts, the legacy caller token budget.
  const budgetChars = opts
    ? INTENT_BUDGETS[intent ?? "symbol"] * CHARS_PER_TOKEN
    : tokenBudget * 4;

  // Seeds-first: seed nodes always render before others and are never cut.
  const seedIds = new Set(packet.seeds ?? []);
  const allNodes = seedIds.size
    ? [...packet.nodes].sort(
        (a, b) => Number(seedIds.has(b.id)) - Number(seedIds.has(a.id))
      )
    : packet.nodes;
  const nodes = allNodes.slice(0, PACKET_LIMITS.nodesCap);
  const shortById = new Map<string, string>();
  nodes.forEach((n, i) => shortById.set(n.id, `N${i + 1}`));

  const header = `GRAPH ${packet.graphId} @ ${packet.commitHash.slice(0, 10)}`;
  // mcp-compact-test: the CODE section rides on TOP of the caller's token
  // budget — codeReserve guarantees space for up to codeNodes x codeLines
  // compacted lines (~45 chars/line). Section shares still come off the base
  // budget, so only CODE grows.
  const baseBudget = budgetChars;
  const codeNodeCap =
    intent === "overview" ? SHAPING_LIMITS.codeNodesOverview : SHAPING_LIMITS.codeNodesPinpoint;
  const codeTargetCount = Math.min(packet.code.length, codeNodeCap);
  const codeReserve = codeTargetCount * PACKET_LIMITS.codeLines * 45;
  const totalBudgetChars = baseBudget + codeReserve;

  const sections: string[] = [header];
  let used = header.length;

  const budgetFor = (name: string) => Math.floor((SECTION_SHARES[name] ?? 0.1) * baseBudget);
  const budgetTokens = Math.round(totalBudgetChars / CHARS_PER_TOKEN);
  // Section cut-tracking for truncation banners (opts path only — the legacy
  // signature keeps its exact historical output shape).
  const shaping = opts !== undefined;
  const cut = { nodes: false, flow: false, files: false, code: false };

  const pushSection = (name: string, lines: string[], banner?: string) => {
    if (lines.length === 0) return;
    const body = banner ? [banner, ...lines] : lines;
    const text = `${name} ${body.length}\n${body.join("\n")}`;
    sections.push(text);
    used += text.length;
  };

  // ANSWER first: one top node, intent-shaped, degrade gracefully.
  // Shaping-path only: the legacy signature keeps its historical output shape.
  // DEVLENS_PACKET_ANSWER=0 isolates the ANSWER section (diagnostic).
  const top = nodes[0];
  const includeAnswer = shaping && process.env.DEVLENS_PACKET_ANSWER !== "0";
  if (top && includeAnswer) {
    const seedConfident =
      opts?.querySymbol !== undefined &&
      normalizeIdent(opts.querySymbol) === normalizeIdent(top.name);
    pushSection(
      "ANSWER",
      renderAnswer({
        intent: intent ?? "symbol",
        querySymbol: opts?.querySymbol,
        topName: top.name,
        topKind: typeof top.metadata?.kind === "string" ? top.metadata.kind : undefined,
        filePath: top.filePath,
        startLine: top.startLine,
        technical: top.microSummary,
        seedConfident,
      })
    );
  }

  // NODES
  const nodeLines: string[] = [];
  let nodeBudget = budgetFor("NODES");
  let nodeUsed = used; // running total INCLUDING lines already accepted below
  for (const n of nodes) {
    const line = nodeLine(shortById.get(n.id)!, n, opts?.includeMeta);
    if (!seedIds.has(n.id) && nodeUsed + line.length > nodeBudget && nodeLines.length >= 3) {
      cut.nodes = nodes.length > nodeLines.length;
      break;
    }
    nodeLines.push(line);
    nodeUsed += line.length + 1;
  }
  pushSection(
    "NODES",
    nodeLines,
    shaping && cut.nodes
      ? truncationBanner(nodeLines.length, nodes.length, budgetTokens)
      : undefined
  );
  const nodesIncluded = new Set(nodes.slice(0, nodeLines.length).map((n) => n.id));

  // FLOW (edges whose both endpoints made the NODES cut)
  const eligibleEdges = packet.edges
    .slice(0, PACKET_LIMITS.flowEdgesCap)
    .filter((e) => nodesIncluded.has(e.from) && nodesIncluded.has(e.to));
  const flowLines: string[] = [];
  for (const e of eligibleEdges) {
    const site = e.edgeSite ? ` at=${e.edgeSite.file}:${e.edgeSite.line}` : "";
    const line = `${shortById.get(e.from)} -${e.type.toLowerCase()}-> ${shortById.get(e.to)}${site}`;
    if (used + line.length > budgetFor("FLOW") + budgetFor("NODES") - nodeBudget + budgetFor("FLOW")) {
      cut.flow = true;
      break;
    }
    flowLines.push(line);
  }
  if (flowLines.length < eligibleEdges.length) cut.flow = true;
  pushSection(
    "FLOW",
    flowLines,
    shaping && cut.flow
      ? truncationBanner(flowLines.length, eligibleEdges.length, budgetTokens)
      : undefined
  );

  // FILES
  // FILES: display cap from packet-shape; per-file matched-line snippets;
  // cut files become pointer lines under MORE FILES.
  const fileMap = new Map<string, string[]>();
  for (const n of nodes) {
    if (!nodesIncluded.has(n.id)) continue;
    const list = fileMap.get(n.filePath) ?? [];
    list.push(shortById.get(n.id)!);
    fileMap.set(n.filePath, list);
  }
  const terms = queryTerms(opts?.querySymbol);
  const fileLines: string[] = [];
  const fileEntries = [...fileMap.entries()];
  // Importer join first: for reference-list intents these ARE the answer.
  if (packet.importerFiles?.length) {
    for (const imp of packet.importerFiles.slice(0, SHAPING_LIMITS.filesDisplay)) {
      const line = pointerLine(imp.filePath, imp.line ?? 1, "importer");
      if (used + line.length > totalBudgetChars) break;
      fileLines.push(line);
    }
  }
  let filesShown = 0;
  for (const [filePath, shorts] of fileEntries.slice(0, SHAPING_LIMITS.filesDisplay)) {
    const line = `${filePath}  ${shorts.join(",")}`;
    if (used + line.length > totalBudgetChars) {
      cut.files = true;
      break;
    }
    fileLines.push(line);
    filesShown++;
    if (terms.length) {
      for (const snip of fileSnippets(filePath, terms)) {
        if (used + snip.length > totalBudgetChars) break;
        fileLines.push(`  ${snip}`);
      }
    }
  }
  const overflowFiles = fileEntries.slice(
    SHAPING_LIMITS.filesDisplay,
    SHAPING_LIMITS.filesDisplay + SHAPING_LIMITS.pointerListMax
  );
  if (fileEntries.length > SHAPING_LIMITS.filesDisplay) cut.files = true;
  pushSection(
    "FILES",
    fileLines,
    shaping && cut.files
      ? truncationBanner(filesShown, fileEntries.length, budgetTokens)
      : undefined
  );
  if (overflowFiles.length) {
    const pointerLines = overflowFiles.map(([filePath, shorts]) => {
      const first = nodes.find((n) => n.filePath === filePath && nodesIncluded.has(n.id));
      return pointerLine(filePath, first?.startLine ?? 1, shorts.join(","));
    });
    pushSection("MORE FILES (not shown)", pointerLines);
  }

  // CODE: intent-shaped node cap (pinpoint 3 vs overview 10); the contract
  // line rides on the section whenever any body is included.
  const codeLines: string[] = [];
  const includeCode = opts ? opts.includeCode !== false : true;
  const deadline = Date.now() + PACKET_LIMITS.codeBudgetMs;
  let unavailable = false;
  let codeCandidates = 0;
  for (const c of includeCode ? packet.code : []) {
    if (!nodesIncluded.has(c.nodeId)) continue;
    codeCandidates++;
    if (codeLines.length / 2 >= codeNodeCap) {
      cut.code = true;
      break;
    }
    const short = shortById.get(c.nodeId)!;
    const head = `-- ${short} ${c.filePath}:${c.startLine}-${c.endLine}`;
    const body = readCodeBody(c, deadline);
    if (body.unavailable) {
      unavailable = true;
      continue;
    }
    if (!body.body) continue;
    if (used + head.length + body.body.length > budgetFor("CODE") + codeReserve) {
      cut.code = true;
      break;
    }
    codeLines.push(head, body.body);
  }
  if (codeLines.length > 0) codeLines.push(CONTRACT_LINE);
  pushSection(
    "CODE",
    codeLines,
    shaping && cut.code
      ? truncationBanner(codeLines.length / 2, Math.max(codeCandidates, codeLines.length / 2), budgetTokens)
      : undefined
  );

  // SEC
  const secLines = nodes
    .filter((n) => n.microSummary && /secur|inject|vulnerab|unsafe|escaping/i.test(n.microSummary))
    .slice(0, 10)
    .map((n) => `${shortById.get(n.id)} ${n.microSummary}`);
  pushSection("SEC", secLines);

  // IDMAP
  const idmapLines = [
    nodes
      .slice(0, PACKET_LIMITS.idmapNodes)
      .map((n) => `${shortById.get(n.id)}=${n.id}`)
      .join(" "),
  ];
  pushSection("IDMAP", idmapLines);

  // NEXT
  const nextParts: string[] = [];
  if (packet.nextHint) nextParts.push(packet.nextHint);
  if (unavailable) nextParts.push("code bodies partly unavailable on disk; use get_node_code for exact source");
  if (packet.ambiguous) {
    nextParts.push(
      `ambiguous symbol "${opts?.querySymbol ?? "?"}" exists in ${(packet.rivalFiles ?? []).length} files (${(packet.rivalFiles ?? []).join(", ")}) — retry with focus=<path> to disambiguate`
    );
  }
  if (shaping && (cut.nodes || cut.flow || cut.files || cut.code)) {
    nextParts.push(
      `sections were cut — re-run resolve_context with the same task, intent=${intent ?? "symbol"}, and a larger tokenBudget (> ${budgetTokens})`
    );
  }
  for (const note of packet.notes ?? []) nextParts.push(note);
  pushSection("NEXT", nextParts);

  const text = sections.join("\n");
  if (text.length <= totalBudgetChars || nodes.length <= 1) {
    return { text, approxTokens: Math.ceil(text.length / 4) };
  }
  // Hard budget enforcement: drop the lowest-ranked NON-SEED node and re-render
  // (seed nodes are never cut).
  const lastNonSeed = (() => {
    for (let i = nodes.length - 1; i >= 0; i--) if (!seedIds.has(nodes[i].id)) return i;
    return -1;
  })();
  if (lastNonSeed <= 0) return { text, approxTokens: Math.ceil(text.length / 4) };
  const remaining = nodes.filter((_, i) => i !== lastNonSeed);
  return renderResolvePacket({ ...packet, nodes: remaining }, tokenBudget, opts);
}
