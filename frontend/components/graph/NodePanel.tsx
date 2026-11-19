"use client";

import { useMemo, useState } from "react";
import type { CodeEdge, CodeNode, ResolvedCall } from "@/lib/types";
import { useNodeCode } from "@/lib/hooks";
import { highlightToHtml } from "@/lib/syntax";

const C = {
  bg: "#0d1117",
  surface: "#161b22",
  elevated: "#21262d",
  border: "#30363d",
  text: "#e6edf3",
  textSub: "#8b949e",
  textDim: "#6e7681",
  teal: "#2dd4bf",
  amber: "#f0b45c",
  blue: "#60a5fa",
  violet: "#a78bfa",
  green: "#3fb950",
};

interface Props {
  node: CodeNode;
  graphId: string;
  commitHash: string;
  graphLanguage?: string;
  nodesById: Record<string, CodeNode>;
  edges: CodeEdge[];
  onClose: () => void;
  onNodeFocus: (nodeId: string) => void;
  onOpenCode: (nodeId: string) => void;
}

type Tab = "overview" | "flow" | "code";

const EDGE_LABEL: Record<string, string> = {
  CALLS: "Calls",
  USES: "Uses",
  READS_FROM: "Reads",
  WRITES_TO: "Writes",
  HANDLES: "Handles",
  PROP_PASS: "Passes",
  IMPORTS: "Imports",
  EMITS: "Emits",
  NAVIGATES_TO: "Navigates",
  TESTS: "Tests",
  THROWS: "Throws",
  EXTENDS: "Extends",
  IMPLEMENTS: "Implements",
};

