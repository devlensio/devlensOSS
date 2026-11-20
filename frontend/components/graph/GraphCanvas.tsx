import { CodeEdge, CodeNode } from "@/lib/types";
import { useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { toElements } from "./cytoscopeUtils";
import { getCytoscapeStyles, getLayoutConfig, NODE_ACCENTS } from "./cytoscapeConfig";
import { summaryToHtml } from "@/lib/sanitize";

cytoscape.use(fcose);

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export interface TooltipInfo {
  x:                 number;
  y:                 number;
  id:                string;
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

// Tooltip type colours are derived from NODE_ACCENTS (the single source of
// truth in cytoscapeConfig) so the tooltip always matches the canvas node
// fill and the detail-panel badges.
function tooltipTriple(hex: string) {
  return { bg: hex + "18", text: hex, border: hex + "30" };
}
const TOOLTIP_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> =
  Object.fromEntries(
    Object.entries(NODE_ACCENTS).map(([type, hex]) => [type, tooltipTriple(hex)]),
  );

export function NodeTooltip({
  t,
  onMouseEnter,
  onMouseLeave,
  onOpenCode,
  onOpenPanel,
}: {
  t:             TooltipInfo;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onOpenCode?:   (id: string) => void;
  onOpenPanel?:  (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({
    position: "absolute", left: t.x + 16, top: t.y - 8,
    transform: "translateY(-100%)", opacity: 0, zIndex: 50,
  });
  // Collapsed by default: the card sits under the pointer and a full summary
  // pushed everything else out of reach. The header shows what is inside.
  const [summaryOpen, setSummaryOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const parent = el.offsetParent?.getBoundingClientRect();
    const pw = parent?.width ?? 9999;

    const GAP = 18;
    const fitsAbove = t.y - height - GAP >= 0;
    const top       = fitsAbove ? t.y - 10 : t.y + GAP + 10;
    const trY       = fitsAbove ? "-100%" : "0%";
    const fitsRight = t.x + GAP + width <= pw;
    const left      = fitsRight ? t.x + GAP : t.x - GAP - width;

    setPosStyle({
      position: "absolute", left, top,
      transform: `translateY(${trY})`,
      opacity: 1, zIndex: 50, transition: "opacity 0.12s",
    });
  }, [t.x, t.y]);

  const hasSummary = !!(t.technicalSummary || t.businessSummary);
  const colors     = TOOLTIP_TYPE_COLORS[t.type] ?? { bg: "#f4f2ec", text: "#57534e", border: "#e3ded3" };
  const shortPath  = t.filePath.split("/").slice(-3).join("/");
  const scoreNorm  = Math.min(Math.max((t.score ?? 0) / 10, 0), 1);
  const scoreColor = scoreNorm > 0.6 ? "#0e766e" : scoreNorm > 0.3 ? "#b45309" : "#a8a29e";
  const hasDetails = t.hasState || t.hooks.length > 0;

  const row: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 7,
  };
  const lbl: React.CSSProperties = {
    fontSize: 10, fontFamily: "'Fira Code', monospace", letterSpacing: "0.06em",
    textTransform: "uppercase", color: "#a8a29e", width: 42, flexShrink: 0, paddingTop: 2,
  };
  const card: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e3ded3",
    borderRadius: 12,
    minWidth: 232,
    maxWidth: 340,
    overflow: "hidden",
    boxShadow: "0 22px 50px rgba(28,25,23,0.16), 0 2px 6px rgba(28,25,23,0.06)",
    fontFamily: "var(--font-family-ui), Geist, system-ui, sans-serif",
  };

  return (
    <div
      ref={ref}
      style={{ ...posStyle, pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={card}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ padding: "13px 15px 12px", borderBottom: "1px solid #ece8df" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{
              padding: "3px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
            }}>
              {t.type.replace("_", " ")}
            </span>
            {t.renderingBoundary && (
              <span style={{
                padding: "3px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.07em", textTransform: "uppercase",
                background: t.renderingBoundary === "client" ? "#0891b214" : "#b4530914",
                color:      t.renderingBoundary === "client" ? "#0891b2"   : "#b45309",
                border:     `1px solid ${t.renderingBoundary === "client" ? "#0891b233" : "#b4530933"}`,
              }}>
                {t.renderingBoundary}
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", marginBottom: 4, lineHeight: 1.35, wordBreak: "break-word" }}>
            {t.name}
          </div>
          <div style={{ fontSize: 11.5, fontFamily: "'Fira Code', monospace", color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.filePath}>
            {shortPath}
          </div>
        </div>

        {/* ── Score ──────────────────────────────────────────────── */}
        <div style={{ padding: "11px 15px", borderBottom: (hasDetails || t.children.length > 0 || hasSummary) ? "1px solid #ece8df" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ ...lbl, paddingTop: 0 }}>Score</span>
            <div style={{ flex: 1, height: 4, background: "#eeece4", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${scoreNorm * 100}%`, height: "100%", background: scoreColor, borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 12, fontFamily: "'Fira Code', monospace", color: "#57534e", flexShrink: 0, minWidth: "3.2ch", textAlign: "right" }}>
              {(t.score ?? 0).toFixed(1)}
            </span>
          </div>
        </div>

        {/* ── Hooks + State ──────────────────────────────────────── */}
        {hasDetails && (
          <div style={{ padding: "11px 15px", borderBottom: (t.children.length > 0 || hasSummary) ? "1px solid #ece8df" : undefined }}>
            {t.hooks.length > 0 && (
              <div style={{ ...row, marginBottom: t.hasState ? 7 : 0 }}>
                <span style={lbl}>Hooks</span>
                <span style={{ fontSize: 12, fontFamily: "'Fira Code', monospace", color: "#57534e", lineHeight: 1.6, wordBreak: "break-word" }}>
                  {t.hooks.slice(0, 6).join(", ")}{t.hooks.length > 6 ? ` +${t.hooks.length - 6}` : ""}
                </span>
              </div>
            )}
            {t.hasState && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={lbl}>State</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#1d4ed8" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1d4ed8", flexShrink: 0 }} />
                  local state
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Children ───────────────────────────────────────────── */}
        {t.children.length > 0 && (
          <div style={{ padding: "11px 15px", borderBottom: hasSummary ? "1px solid #ece8df" : undefined }}>
            <div style={{ fontSize: 10, fontFamily: "'Fira Code', monospace", color: "#a8a29e", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 7 }}>
              Children · {t.children.length}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {t.children.slice(0, 9).map((name) => (
                <span key={name} style={{
                  padding: "3px 7px", borderRadius: 5, fontSize: 11.5,
                  fontFamily: "'Fira Code', monospace", background: "#f4f2ec",
                  color: "#57534e", border: "1px solid #e3ded3",
                }}>
                  {name}
                </span>
              ))}
              {t.children.length > 9 && (
                <span style={{ fontSize: 11.5, color: "#a8a29e", padding: "3px 5px" }}>
                  +{t.children.length - 9}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Summary ─────────────────────────────────────────────── */}
        {(
          <>
            <button
              onClick={() => setSummaryOpen(o => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 15px", cursor: "pointer",
                background: summaryOpen ? "#faf9f6" : "transparent",
                border: "none",
                borderBottom: summaryOpen ? "1px solid #ece8df" : "none",
                borderTop: "1px solid #ece8df",
                transition: "background 0.15s",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { if (!summaryOpen) (e.currentTarget as HTMLElement).style.background = "#faf9f6"; }}
              onMouseLeave={e => { if (!summaryOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 600, color: "#57534e" }}>
                <span style={{
                  fontSize: 8, color: summaryOpen ? "#0e766e" : "#a8a29e",
                  transform: summaryOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s, color 0.15s",
                  display: "inline-block",
                }}>▶</span>
                Summary
              </span>
              {!summaryOpen && (
                <span style={{ fontSize: 10.5, color: "#a8a29e", fontFamily: "'Fira Code', monospace" }}>
                  {t.technicalSummary && t.businessSummary ? "2 sections" : t.technicalSummary ? "technical" : "business"}
                </span>
              )}
            </button>

            {summaryOpen && (
              <div style={{ padding: "12px 15px", maxHeight: 260, overflowY: "auto" }}>
                {!hasSummary && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "#8c857a" }}>
                    No summary stored for this node. Re-analyze with summarization enabled to
                    generate one.
                  </div>
                )}
                {t.technicalSummary && (
                  <div style={{ marginBottom: t.businessSummary ? 16 : 0 }}>
                    <div style={{
                      fontSize: 10, fontFamily: "'Fira Code', monospace", letterSpacing: "0.07em",
                      textTransform: "uppercase", color: "#1d4ed8",
                      marginBottom: 6, display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#1d4ed8", flexShrink: 0, display: "inline-block" }} />
                      Technical
                    </div>
                    <div
                      className="summary-html"
                      style={{ fontSize: 12.5, color: "#57534e" }}
                      dangerouslySetInnerHTML={{ __html: summaryToHtml(t.technicalSummary) }}
                    />
                  </div>
                )}
                {t.businessSummary && (
                  <div>
                    <div style={{
                      fontSize: 10, fontFamily: "'Fira Code', monospace", letterSpacing: "0.07em",
                      textTransform: "uppercase", color: "#0e766e",
                      marginBottom: 6, display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#0e766e", flexShrink: 0, display: "inline-block" }} />
                      Business
                    </div>
                    <div
                      className="summary-html"
                      style={{ fontSize: 12.5, color: "#57534e" }}
                      dangerouslySetInnerHTML={{ __html: summaryToHtml(t.businessSummary) }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: "1px solid #ece8df" }}>
          <button
            onClick={() => onOpenCode?.(t.id)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 9px",
              borderRadius: 7,
              border: "1px solid #0e766e",
              background: "#0e766e",
              color: "#ffffff",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Open code view
          </button>
          <button
            onClick={() => onOpenPanel?.(t.id)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 9px",
              borderRadius: 7,
              border: "1px solid #e3ded3",
              background: "#ffffff",
              color: "#57534e",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Open panel
          </button>
        </div>
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
  /** When set, everything outside the node's closed neighbourhood is dimmed. */
  focusedNodeId?: string | null;
  onOpenCode?:  (nodeId: string) => void;
  onOpenPanel?: (nodeId: string) => void;
}

const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  ({ nodes, edges, onNodeClick, focusedNodeId, onOpenCode, onOpenPanel }, ref) => {
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
              const hood = node.closedNeighborhood();
              cy.elements().removeClass("ego-dim ego-focus");
              if (hood.length > 1) cy.elements().difference(hood).addClass("ego-dim");
              node.connectedEdges().addClass("ego-focus");
              cy.animate(
                { fit: { eles: hood.length > 1 ? hood : node, padding: 120 }, easing: "ease-in-out-cubic" },
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

        const removedNodes = cy.nodes().filter((n) => !newIds.has(n.id())).length;
        cy.elements().forEach((ele) => {
          if (!newIds.has(ele.id())) cy.remove(ele);
        });

        const existingIds = new Set(cy.elements().map((ele) => ele.id()));
        const isNodeEl = (e: any) => !("source" in e.data);
        const toAdd = newElements.filter((e) => !existingIds.has(e.data.id));
        const addedNodes = toAdd.filter(isNodeEl).length;
        if (toAdd.length > 0) cy.add(toAdd);

        // Filtering by edge type only swaps edges — the node positions are still
        // valid, so re-running a force layout there was pure waste (and on a
        // 1000-node graph it froze the tab for seconds per keystroke).
        if (addedNodes === 0 && removedNodes === 0) return;

        if (cy.nodes().length > 400) {
          // Too big to re-solve. Park each new node next to a neighbour that is
          // already positioned, so the canvas stays recognisable and cheap.
          const neighbour = new Map<string, string>();
          for (const e of edges) {
            neighbour.set(e.from, e.to);
            neighbour.set(e.to, e.from);
          }
          cy.batch(() => {
            for (const el of toAdd) {
              if (!isNodeEl(el)) continue;
              const anchor = cy.getElementById(neighbour.get(el.data.id) ?? "");
              const p = anchor.nonempty() ? anchor.position() : { x: 0, y: 0 };
              cy.getElementById(el.data.id).position({
                x: p.x + (Math.random() - 0.5) * 90,
                y: p.y + (Math.random() - 0.5) * 90,
              });
            }
          });
          return;
        }

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
          const cy = cyRef.current;
          if (!cy) return;
          cy.elements().removeClass("ego-dim ego-focus");
          if (!focusedNodeId) return;
          const node = cy.getElementById(focusedNodeId);
          if (node.empty()) return;
          const hood = node.closedNeighborhood();
          cy.elements().difference(hood).addClass("ego-dim");
          node.connectedEdges().addClass("ego-focus");
          cy.animate({ fit: { eles: hood, padding: 90 } }, { duration: 450, easing: "ease-in-out-cubic" });
        }, [focusedNodeId]);

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

      // Anchor labels are kept at a readable screen size: their model font size
      // is 12 / zoom, so a fitted 400-node map still names its key nodes.
      const scaleAnchorLabels = () => {
        const zoom = cy.zoom();
        const font = Math.min(90, Math.max(11, 11 / zoom));
        cy.nodes("[?anchor]").style({
          "font-size":      `${font}px`,
          "text-max-width": `${font * 10}px`,
          "text-outline-width": Math.max(2, font / 6),
        });
      };
      let anchorRaf = 0;
      const onZoom = () => {
        cancelAnimationFrame(anchorRaf);
        anchorRaf = requestAnimationFrame(scaleAnchorLabels);
      };
      cy.on("zoom", onZoom);
      scaleAnchorLabels();

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
          id:                e.target.id(),
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
        cy.removeListener("zoom", onZoom);
        cy.destroy();
        cyRef.current = null;
      };
    }, []);

    return (
      <div className="relative w-full h-full">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ background: "#f7f5f0" }}
        />
        {tooltip && (
          <NodeTooltip
            t={tooltip}
            onOpenCode={(id) => {
              setTooltip(null);
              onOpenCode?.(id);
            }}
            onOpenPanel={(id) => {
              setTooltip(null);
              onOpenPanel?.(id);
            }}
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