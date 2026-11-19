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
  "USES",
  "NEXTJS_API_CALL",
  "NAVIGATES_TO",
  "IMPLEMENTS",
  "EXTENDS",
  "EXPORTS",
  "THROWS"
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
  "THIRD_PARTY",
  "CLASS",
  "METHOD",
  "INTERFACE",
  "ENUM",
  "STRUCT",
  "MODULE",
  "TRAIT",
  "IMPL_BLOCK",
  "PACKAGE",
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
  // OOP / new-language defaults — they usually exist only when relevant,
  // but we include the high-signal structural types so Python/Java/Go/Rust
  // graphs show their core constructs immediately after analysis.
  "CLASS",
  "METHOD",
  "INTERFACE",
  "ENUM",
  "STRUCT",
  "TRAIT",
  "MODULE",
  "PACKAGE",
];

export const DEFAULT_EDGE_TYPES: EdgeType[] = [
  "CALLS", "PROP_PASS", "READS_FROM", "WRITES_TO",
  "EMITS", "LISTENS", "WRAPPED_BY", "GUARDS", "TESTS", "USES", "HANDLES", "NEXTJS_API_CALL", "NAVIGATES_TO",
  "IMPLEMENTS", "EXTENDS", "EXPORTS", "THROWS",
];

// ─── Node colors ──────────────────────────────────────────────────────────────
//
// A curated light-surface palette: one deep, desaturated tone per semantic
// family instead of neon pastels. The canvas is paper-coloured now, so the
// fills carry the identity and the labels stay white on 600/700 tones.
// Families: teal/cyan = UI, blue/indigo = logic & routing, violet/purple =
// reactivity & abstraction, amber/green = data & tests, neutral = structural.

export const NODE_COLORS: Record<string, string> = {
  COMPONENT:   "#0f766e", // teal-700
  HOOK:        "#7c3aed", // violet-600
  FUNCTION:    "#2563eb", // blue-600
  STATE_STORE: "#b45309", // amber-700
  UTILITY:     "#475569", // slate-600
  FILE:        "#78716c", // stone-500
  GHOST:       "#a8a29e", // stone-400
  ROUTE:       "#4f46e5", // indigo-600
  TEST:        "#059669", // emerald-600
  STORY:       "#a21caf", // fuchsia-700
  THIRD_PARTY: "#6b7280", // gray-500
  // ── OOP / structural types ────────────────────────────────────────────────
  CLASS:       "#16a34a", // green-600
  METHOD:      "#0284c7", // sky-600
  INTERFACE:   "#a16207", // yellow-700
  ENUM:        "#be123c", // rose-700
  STRUCT:      "#0891b2", // cyan-600
  MODULE:      "#4d7c0f", // lime-700
  TRAIT:       "#7e22ce", // purple-700
  IMPL_BLOCK:  "#155e75", // cyan-800
  PACKAGE:     "#db2777", // pink-600
};

// Bright accent used for chip dots / detail-panel swatches. With the bright
// fill palette above, the accent is simply the fill colour itself.
export const NODE_ACCENTS: Record<string, string> = NODE_COLORS;

export const NODE_SHAPES: Record<string, string> = {
  COMPONENT:   "round-rectangle",
  HOOK:        "ellipse",
  FUNCTION:    "hexagon",
  STATE_STORE: "star",
  UTILITY:     "rectangle",
  FILE:        "tag",
  GHOST:       "diamond",
  ROUTE:       "pentagon",
  TEST:        "triangle",
  STORY:       "round-triangle",
  THIRD_PARTY: "hexagon",
  // OOP / structural
  CLASS:       "round-rectangle",
  METHOD:      "round-rectangle",
  INTERFACE:   "round-diamond",
  ENUM:        "diamond",
  STRUCT:      "round-rectangle",
  MODULE:      "round-rectangle",
  TRAIT:       "round-diamond",
  IMPL_BLOCK:  "ellipse",
  PACKAGE:     "rectangle",
};

