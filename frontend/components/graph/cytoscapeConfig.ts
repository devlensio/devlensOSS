import { EdgeType, NodeType } from "@/lib/types";
import cytoscape from "cytoscape";


export const EDGE_TYPES: EdgeType[] = [
  "CALLS",
  "IMPORTS",
  "READS_FROM",
  "WRITES_TO",
  "PROP_PASS",
  "EMITS",
  "LISTENS",
  "WRAPPED_BY",
  "GUARDS",
  "HANDLES",
  "TESTS",
  "USES"
];

export const NODE_TYPES: NodeType[] = [
  "COMPONENT",
  "HOOK",
  "FUNCTION",
  "STATE_STORE",
  "UTILITY",
  "FILE",
  "GHOST",
  "ROUTE",
  "TEST",
  "STORY",
];

export const DEFAULT_NODE_TYPES: NodeType[] = [
  "COMPONENT",
  "HOOK",
  "FUNCTION",
  "STATE_STORE",
  // "UTILITY",
  // "GHOST",
  "ROUTE",
  "TEST",
  "STORY",
  "ROUTE",
];

export const DEFAULT_EDGE_TYPES: EdgeType[] = [
  "CALLS", "PROP_PASS", "READS_FROM", "WRITES_TO",
  "EMITS", "LISTENS", "WRAPPED_BY", "GUARDS", "TESTS", "USES", "HANDLES"
];

// ─── Node colors ──────────────────────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  COMPONENT:   "#2dd4bf",
  HOOK:        "#c084fc",
  FUNCTION:    "#60a5fa",
  STATE_STORE: "#fb923c",  
  UTILITY:     "#94a3b8",
  FILE:        "#f472b6",  
  GHOST:       "#6b7280",
  ROUTE:       "#818cf8",
  TEST:        "#f97316",
  STORY:       "#a78bfa",  
};

export const NODE_SHAPES: Record<string, string> = {
  COMPONENT: "roundrectangle",
  HOOK: "ellipse",
  FUNCTION: "hexagon",
  STATE_STORE: "star",
  UTILITY: "rectangle",
  FILE: "tag",
  GHOST: "diamond",
  ROUTE: "pentagon",
  TEST: "triangle",
  STORY: "round-triangle",
};

export const EDGE_COLORS: Record<string, string> = {
  CALLS: "#3b82f6",
  IMPORTS: "#94a3b8",
  READS_FROM: "#f59e0b",
  WRITES_TO: "#f85149",
  PROP_PASS: "#2dd4bf",
  EMITS: "#c084fc",
  LISTENS: "#c084fc",
  WRAPPED_BY: "#3fb950",
  GUARDS: "#d29922",
  HANDLES:    "#8286bb",
  TESTS:      "#f97316",
  USES:      "#a78bfa",
};

// ─── Layout config ────────────────────────────────────────────────────────────

export function getLayoutConfig(nodeCount: number) {
  return {
    name:              "fcose",
    animate:           nodeCount <= 200,
    animationDuration: 600,
    fit:               true,
    padding:           80,
    nodeSeparation:    nodeCount > 500 ? 500  : 150,
    idealEdgeLength:   nodeCount > 200 ? 550 : 150,
    nodeRepulsion:     nodeCount > 200 ? 8000 : 6000, 
    numIter:           nodeCount > 500 ? 500 : 2500,
    tile:              true,
    tilingPaddingVertical:   15,
    tilingPaddingHorizontal: 15,
  } as any;
}

// ─── Cytoscape styles ─────────────────────────────────────────────────────────

export function getCytoscapeStyles(
  rootNodeId?: string
): cytoscape.StylesheetStyle[] {
  return [
    // ── Base node ────────────────────────────────────────────────────────────
    {
      selector: "node",
      style: {
        label:                "data(label)",
        "text-valign":        "center",
        "text-halign":        "center",
        "font-size":          "14px",
        "font-weight":        "600",
        color:                "#ffffff",
        "text-outline-width": 0,
        "text-wrap":          "ellipsis" as any,
        "text-max-width":     "data(size)",
        "padding":            "10px" as any,
        "border-width":       0,
        width:                "data(size)",
        height:               "data(size)",
      },
    },

    // ── Per-type colors + shapes ─────────────────────────────────────────────
    ...Object.entries(NODE_COLORS).map(([type, color]) => ({
      selector: `node[type="${type}"]`,
      style: {
        "background-color": color,
        shape: NODE_SHAPES[type] ?? "ellipse",
      } as any,
    })),

    // ── GHOST ────────────────────────────────────────────────────────────────
    {
      selector: `node[type="GHOST"]`,
      style: {
        "border-style":       "dashed" as any,
        "border-width":       2,
        "background-color":   "#1e293b",
        "border-color":       "#6b7280",
        color:                "#94a3b8",
      },
    },

    // ── Root node — distinct highlight ───────────────────────────────────────
    ...(rootNodeId ? [{
      selector: `node[id = "${rootNodeId}"]`,
      style: {
        "border-width":   4,
        "border-color":   "#2dd4bf",
        "border-opacity": 1,
      } as any,
    }] : []),

    // ── Dimmed ───────────────────────────────────────────────────────────────
    {
      selector: "node.dimmed",
      style: {
        opacity:  0,
        "events": "no" as any,
      },
    },
    {
      selector: "edge.dimmed",
      style: {
        opacity:                   0,
        "events":                  "no" as any,
        "text-opacity":            0,
        "text-background-opacity": 0 as any,
      },
    },

    // ── Base edge ────────────────────────────────────────────────────────────
    {
      selector: "edge",
      style: {
        label:                     "data(type)",
        "font-size":               "9px",
        "font-weight":             "500",
        color:                     "#e2e8f0",
        "text-rotation":           "autorotate" as any,
        "text-margin-y":           -10,
        "text-outline-width":      0,
        "text-background-color":   "#1e293b",
        "text-background-opacity": 0.85 as any,
        "text-background-padding": "3px" as any,
        "text-background-shape":   "roundrectangle" as any,
        width:                     1.5,
        "target-arrow-shape":      "triangle",
        "arrow-scale":             1.2,
        "curve-style":             "bezier",
        opacity:                   0.9,
      },
    },

    // ── Per-type edge colors ─────────────────────────────────────────────────
    ...Object.entries(EDGE_COLORS).map(([type, color]) => ({
      selector: `edge[type="${type}"]`,
      style: {
        "line-color":         color,
        "target-arrow-color": color,
      } as any,
    })),

    // ── Selected ─────────────────────────────────────────────────────────────
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#f0f6fc",
        opacity:        1,
        "z-index":      9999,
      },
    },

    // ── Hover ────────────────────────────────────────────────────────────────
    {
      selector: "node.hover",
      style: {
        "border-width": 2,
        "border-color": "#f0f6fc",
        opacity:        1,
      },
    },
  ];
}