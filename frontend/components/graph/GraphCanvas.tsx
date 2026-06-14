import { CodeEdge, CodeNode } from "@/lib/types";
import { useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { toElements } from "./cytoscopeUtils";
import { getCytoscapeStyles, getLayoutConfig } from "./cytoscapeConfig";
import { sanitizeSummary } from "@/lib/sanitize";

cytoscape.use(fcose);

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export interface TooltipInfo {
  x:                 number;
  y:                 number;
  name:              string;
  type:              string;
  filePath:          string;
  score:             number;
  hasState:          boolean;
  hooks:             string[];
  children:          string[];
  renderingBoundary: string | null;
  technicalSummary?: string;
  businessSummary?:  string;
}

const TOOLTIP_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  COMPONENT:   { bg: "#2dd4bf18", text: "#2dd4bf", border: "#2dd4bf30" },
  HOOK:        { bg: "#c084fc18", text: "#c084fc", border: "#c084fc30" },
  FUNCTION:    { bg: "#60a5fa18", text: "#60a5fa", border: "#60a5fa30" },
  STATE_STORE: { bg: "#fb923c18", text: "#fb923c", border: "#fb923c30" },
  UTILITY:     { bg: "#94a3b818", text: "#94a3b8", border: "#94a3b830" },
  FILE:        { bg: "#f472b618", text: "#f472b6", border: "#f472b630" },
  GHOST:       { bg: "#6b728018", text: "#6b7280", border: "#6b728030" },
  ROUTE:       { bg: "#818cf818", text: "#818cf8", border: "#818cf830" },
  TEST:        { bg: "#f9731618", text: "#f97316", border: "#f9731630" },
  STORY:       { bg: "#a78bfa18", text: "#a78bfa", border: "#a78bfa30" },
};