export const EDGE_COLORS: Record<string, string> = {
  CALLS: "#2563eb",
  IMPORTS: "#78716c",
  READS_FROM: "#b45309",
  WRITES_TO: "#b91c1c",
  PROP_PASS: "#0f766e",
  EMITS: "#7c3aed",
  LISTENS: "#6366f1",
  WRAPPED_BY: "#15803d",
  GUARDS: "#a16207",
  HANDLES: "#64748b",
  TESTS: "#c2410c",
  USES: "#8b5cf6",
  NEXTJS_API_CALL: "#db2777",
  NAVIGATES_TO: "#0891b2",
  // Structural / new edge types
  IMPLEMENTS: "#16a34a",
  EXTENDS: "#a16207",
  EXPORTS: "#4d7c0f",
  THROWS: "#be123c",
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
  rootNodeId?: string,
): cytoscape.StylesheetStyle[] {
  return [
    // ── Base node ────────────────────────────────────────────────────────────
    {
      selector: "node",
      style: {
        label:                "data(label)",
        "text-valign":        "center",
        "text-halign":        "center",
        "font-size":          "13px",
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

    // ── Rendering boundary borders ────────────────────────────────────────────
    {
      selector: 'node[renderingBoundary="client"]',
      style: {
        "border-width": 3,
        "border-color": "#0891b2",
        "border-opacity": 1,
      } as any,
    },
    {
      selector: 'node[renderingBoundary="server"]',
      style: {
        "border-width": 3,
        "border-color": "#b45309",
        "border-opacity": 1,
      } as any,
    },

    // ── GHOST ────────────────────────────────────────────────────────────────
    {
      selector: `node[type="GHOST"]`,
      style: {
        "border-style":       "dashed" as any,
        "border-width":       2,
        "background-color":   "#e7e5e4",
        "border-color":       "#a8a29e",
        color:                "#57534e",
      } as any,
    },

    // ── Root node — distinct highlight ───────────────────────────────────────
    ...(rootNodeId ? [{
      selector: `node[id = "${rootNodeId}"]`,
      style: {
        "border-width":   4,
        "border-color":   "#0e766e",
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
        label:                     "data(label)",
        "font-size":               "10px",
        "font-weight":             "500",
        color:                     "#44403c",
        // Horizontal pills read far better than labels rotated along the edge.
        "text-rotation":           "none" as any,
        "text-margin-y":           -10,
        "text-outline-width":      0,
        "text-background-color":   "#faf9f6",
        "text-background-opacity": 0.94 as any,
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

    // ── Module-scope CALLS (FILE → symbol) ───────────────────────────────────
    // The edge type stays CALLS; the dashed line only signals that the caller
    // is the file's top-level code, not a function body.
    {
      selector: 'edge[scope="module"]',
      style: {
        "line-style": "dashed",
      } as any,
    },

    // ── Selected ─────────────────────────────────────────────────────────────
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#1c1917",
        opacity:        1,
        "z-index":      9999,
      },
    },

    // ── Hover ────────────────────────────────────────────────────────────────
    {
      selector: "node.hover",
      style: {
        "border-width": 2,
        "border-color": "#1c1917",
        opacity:        1,
      },
    },

    // ── Focus mode ───────────────────────────────────────────────────────────
    // A selected node dims everything outside its closed neighbourhood, so the
    // ego network is the only thing on screen. Edge ordinals are promoted to a
    // readable pill: 9px labels on a thousand-node canvas were unreadable.
    {
      selector: "node.ego-dim",
      style: {
        opacity: 0.08,
      } as any,
    },
    {
      selector: "edge.ego-dim",
      style: {
        opacity: 0.06,
      } as any,
    },
    {
      selector: "edge.ego-focus",
      style: {
        "font-size":                 12,
        width:                       2,
        "text-background-color":     "#ffffff",
        "text-background-opacity":   0.96,
        "text-background-padding":   3,
        "text-background-shape":     "roundrectangle",
        "text-border-color":         "#e3ded3",
        "text-border-width":         1,
        "text-border-opacity":       1,
        color:                       "#1c1917",
        "z-index":                   50,
      } as any,
    },
  ];
}