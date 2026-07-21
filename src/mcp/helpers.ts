import type { CodeNode, NodeType } from "devlensio";

export type SummaryKind = "technical" | "business" | "security";
const ALL_SUMMARIES: SummaryKind[] = ["technical", "business", "security"];

export const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3 } as const;
export type Severity = keyof typeof SEVERITY_RANK;

export interface CompactNode {
  id: string;
  name: string;
  type: NodeType;
  filePath: string;
  lines: string;        // "12-45"
  score: number;
  summary?: string;     // one-line business summary
  severity?: Severity;  // omitted when "none"
}

function oneLine(text?: string, max = 140): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// Compact view: strips rawCode, trims summary. Use for lists/search results.
export function toCompact(n: CodeNode): CompactNode {
  const sev = n.security?.severity;
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    filePath: n.filePath,
    lines: `${n.startLine}-${n.endLine}`,
    score: Math.round(Number(n.score ?? 0)),
    summary: oneLine(n.businessSummary),
    severity: sev && sev !== "none" ? sev : undefined,
  };
}

// Selective summary fields — default = all three. Use for get_node / get_summaries.
export function pickSummaries(n: CodeNode, include: SummaryKind[] = ALL_SUMMARIES) {
  const out: Record<string, unknown> = {};
  if (include.includes("technical")) out.technicalSummary = n.technicalSummary ?? null;
  if (include.includes("business"))  out.businessSummary  = n.businessSummary  ?? null;
  if (include.includes("security"))  out.security         = n.security         ?? null;
  return out;
}

// MCP tool responses must be content blocks. Agents consume JSON text.
export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
export function fail(message: string, code?: string, suggestedTool?: string, suggestedArgs?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      error: {
        code: code ?? "INTERNAL",
        message,
        ...(suggestedTool && { suggestedTool }),
        ...(suggestedArgs && { suggestedArgs }),
      }
    }) }],
    isError: true,
  };
}