export default function NodePanel({ node, graphId, commitHash, graphLanguage, nodesById, edges, onClose, onNodeFocus, onOpenCode }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [expanded, setExpanded] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [flowQuery, setFlowQuery] = useState("");

  const calls = useMemo(
    () =>
      ((node.metadata?.resolvedCalls ?? []) as ResolvedCall[])
        .filter((c) => typeof c.firstOrder === "number")
        .sort((a, b) => (a.firstOrder ?? 0) - (b.firstOrder ?? 0)),
    [node],
  );

  const outgoing = useMemo(() => {
    const byType = new Map<string, CodeEdge[]>();
    for (const e of edges) {
      if (e.from !== node.id) continue;
      const arr = byType.get(e.type) ?? [];
      arr.push(e);
      byType.set(e.type, arr);
    }
    return byType;
  }, [edges, node.id]);

  const callers = useMemo(() => edges.filter((e) => e.to === node.id && e.type === "CALLS").length, [edges, node.id]);

  // Everything this node points at that has no ordinal: implements, extends,
  // handles, reads/writes, uses, renders. Grouped by edge type for the flow tab.
  const unordered = useMemo(() => {
    const orderedIds = new Set(calls.map((c) => c.nodeId));
    const byType = new Map<string, CodeNode[]>();
    for (const e of edges) {
      if (e.from !== node.id) continue;
      if (e.type === "CALLS" && orderedIds.has(e.to)) continue;
      const target = nodesById[e.to];
      if (!target) continue;
      const arr = byType.get(e.type) ?? [];
      if (!arr.some((n) => n.id === target.id)) arr.push(target);
      byType.set(e.type, arr);
    }
    return [...byType.entries()];
  }, [edges, node.id, nodesById, calls]);

  const filteredCalls = useMemo(
    () => (flowQuery.trim() ? calls.filter((c) => c.name.toLowerCase().includes(flowQuery.trim().toLowerCase())) : calls),
    [calls, flowQuery],
  );
  const summary = node.businessSummary || node.technicalSummary || "";
  const file = node.filePath.split("/").slice(-2).join("/");

  const rela = [...outgoing.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div
      className="absolute top-0 right-0 h-full z-30 flex flex-col overflow-hidden"
      style={{
        width: 420,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
      }}
    >
      {/* header */}
      <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded"
            style={{ color: C.teal, background: `${C.teal}14`, border: `1px solid ${C.teal}33` }}
          >
            {node.type.replace(/_/g, " ")}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: C.textDim }}>
            {node.score != null ? `${node.score.toFixed(1)} / 10` : ""}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-xs px-2 py-1 rounded"
            style={{ color: C.textSub, border: `1px solid ${C.border}` }}
          >
            Close
          </button>
        </div>

        <div className="font-mono text-[15px] mt-2 truncate" style={{ color: C.text }}>
          {node.name}
        </div>
        <button
          onClick={() => onOpenCode(node.id)}
          className="text-[11px] font-mono mt-1 truncate text-left"
          style={{ color: C.blue }}
          title="Open code"
        >
          {file}:{node.startLine}-{node.endLine}
        </button>

        {/* tabs */}
        <div className="flex items-center gap-1 mt-3">
          {(["overview", "flow", "code"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-[11px] px-2.5 py-1 rounded-md capitalize"
              style={{
                color: tab === t ? C.text : C.textSub,
                background: tab === t ? C.elevated : "transparent",
                border: `1px solid ${tab === t ? C.border : "transparent"}`,
              }}
            >
              {t}
              {t === "flow" && calls.length > 0 ? ` ${calls.length}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
        {tab === "overview" && (
          <div className="space-y-4">
            {summary ? (
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] mb-1.5" style={{ color: C.textDim }}>
                  What it does
                </div>
                <p
                  className="text-[12.5px] leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: C.textSub,
                    display: expanded ? "block" : "-webkit-box",
                    WebkitLineClamp: expanded ? undefined : 7,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {summary}
                </p>
                {summary.length > 320 && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-[11px] mt-1"
                    style={{ color: C.blue }}
                  >
                    {expanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-[12px]" style={{ color: C.textDim }}>
                No summary for this node. Re-analyze with summarization enabled.
              </div>
            )}

            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] mb-1.5" style={{ color: C.textDim }}>
                Shape
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Lines", `${node.startLine}-${node.endLine}`],
                  ["Calls", String(calls.length)],
                  ["Callers", String(callers)],
                  ["Relations", String(rela.reduce((n, [, v]) => n + v.length, 0))],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg px-2.5 py-2"
                    style={{ background: C.surface, border: `1px solid ${C.border}` }}
                  >
                    <div className="text-[10px]" style={{ color: C.textDim }}>
                      {k}
                    </div>
                    <div className="text-[13px] font-mono tabular-nums mt-0.5" style={{ color: C.text }}>
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {rela.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] mb-1.5" style={{ color: C.textDim }}>
                  Related
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rela.map(([type, list]) => (
                    <span
                      key={type}
                      className="text-[10px] px-2 py-0.5 rounded font-mono"
                      style={{ color: C.violet, background: `${C.violet}12`, border: `1px solid ${C.violet}33` }}
                    >
                      {EDGE_LABEL[type] ?? type} {list.length}
                    </span>
                  ))}
                </div>
                <div className="mt-2 space-y-1">
                  {rela.slice(0, 4).map(([type, list]) =>
                    list.slice(0, 3).map((e) => {
                      const target = nodesById[e.to];
                      if (!target) return null;
                      return (
                        <button
                          key={`${type}-${e.to}`}
                          onClick={() => onNodeFocus(e.to)}
                          className="w-full flex items-center gap-2 text-left text-[11.5px] px-1 py-0.5 rounded hover:bg-white/5"
                        >
                          <span className="font-mono text-[9px] w-14 shrink-0" style={{ color: C.textDim }}>
                            {EDGE_LABEL[type] ?? type}
                          </span>
                          <span className="font-mono truncate" style={{ color: C.textSub }}>
                            {target.name}
                          </span>
                        </button>
                      );
                    }),
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "flow" && (
          <div>
            {calls.length === 0 && (
              <div className="text-[12px] leading-relaxed" style={{ color: C.textDim }}>
                No ordering data. This graph predates callOrder/v1, or the node calls nothing it can
                resolve.
              </div>
            )}
            {calls.length > 0 && (
              <div className="text-[10.5px] leading-relaxed mb-2 flex items-start gap-2" style={{ color: C.textDim }}>
                <span>
                  Numbered 1..N in the order this function calls them. <span style={{ color: C.textSub }}>#n</span>{" "}
                  is the raw call-site position, which also counts builtins and third-party calls.
                </span>
                <button
                  onClick={() => setShowLegend((v) => !v)}
                  className="shrink-0 w-4 h-4 rounded-full text-[10px] leading-none"
                  style={{ color: C.textSub, border: `1px solid ${C.border}` }}
                  title="What do the markers mean?"
                >
                  ?
                </button>
              </div>
            )}
            {showLegend && (
              <div className="rounded-md p-2.5 mb-2 space-y-1" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {[
                  ["1..N", "position of the call among the node's resolved callees"],
                  ["#n", "raw call-site position, counting every call in the source"],
                  ["await", "the frame suspends here until it settles"],
                  ["timer / promise / microtask / event", "runs later, detached from the frame"],
                  ["postRender", "framework commit-phase effect (useEffect, onMounted)"],
                  ["onReturn", "runs at frame exit, LIFO (defer, finally, Drop)"],
                  ["concurrent", "may run on another thread or task"],
                  ["loop", "may run 0..N times (loop body or iteration callback)"],
                  ["maybe", "may be skipped (branch, guard, optional chain)"],
                  ["×N", "reached from N separate call sites"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[10px]">
                    <span className="w-[132px] shrink-0 font-mono" style={{ color: C.amber }}>{k}</span>
                    <span style={{ color: C.textSub }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {calls.length > 8 && (
              <input
                value={flowQuery}
                onChange={(e) => setFlowQuery(e.target.value)}
                placeholder="Filter callees…"
                className="w-full text-[11px] px-2 py-1 rounded-md mb-2 outline-none"
                style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}` }}
              />
            )}
            {filteredCalls.map((c) => {
              const i = calls.indexOf(c);
              return (
                <FlowRow
                  key={`${c.nodeId}-${c.firstOrder}`}
                  call={c}
                  index={i + 1}
                  graphId={graphId}
                  commitHash={commitHash}
                  graphLanguage={graphLanguage}
                  nodesById={nodesById}
                  onFocus={onNodeFocus}
                  onOpen={onOpenCode}
                />
              );
            })}
            {unordered.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                <div className="text-[10px] uppercase tracking-[0.12em] mb-1.5" style={{ color: C.textDim }}>
                  Not ordered
                </div>
                <div className="space-y-1.5">
                  {unordered.map(([type, list]) => (
                    <div key={type} className="flex items-start gap-2">
                      <span className="font-mono text-[9.5px] w-16 shrink-0 pt-0.5" style={{ color: C.textDim }}>
                        {EDGE_LABEL[type] ?? type}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {list.slice(0, 8).map((n) => (
                          <button
                            key={n.id}
                            onClick={() => onNodeFocus(n.id)}
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                            style={{ color: C.violet, background: `${C.violet}12`, border: `1px solid ${C.violet}2e` }}
                          >
                            {n.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "code" && (
          <div className="space-y-3">
            <button
              onClick={() => onOpenCode(node.id)}
              className="w-full text-[12px] py-2 rounded-lg"
              style={{ color: C.teal, border: `1px solid ${C.teal}44`, background: `${C.teal}0d` }}
            >
              Open {file.split("/").pop()} in code view
            </button>
            <div className="text-[11px]" style={{ color: C.textDim }}>
              The code view highlights the nodes declared inside this one. Click a highlighted name
              to open that node without losing this one.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Flow row: expandable summary + code preview ────────────────────────────

function FlowRow({
  call,
  index,
  graphId,
  commitHash,
  graphLanguage,
  nodesById,
  onFocus,
  onOpen,
}: {
  call: ResolvedCall;
  index: number;
  graphId: string;
  commitHash: string;
  graphLanguage?: string;
  nodesById: Record<string, CodeNode>;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const target = nodesById[call.nodeId];
  const { data, isLoading } = useNodeCode(graphId, commitHash, open ? call.nodeId : null);

  const code: string = (data as any)?.code ?? (data as any)?.rawCode ?? "";
  const preview = code ? code.split("\n").slice(0, 14).join("\n") : "";
  const highlightedPreview = useMemo(
    () => highlightToHtml(preview, graphLanguage, target?.filePath),
    [preview, graphLanguage, target?.filePath],
  );
  const summary = (target?.technicalSummary || target?.businessSummary || "").trim();

  const markers: Array<{ label: string; color: string }> = [];
  if (call.awaited) markers.push({ label: "await", color: "#60a5fa" });
  if (call.defer) markers.push({ label: call.deferDetail ? `${call.defer}: ${call.deferDetail}` : call.defer, color: "#f0b45c" });
  if (call.conc) markers.push({ label: "concurrent", color: "#a78bfa" });
  if (call.repeat) markers.push({ label: "loop", color: "#2dd4bf" });
  if (call.maybe) markers.push({ label: "maybe", color: "#8b949e" });
  if (call.orders && call.orders.length > 1) markers.push({ label: `×${call.orders.length}`, color: "#f472b6" });

  return (
    <div className="rounded-md" style={{ background: open ? C.surface : "transparent" }}>
      <div className="flex items-baseline gap-2 px-1 py-1">
        <span className="font-mono text-[12px] tabular-nums w-7 text-right shrink-0" style={{ color: C.amber }}>
          {index}
        </span>
        <button
          onClick={() => {
            onFocus(call.nodeId);
            onOpen(call.nodeId);
          }}
          className="min-w-0 text-left hover:underline"
        >
          <span className="font-mono text-[12px] truncate block" style={{ color: C.text }}>
            {call.name}
          </span>
          {markers.length > 0 && (
            <span className="flex flex-wrap gap-1 mt-0.5">
              {markers.map((m) => (
                <span
                  key={m.label}
                  className="text-[9px] px-1.5 rounded font-mono"
                  style={{ color: m.color, background: `${m.color}14`, border: `1px solid ${m.color}2e` }}
                >
                  {m.label}
                </span>
              ))}
            </span>
          )}
        </button>
        <span className="font-mono text-[10px] ml-auto shrink-0 tabular-nums" style={{ color: C.textDim }}>
          #{call.firstOrder}
          {call.line != null ? ` :${call.line}` : ""}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[10px] px-1 rounded shrink-0"
          style={{ color: C.textSub, border: `1px solid ${C.border}` }}
          title={open ? "Collapse" : "Show summary and code"}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>

      {open && (
        <div className="px-2 pb-2">
          {isLoading && <div className="text-[10.5px]" style={{ color: C.textDim }}>Loading…</div>}
          {!isLoading && summary && (
            <p className="text-[11px] leading-relaxed mb-1.5" style={{ color: C.textSub }}>
              {summary}
            </p>
          )}
          {!isLoading && !summary && (
            <div className="text-[10.5px] mb-1.5" style={{ color: C.textDim }}>No summary.</div>
          )}
          {preview && (
            <pre
              className="hljs text-[10.5px] rounded p-2 overflow-auto"
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                margin: 0,
                lineHeight: "18px",
                maxHeight: 280,
                scrollbarWidth: "thin",
              }}
              dangerouslySetInnerHTML={{ __html: highlightedPreview }}
            />
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={() => onOpen(call.nodeId)}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: C.teal, border: `1px solid ${C.teal}44` }}
            >
              Open in code map
            </button>
            <button
              onClick={() => onFocus(call.nodeId)}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: C.textSub, border: `1px solid ${C.border}` }}
            >
              Show in graph
            </button>
            {graphLanguage && (
              <span className="text-[9px] ml-auto" style={{ color: C.textDim }}>
                {graphLanguage}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
