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
}

export interface PacketEdge {
  from: string;
  to: string;
  type: string;
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
  nextHint?: string;
  notes?: string[];
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

function nodeLine(short: string, n: PacketNode): string {
  const parts = [
    `${short} ${n.name} ${n.type.toLowerCase()} ${n.filePath}:${n.startLine}-${n.endLine}`,
  ];
  if (n.microSummary) parts.push(`m:${n.microSummary}`);
  return parts.join("  ");
}

export function renderResolvePacket(packet: ResolvePacket, tokenBudget: number): RenderedPacket {
  const nodes = packet.nodes.slice(0, PACKET_LIMITS.nodesCap);
  const shortById = new Map<string, string>();
  nodes.forEach((n, i) => shortById.set(n.id, `N${i + 1}`));

  const header = `GRAPH ${packet.graphId} @ ${packet.commitHash.slice(0, 10)}`;
  // mcp-compact-test: the CODE section rides on TOP of the caller's token
  // budget — codeReserve guarantees space for up to codeNodes x codeLines
  // compacted lines (~45 chars/line). Section shares still come off the base
  // budget, so only CODE grows.
  const baseBudget = tokenBudget * 4;
  const codeTargetCount = Math.min(packet.code.length, PACKET_LIMITS.codeNodes);
  const codeReserve = codeTargetCount * PACKET_LIMITS.codeLines * 45;
  const budgetChars = baseBudget + codeReserve;

  const sections: string[] = [header];
  let used = header.length;

  const budgetFor = (name: string) => Math.floor((SECTION_SHARES[name] ?? 0.1) * baseBudget);

  const pushSection = (name: string, lines: string[]) => {
    if (lines.length === 0) return;
    const text = `${name} ${lines.length}\n${lines.join("\n")}`;
    sections.push(text);
    used += text.length;
  };

  // NODES
  const nodeLines: string[] = [];
  let nodeBudget = budgetFor("NODES");
  for (const n of nodes) {
    const line = nodeLine(shortById.get(n.id)!, n);
    if (used + line.length + nodeLines.length > nodeBudget && nodeLines.length >= 3) break;
    nodeLines.push(line);
  }
  pushSection("NODES", nodeLines);
  const nodesIncluded = new Set(nodes.slice(0, nodeLines.length).map((n) => n.id));

  // FLOW (edges whose both endpoints made the NODES cut)
  const flowLines: string[] = [];
  for (const e of packet.edges.slice(0, PACKET_LIMITS.flowEdgesCap)) {
    const from = shortById.get(e.from);
    const to = shortById.get(e.to);
    if (!from || !to) continue;
    const line = `${from} -${e.type.toLowerCase()}-> ${to}`;
    if (used + line.length > budgetFor("FLOW") + budgetFor("NODES") - nodeBudget + budgetFor("FLOW")) break;
    flowLines.push(line);
  }
  pushSection("FLOW", flowLines);

  // FILES
  const fileMap = new Map<string, string[]>();
  for (const n of nodes) {
    if (!nodesIncluded.has(n.id)) continue;
    const list = fileMap.get(n.filePath) ?? [];
    list.push(shortById.get(n.id)!);
    fileMap.set(n.filePath, list);
  }
  const fileLines: string[] = [];
  for (const [filePath, shorts] of [...fileMap.entries()].slice(0, PACKET_LIMITS.filesCap)) {
    const line = `${filePath}  ${shorts.join(",")}`;
    if (used + line.length > budgetChars) break;
    fileLines.push(line);
  }
  pushSection("FILES", fileLines);

  // CODE
  const codeLines: string[] = [];
  const deadline = Date.now() + PACKET_LIMITS.codeBudgetMs;
  let unavailable = false;
  for (const c of packet.code.slice(0, PACKET_LIMITS.codeNodes)) {
    if (!nodesIncluded.has(c.nodeId)) continue;
    const short = shortById.get(c.nodeId)!;
    const head = `-- ${short} ${c.filePath}:${c.startLine}-${c.endLine}`;
    const body = readCodeBody(c, deadline);
    if (body.unavailable) {
      unavailable = true;
      continue;
    }
    if (!body.body) continue;
    if (used + head.length + body.body.length > budgetFor("CODE") + codeReserve) break;
    codeLines.push(head, body.body);
  }
  pushSection("CODE", codeLines);

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
  for (const note of packet.notes ?? []) nextParts.push(note);
  pushSection("NEXT", nextParts);

  const text = sections.join("\n");
  if (text.length <= budgetChars || nodes.length <= 1) {
    return { text, approxTokens: Math.ceil(text.length / 4) };
  }
  // Hard budget enforcement: drop the lowest-ranked node and re-render.
  return renderResolvePacket({ ...packet, nodes: nodes.slice(0, -1) }, tokenBudget);
}
