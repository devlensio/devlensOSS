import { CodeEdge, CodeNode } from "@/lib/types";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { toElements } from "./cytoscopeUtils";
import { getCytoscapeStyles, getLayoutConfig } from "./cytoscapeConfig";

cytoscape.use(fcose);

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
      cy.on("mouseover", "node", (e) => e.target.addClass("hover"));
      cy.on("mouseout",  "node", (e) => e.target.removeClass("hover"));
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
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ background: "#13191f" }}
      />
    );
  },
);

GraphCanvas.displayName = "GraphCanvas";
export default GraphCanvas;