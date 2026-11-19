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
// The committed DevLens canvas palette. These identify a type at a glance and
// users know them, so they stay as-is; `labelColorFor` below picks ink or paper
// for the label on each fill instead of assuming white, which no longer works
// now that the canvas is light.

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
  THIRD_PARTY: "#e879f9",
  // ── Newer OOP / structural types ──────────────────────────────────────────
  CLASS:       "#4ade80",
  METHOD:      "#22d3ee",
  INTERFACE:   "#facc15",
  ENUM:        "#fb7185",
  STRUCT:      "#34d399",
  MODULE:      "#a3e635",
  TRAIT:       "#d946ef",
  IMPL_BLOCK:  "#38bdf8",
  PACKAGE:     "#f43f5e",
};

/** Ink or paper label, whichever reads on the fill. */
export function labelColorFor(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.42 ? "#1c1917" : "#ffffff";
}

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
  CALLS: "#3b82f6",
  IMPORTS: "#94a3b8",
  READS_FROM: "#f59e0b",
  WRITES_TO: "#f85149",
  PROP_PASS: "#2dd4bf",
  EMITS: "#c084fc",
  LISTENS: "#a78bfa",
  WRAPPED_BY: "#3fb950",
  GUARDS: "#d29922",
  HANDLES: "#8286bb",
  TESTS: "#f97316",
  USES: "#a78bfa",
  NEXTJS_API_CALL: "#ec4899",
  NAVIGATES_TO: "#22d3ee",
  // Structural / new edge types
  IMPLEMENTS: "#4ade80",
  EXTENDS: "#facc15",
  EXPORTS: "#a3e635",
  THROWS: "#fb7185",
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

/**
 * Layout for the node overlay. fcose is beautiful and O(n²)-ish; on a 1000-node
 * subgraph it allocates enough force-layout state to take the tab down, and the
 * overlay is a browsing surface where instant beats pretty. Beyond a few hundred
 * nodes, a breadth-first tree is both cheaper and easier to read.
 */
export function getSubgraphLayoutConfig(nodeCount: number) {
  if (nodeCount > 350) {
    return {
      name: "breadthfirst",
      directed: false,
      spacingFactor: 1.15,
      animate: false,
      fit: true,
      padding: 40,
    } as any;
  }
  return getLayoutConfig(nodeCount);
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
        "font-size":          "14px",
        "font-weight":        "600",
        color:                "data(labelColor)",
        "text-outline-width": 0,
        "text-wrap":          "ellipsis" as any,
        "text-max-width":     "data(size)",
        // Labels stay on for the whole zoom range. Hiding them below a zoom
        // threshold (it was 9) meant the fitted overview of a 400-node graph
        // rendered as an unlabelled blob, which is exactly when a reader needs
        // the names. 2 only skips nodes that are sub-pixel anyway.
        "min-zoomed-font-size": 2,
        "padding":            "10px" as any,
        "border-width":       0,
        width:                "data(size)",
        height:               "data(size)",
      },
    },

    // ── Anchor labels ────────────────────────────────────────────────────────
    // Always drawn, with a halo, and resized by GraphCanvas so they stay ~12px
    // on screen whatever the zoom.
    {
      selector: "node[?anchor]",
      style: {
        "font-size":           "12px",
        "font-weight":         "700",
        color:                 "#1c1917",
        "text-outline-width":  3,
        "text-outline-color":  "#faf9f6",
        "text-max-width":      "190px",
        "text-wrap":           "ellipsis" as any,
        "min-zoomed-font-size": 0,
        "z-index":             20,
      } as any,
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
        "border-color":   "#1c1917",
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