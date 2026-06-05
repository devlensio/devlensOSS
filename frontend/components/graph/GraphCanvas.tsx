import { CodeEdge, CodeNode } from "@/lib/types";
import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { toElements } from "./cytoscopeUtils";
import { getCytoscapeStyles, getLayoutConfig } from "./cytoscapeConfig";

cytoscape.use(fcose);

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipInfo {
  x:        number;
  y:        number;
  type:     string;
  filePath: string;
  score:    number;
  hasState: boolean;
  hooks:    string[];
  children: string[];
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

function NodeTooltip({ t }: { t: TooltipInfo }) {
  const colors = TOOLTIP_TYPE_COLORS[t.type] ?? { bg: "#21262d", text: "#8b949e", border: "#30363d" };
  const shortPath = t.filePath.split("/").slice(-3).join("/");
  const hasExtra = t.hasState || t.hooks.length > 0 || t.children.length > 0;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: t.x + 16, top: t.y - 8, transform: "translateY(-100%)" }}
    >
      <div
        className="rounded-lg px-3 py-2.5 text-xs shadow-xl"
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          minWidth: 180,
          maxWidth: 280,
        }}
      >
        {/* Type badge */}
        <span
          className="inline-block mb-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
          style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
        >
          {t.type.replace("_", " ")}
        </span>

        {/* File path */}
        <div
          className="font-mono truncate"
          style={{ color: "#2dd4bf" }}
          title={t.filePath}
        >
          {shortPath}
        </div>

        {/* Divider */}
        {hasExtra && (
          <div className="my-2" style={{ borderTop: "1px solid #21262d" }} />
        )}

        {/* Hooks */}
        {t.hooks.length > 0 && (
          <div className="font-mono truncate mb-1" style={{ color: "#6e7681", fontSize: "10px" }}>
            {t.hooks.slice(0, 4).join(", ")}{t.hooks.length > 4 ? " …" : ""}
          </div>
        )}

        {/* Local state pill */}
        {t.hasState && (
          <div className="flex items-center gap-1.5 mb-1" style={{ color: "#8b949e" }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#60a5fa" }} />
            Local state
          </div>
        )}

        {/* Direct children */}
        {t.children.length > 0 && (
          <div className="mt-1">
            <div className="uppercase tracking-wide mb-1" style={{ color: "#484f58", fontSize: "10px" }}>
              Children
            </div>
            <div className="flex flex-wrap gap-1">
              {t.children.slice(0, 8).map((name) => (
                <span
                  key={name}
                  className="px-1.5 py-0.5 rounded font-mono"
                  style={{ background: "#21262d", color: "#8b949e", fontSize: "10px" }}
                >
                  {name}
                </span>
              ))}
              {t.children.length > 8 && (
                <span className="px-1.5 py-0.5" style={{ color: "#484f58", fontSize: "10px" }}>
                  +{t.children.length - 8} more
                </span>
              )}
            </div>
          </div>
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
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef        = useRef<cytoscape.Core | null>(null);
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

        setTooltip({
          x:        pos.x,
          y:        pos.y,
          type:     e.target.data("type")     as string,
          filePath: e.target.data("filePath") as string,
          score:    e.target.data("score")    as number,
          hasState: !!(meta?.hasState),
          hooks,
          children,
        });
      });
      cy.on("mouseout", "node", (e) => {
        e.target.removeClass("hover");
        setTooltip(null);
      });
      cy.on("pan zoom", () => setTooltip(null));
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
        {tooltip && <NodeTooltip t={tooltip} />}
      </div>
    );
  },
);

GraphCanvas.displayName = "GraphCanvas";
export default GraphCanvas;