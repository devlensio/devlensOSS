import { CodeEdge, CodeNode } from "@/lib/types";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { toElements } from "./cytoscopeUtils";

cytoscape.use(fcose);

// ─── Exposed handle — parent can call these via ref ───────────────────────────

export interface GraphCanvasHandle {
  focusNode: (nodeId: string) => void; // zoom + center on a node
  highlightNodes: (nodeIds: string[]) => void; // dim everything else
  clearHighlight: () => void; // restore all nodes
  resetView: () => void; // fit all elements
  getcy: () => cytoscape.Core | null; // escape hatch for advanced use
  updateElements: (nodes: CodeNode[], edges: CodeEdge[]) => void;
  applyDiffColors: (overrides: Record<string, string>) => void;
  clearDiffColors: () => void;
}

// ─── Colors + shapes ──────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  COMPONENT: "#2dd4bf",
  HOOK: "#c084fc",
  FUNCTION: "#60a5fa",
  STATE_STORE: "#fb923c",
  UTILITY: "#94a3b8",
  FILE: "#f472b6",
  GHOST: "#6b7280",
  ROUTE: "#818cf8",
};

const NODE_SHAPES: Record<string, string> = {
  COMPONENT: "roundrectangle",
  HOOK: "ellipse",
  FUNCTION: "hexagon",
  STATE_STORE: "star",
  UTILITY: "rectangle",
  FILE: "tag",
  GHOST: "diamond",
  ROUTE: "pentagon",
};

const EDGE_COLORS: Record<string, string> = {
  CALLS: "#3b82f6",
  IMPORTS: "#94a3b8",
  READS_FROM: "#f59e0b",
  WRITES_TO: "#f85149",
  PROP_PASS: "#2dd4bf",
  EMITS: "#c084fc",
  LISTENS: "#c084fc",
  WRAPPED_BY: "#3fb950",
  GUARDS: "#d29922",
};

interface GraphCanvasProps {
  nodes: CodeNode[];
  edges: CodeEdge[];
  onNodeClick?: (nodeId: string) => void;
}