export function NodeTooltip({
  t,
  onMouseEnter,
  onMouseLeave,
}: {
  t:             TooltipInfo;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({
    position: "absolute", left: t.x + 16, top: t.y - 8,
    transform: "translateY(-100%)", opacity: 0, zIndex: 50,
  });
  const [summaryOpen, setSummaryOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const parent = el.offsetParent?.getBoundingClientRect();
    const pw = parent?.width ?? 9999;

    const GAP = 16;
    const fitsAbove = t.y - height - GAP >= 0;
    const top       = fitsAbove ? t.y - 8 : t.y + GAP + 8;
    const trY       = fitsAbove ? "-100%" : "0%";
    const fitsRight = t.x + GAP + width <= pw;
    const left      = fitsRight ? t.x + GAP : t.x - GAP - width;

    setPosStyle({
      position: "absolute", left, top,
      transform: `translateY(${trY})`,
      opacity: 1, zIndex: 50, transition: "opacity 0.1s",
    });
  }, [t.x, t.y]);

  const hasSummary = !!(t.technicalSummary || t.businessSummary);
  const colors     = TOOLTIP_TYPE_COLORS[t.type] ?? { bg: "#21262d", text: "#8b949e", border: "#30363d" };
  const shortPath  = t.filePath.split("/").slice(-3).join("/");
  const scoreNorm  = Math.min(Math.max((t.score ?? 0) / 10, 0), 1);
  const scoreColor = scoreNorm > 0.6 ? "#2dd4bf" : scoreNorm > 0.3 ? "#f59e0b" : "#6e7681";
  const hasDetails = t.hasState || t.hooks.length > 0;

  const row: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6,
  };
  const lbl: React.CSSProperties = {
    fontSize: 9, fontFamily: "monospace", letterSpacing: "0.07em",
    textTransform: "uppercase", color: "#3c4a46", width: 40, flexShrink: 0, paddingTop: 1,
  };

  return (
    <div
      ref={ref}
      style={{ ...posStyle, pointerEvents: hasSummary ? "auto" : "none" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={{
        background:   "#0d1117",
        border:       "1px solid #1e2530",
        borderRadius: 10,
        minWidth:     210,
        maxWidth:     300,
        overflow:     "hidden",
        boxShadow:    "0 20px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)",
        fontFamily:   "system-ui, -apple-system, sans-serif",
      }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ padding: "11px 13px 10px", borderBottom: "1px solid #161b22" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
            <span style={{
              padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
            }}>
              {t.type.replace("_", " ")}
            </span>
            {t.renderingBoundary && (
              <span style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                background: t.renderingBoundary === "client" ? "#06b6d414" : "#f59e0b14",
                color:      t.renderingBoundary === "client" ? "#06b6d4"   : "#f59e0b",
                border:     `1px solid ${t.renderingBoundary === "client" ? "#06b6d428" : "#f59e0b28"}`,
              }}>
                {t.renderingBoundary}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3", marginBottom: 3, lineHeight: 1.3, wordBreak: "break-word" }}>
            {t.name}
          </div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#3c4a46", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.filePath}>
            {shortPath}
          </div>
        </div>

        {/* ── Score ──────────────────────────────────────────────── */}
        <div style={{ padding: "9px 13px", borderBottom: (hasDetails || t.children.length > 0 || hasSummary) ? "1px solid #161b22" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...lbl, paddingTop: 0 }}>Score</span>
            <div style={{ flex: 1, height: 3, background: "#1c2128", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${scoreNorm * 100}%`, height: "100%", background: scoreColor, borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#8b949e", flexShrink: 0, minWidth: "3ch", textAlign: "right" }}>
              {(t.score ?? 0).toFixed(1)}
            </span>
          </div>
        </div>

        {/* ── Hooks + State ──────────────────────────────────────── */}
        {hasDetails && (
          <div style={{ padding: "9px 13px", borderBottom: (t.children.length > 0 || hasSummary) ? "1px solid #161b22" : undefined }}>
            {t.hooks.length > 0 && (
              <div style={{ ...row, marginBottom: t.hasState ? 6 : 0 }}>
                <span style={lbl}>Hooks</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "#6e7681", lineHeight: 1.6, wordBreak: "break-word" }}>
                  {t.hooks.slice(0, 6).join(", ")}{t.hooks.length > 6 ? ` +${t.hooks.length - 6}` : ""}
                </span>
              </div>
            )}
            {t.hasState && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={lbl}>State</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#60a5fa" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#60a5fa", flexShrink: 0 }} />
                  local state
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Children ───────────────────────────────────────────── */}
        {t.children.length > 0 && (
          <div style={{ padding: "9px 13px", borderBottom: hasSummary ? "1px solid #161b22" : undefined }}>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#3c4a46", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
              Children · {t.children.length}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {t.children.slice(0, 9).map((name) => (
                <span key={name} style={{
                  padding: "2px 6px", borderRadius: 4, fontSize: 10,
                  fontFamily: "monospace", background: "#161b22",
                  color: "#8b949e", border: "1px solid #1e2530",
                }}>
                  {name}
                </span>
              ))}
              {t.children.length > 9 && (
                <span style={{ fontSize: 10, color: "#484f58", padding: "2px 4px" }}>
                  +{t.children.length - 9}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Summary accordion ──────────────────────────────────── */}
        {hasSummary && (
          <>
            <style>{`
              .summary-html code {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.8em;
                background: rgba(255,255,255,0.08);
                border-radius: 4px;
                padding: 0.1em 0.4em;
              }
              .summary-html pre {
                background: rgba(0,0,0,0.4);
                border-radius: 6px;
                padding: 0.5em 0.75em;
                overflow-x: auto;
                margin: 0.4em 0;
                font-size: 0.8em;
              }
              .summary-html pre code { background: none; padding: 0; font-size: 1em; }
              .summary-html ul, .summary-html ol { padding-left: 1.1em; margin: 0.25em 0; }
              .summary-html li { margin: 0.15em 0; }
              .summary-html strong { font-weight: 600; }
              .summary-html p { margin: 0.25em 0; }
              .summary-html p:first-child { margin-top: 0; }
              .summary-html p:last-child  { margin-bottom: 0; }
            `}</style>
            <button
              onClick={() => setSummaryOpen(o => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 13px", cursor: "pointer",
                background: summaryOpen ? "#0d1117" : "transparent",
                border: "none",
                borderBottom: summaryOpen ? "1px solid #161b22" : "none",
                transition: "background 0.15s",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
              onMouseEnter={e => { if (!summaryOpen) (e.currentTarget as HTMLElement).style.background = "#161b2280"; }}
              onMouseLeave={e => { if (!summaryOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: summaryOpen ? "#8b949e" : "#6e7681" }}>
                <span style={{
                  fontSize: 7, color: summaryOpen ? "#2dd4bf" : "#484f58",
                  transform: summaryOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s, color 0.15s",
                  display: "inline-block",
                }}>▶</span>
                Summary
              </span>
              {!summaryOpen && (
                <span style={{ fontSize: 9, color: "#3c4a46", fontFamily: "monospace" }}>
                  {t.technicalSummary && t.businessSummary ? "2 sections" : t.technicalSummary ? "technical" : "business"}
                </span>
              )}
            </button>

            {summaryOpen && (
              <div style={{ padding: "11px 13px", maxHeight: 240, overflowY: "auto" }}>
                {t.technicalSummary && (
                  <div style={{ marginBottom: t.businessSummary ? 14 : 0 }}>
                    <div style={{
                      fontSize: 9, fontFamily: "monospace", letterSpacing: "0.07em",
                      textTransform: "uppercase", color: "#60a5fa40",
                      marginBottom: 5, display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#60a5fa60", flexShrink: 0, display: "inline-block" }} />
                      Technical
                    </div>
                    <div
                      className="summary-html"
                      style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.65 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeSummary(t.technicalSummary) }}
                    />
                  </div>
                )}
                {t.businessSummary && (
                  <div>
                    <div style={{
                      fontSize: 9, fontFamily: "monospace", letterSpacing: "0.07em",
                      textTransform: "uppercase", color: "#2dd4bf40",
                      marginBottom: 5, display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#2dd4bf60", flexShrink: 0, display: "inline-block" }} />
                      Business
                    </div>
                    <div
                      className="summary-html"
                      style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.65 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeSummary(t.businessSummary) }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Exposed handle ───────────────────────────────────────────────────────────

export interface GraphCanvasHandle {
  focusNode:       (nodeId: string) => void;
  highlightNodes:  (nodeIds: string[]) => void;
  clearHighlight:  () => void;
  resetView:       () => void;
  getcy:           () => cytoscape.Core | null;
  updateElements:  (nodes: CodeNode[], edges: CodeEdge[]) => void;
  applyDiffColors: (overrides: Record<string, string>) => void;
  clearDiffColors: () => void;
}

interface GraphCanvasProps {
  nodes:        CodeNode[];
  edges:        CodeEdge[];
  onNodeClick?: (nodeId: string) => void;
}

const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  ({ nodes, edges, onNodeClick }, ref) => {
    const containerRef  = useRef<HTMLDivElement>(null);
    const cyRef         = useRef<cytoscape.Core | null>(null);
    const hideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

    useImperativeHandle(ref, () => ({
      focusNode(nodeId: string) {
        const cy = cyRef.current;
        if (!cy) return;
        const node = cy.getElementById(nodeId);
        if (node.empty()) return;
        cy.animate(
          { fit: { eles: node, padding: 250 }, easing: "ease-in-out-cubic" },
          { duration: 500 },
        );
        cy.elements().unselect();
        cy.nodes().style("z-index", 1);
        node.select();
        node.style("z-index", 9999);
      },

      highlightNodes(nodeIds: string[]) {
        const cy = cyRef.current;
        if (!cy) return;
        const ids = new Set(nodeIds);
        cy.nodes().forEach((n) => {
          if (ids.has(n.id())) n.removeClass("dimmed");
          else                  n.addClass("dimmed");
        });
        cy.edges().forEach((e) => {
          if (ids.has(e.source().id()) && ids.has(e.target().id()))
            e.removeClass("dimmed");
          else
            e.addClass("dimmed");
        });
      },

      updateElements(nodes: CodeNode[], edges: CodeEdge[]) {
        const cy = cyRef.current;
        if (!cy) return;
        const newElements = toElements(nodes, edges);
        const newIds      = new Set(newElements.map((e) => e.data.id));

        cy.elements().forEach((ele) => {
          if (!newIds.has(ele.id())) cy.remove(ele);
        });

        const existingIds = new Set(cy.elements().map((ele) => ele.id()));
        const toAdd = newElements.filter((e) => !existingIds.has(e.data.id));
        if (toAdd.length > 0) cy.add(toAdd);

        cy.layout(getLayoutConfig(cy.nodes().length)).run();
      },

      clearHighlight() {
        const cy = cyRef.current;
        if (!cy) return;
        cy.elements().removeClass("dimmed");
        cy.elements().unselect();
      },

      resetView() {
        const cy = cyRef.current;
        if (!cy) return;
        cy.animate(
          { fit: { eles: cy.elements(), padding: 80 } },
          { duration: 400 },
        );
      },

      getcy() {
        return cyRef.current;
      },

      applyDiffColors(overrides: Record<string, string>) {
        const cy = cyRef.current;
        if (!cy) return;
        for (const [nodeId, color] of Object.entries(overrides)) {
          const node = cy.$(`#${CSS.escape(nodeId)}`);
          if (node.empty()) continue;
          node.style({
            "background-color": color,
            "border-color":     color,
            "border-width":     3,
            "border-opacity":   0.8,
          });
        }
      },

      clearDiffColors() {
        const cy = cyRef.current;
        if (!cy) return;
        cy.nodes().removeStyle(
          "background-color border-color border-width border-opacity",
        );
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      cyRef.current = cytoscape({
        container: containerRef.current,
        elements:  toElements(nodes, edges),
        style:     getCytoscapeStyles(),      // ← from cytoscapeConfig
        layout:    getLayoutConfig(nodes.length), // ← from cytoscapeConfig
        boxSelectionEnabled: false,
        userZoomingEnabled:  true,
        userPanningEnabled:  true,
        autoungrabify:       true,
        wheelSensitivity:    3,
        minZoom:             0.05,
        maxZoom:             4,
      });

      const cy = cyRef.current;

      cy.on("tap", "node", (e) => {
        cy.nodes().style("z-index", 1);
        e.target.style("z-index", 9999);
        onNodeClick?.(e.target.id());
      });
      cy.on("mouseover", "node", (e) => {
        e.target.addClass("hover");
        const pos  = e.target.renderedPosition() as { x: number; y: number };
        const meta = e.target.data("metadata") as Record<string, unknown> | undefined;
        const hooks = Array.isArray(meta?.hooks) ? (meta!.hooks as string[]) : [];

        const children: string[] = [];
        e.target.outgoers("edge").forEach((edge: cytoscape.EdgeSingular) => {
          if (edge.data("type") === "PROP_PASS") {
            children.push(edge.target().data("label") as string);
          }
        });

        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        setTooltip({
          x:                 pos.x,
          y:                 pos.y,
          name:              e.target.data("label")             as string,
          type:              e.target.data("type")              as string,
          filePath:          e.target.data("filePath")          as string,
          score:             e.target.data("score")             as number,
          hasState:          !!(meta?.hasState),
          hooks,
          children,
          renderingBoundary: (e.target.data("renderingBoundary") as string) ?? null,
          technicalSummary:  e.target.data("technicalSummary")  as string | undefined,
          businessSummary:   e.target.data("businessSummary")   as string | undefined,
        });
      });
      cy.on("mouseout", "node", (e) => {
        e.target.removeClass("hover");
        // Brief delay so the user can move the mouse onto the tooltip (to read summaries)
        hideTimerRef.current = setTimeout(() => {
          setTooltip(null);
          hideTimerRef.current = null;
        }, 220);
      });
      cy.on("pan zoom", () => {
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        setTooltip(null);
      });
      cy.on("tap", (e) => {
        if (e.target === cy) {
          cy.nodes().style("z-index", 1);
          onNodeClick?.("");
        }
      });

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    }, []);

    return (
      <div className="relative w-full h-full">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ background: "#13191f" }}
        />
        {tooltip && (
          <NodeTooltip
            t={tooltip}
            onMouseEnter={() => {
              if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        )}
      </div>
    );
  },
);

GraphCanvas.displayName = "GraphCanvas";
export default GraphCanvas;