const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  ({ nodes, edges, onNodeClick }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);

    // ── Expose methods to parent via ref ─────────────────────────────────────

    useImperativeHandle(ref, () => ({
      // Zoom + center on a specific node
      focusNode(nodeId: string) {
        const cy = cyRef.current;
        if (!cy) return;
        const node = cy.getElementById(nodeId);
        if (node.empty()) return;

        cy.animate(
          {
            fit: { eles: node, padding: 250 },
            easing: "ease-in-out-cubic",
          },
          { duration: 500 },
        );

        // Select the node so it gets the selected style
        cy.elements().unselect();
        node.select();
      },

      // Dim all nodes except the provided set
      highlightNodes(nodeIds: string[]) {
        const cy = cyRef.current;
        if (!cy) return;
        const ids = new Set(nodeIds);

        cy.nodes().forEach((n) => {
          if (ids.has(n.id())) {
            n.removeClass("dimmed");
          } else {
            n.addClass("dimmed");
          }
        });

        // Also dim edges that don't connect highlighted nodes
        cy.edges().forEach((e) => {
          if (ids.has(e.source().id()) && ids.has(e.target().id())) {
            e.removeClass("dimmed");
          } else {
            e.addClass("dimmed");
          }
        });
      },

      updateElements(nodes: CodeNode[], edges: CodeEdge[]) {
        const cy = cyRef.current;
        if (!cy) return;

        const newElements = toElements(nodes, edges);
        const newIds = new Set(newElements.map((e) => e.data.id));

        // Remove elements no longer in the set
        cy.elements().forEach((ele) => {
          if (!newIds.has(ele.id())) cy.remove(ele);
        });

        // Add new elements
        const existingIds = new Set(cy.elements().map((ele) => ele.id()));
        const toAdd = newElements.filter((e) => !existingIds.has(e.data.id));
        if (toAdd.length > 0) cy.add(toAdd);

        // Re-run layout
        cy.layout({
          name: "fcose",
          animate: true,
          animationDuration: 400,
          fit: true,
          padding: 80,
          nodeSeparation: 300,
          idealEdgeLength: 500,
          nodeRepulsion: 100000,
        } as any).run();
      },

      // Restore all nodes to full opacity
      clearHighlight() {
        const cy = cyRef.current;
        if (!cy) return;
        cy.elements().removeClass("dimmed");
        cy.elements().unselect();
      },

      // Fit all elements into view
      resetView() {
        const cy = cyRef.current;
        if (!cy) return;
        cy.animate(
          { fit: { eles: cy.elements(), padding: 80 } },
          { duration: 400 },
        );
      },

      // Raw cy access for advanced operations
      getcy() {
        return cyRef.current;
      },

      // for showing the commit difference phase
      applyDiffColors(overrides: Record<string, string>) {
        const cy = cyRef.current;
        if (!cy) return;
        // Apply color overrides per node using Cytoscape's element-level style
        for (const [nodeId, color] of Object.entries(overrides)) {
          const node = cy.$(`#${CSS.escape(nodeId)}`);
          if (node.empty()) continue;
          node.style({
            "background-color": color,
            "border-color": color,
            "border-width": 3,
            "border-opacity": 0.8,
          });
        }
      },

      clearDiffColors() {
        const cy = cyRef.current;
        if (!cy) return;
        // Reset all nodes back to stylesheet-driven colors
        cy.nodes().removeStyle(
          "background-color border-color border-width border-opacity",
        );
      },
    }));

    // ── Initialize Cytoscape ─────────────────────────────────────────────────

    useEffect(() => {
      if (!containerRef.current) return;

      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: toElements(nodes, edges),

        style: [
          // ── Base node ──────────────────────────────────────────────────
          {
            selector: "node",
            style: {
              label: "data(label)",
              "text-valign": "center",
              "text-halign": "center",
              "font-size": "12px",
              "font-weight": "600",
              color: "#ffffff",
              "text-outline-width": 0,
              "text-wrap": "ellipsis" as any,
              "text-max-width": "data(size)",
              width: "data(size)",
              height: "data(size)",
            },
          },

          // ── Per-type colors + shapes ───────────────────────────────────
          ...Object.entries(NODE_COLORS).map(([type, color]) => ({
            selector: `node[type="${type}"]`,
            style: {
              "background-color": color,
              shape: NODE_SHAPES[type] ?? "ellipse",
            } as any,
          })),

          // ── GHOST override ─────────────────────────────────────────────
          {
            selector: `node[type="GHOST"]`,
            style: {
              "border-style": "dashed" as any,
              "border-width": 2,
              "background-color": "#1e293b",
              "border-color": "#6b7280",
              color: "#94a3b8",
            },
          },

          // ── Dimmed nodes/edges ─────────────────────────────────────────
          {
            selector: "node.dimmed",
            style: { opacity: 0.0, events: 'no' },
          },

          // ── Base edge ──────────────────────────────────────────────────
          {
            selector: "edge",
            style: {
              label: "data(type)",
              "font-size": "9px",
              "font-weight": "500",
              color: "#e2e8f0",
              "text-rotation": "autorotate" as any,
              "text-margin-y": -10,
              "text-outline-width": 0,
              "text-background-color": "#1e293b",
              "text-background-opacity": 0.85 as any,
              "text-background-padding": "3px" as any,
              "text-background-shape": "roundrectangle" as any,
              width: 1.5,
              "target-arrow-shape": "triangle",
              "arrow-scale": 1.2,
              "curve-style": "bezier",
              opacity: 0.9,
            },
          },

          // ── Per-type edge colors ───────────────────────────────────────
          ...Object.entries(EDGE_COLORS).map(([type, color]) => ({
            selector: `edge[type="${type}"]`,
            style: {
              "line-color": color,
              "target-arrow-color": color,
            } as any,
          })),
          {
            selector: "edge.dimmed",
            style: {
              "line-color": "#1a1f26",
              "target-arrow-color": "#1a1f26",
              opacity: 0,
              "text-opacity": 0,
              "text-background-opacity": 0 as any,
            },
          },

          // ── Selected node ──────────────────────────────────────────────
          {
            selector: "node:selected",
            style: {
              "border-width": 3,
              "border-color": "#f0f6fc",
              opacity: 1, // always full opacity when selected
            },
          },

          // ── Hover ──────────────────────────────────────────────────────
          {
            selector: "node.hover",
            style: {
              "border-width": 2,
              "border-color": "#f0f6fc",
              opacity: 1,
            },
          },
        ],

        layout: {
          name: "fcose",
          animate: true,
          animationDuration: 800,
          fit: true,
          padding: 80,
          nodeSeparation: 200,
          idealEdgeLength: 150,
          nodeRepulsion: 100000,
        } as any,

        boxSelectionEnabled: false,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        autoungrabify: true,
        wheelSensitivity: 5,
        minZoom: 0.1,
        maxZoom: 4,
      });

      const cy = cyRef.current;

      cy.on("tap", "node", (e) => onNodeClick?.(e.target.id()));
      cy.on("mouseover", "node", (e) => e.target.addClass("hover"));
      cy.on("mouseout", "node", (e) => e.target.removeClass("hover"));
      cy.on("tap", (e) => {
        if (e.target === cy) onNodeClick?.("");
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
