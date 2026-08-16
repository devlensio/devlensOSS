// ─── TypeGlyph ───────────────────────────────────────────────────────────────
//
// Clean inline SVG glyphs for every node type. Each glyph is a simple
// geometric shape rendered as the type's colour stroke — no fill, no
// border-box chrome, no accent strip. The shapes mirror the Cytoscape node
// shapes (see NODE_SHAPES in cytoscapeConfig.ts) so the filter panel doubles
// as a real legend: the icon next to "Function" is the same hexagon you'll
// see on the canvas.
//
// Sized 14×14 by default (matches the react-icons used elsewhere). Pass
// `size` to scale.

import React from "react";

export function TypeGlyph({
  type,
  size = 14,
  color = "currentColor",
}: {
  type: string;
  size?: number;
  color?: string;
}): React.ReactElement {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: color,
    strokeWidth: 1.4,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };

  switch (type) {
    // ── Frontend / React ──
    case "COMPONENT":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
          <path d="M5 2.5 V1.5 M8 2.5 V1.5 M11 2.5 V1.5
                   M5 13.5 V14.5 M8 13.5 V14.5 M11 13.5 V14.5" />
        </svg>
      );
    case "HOOK":
      // a fish-hook curve — "hook"
      return (
        <svg {...common}>
          <path d="M3 3 V8 A5 5 0 0 0 13 8 V5" />
          <circle cx="13" cy="5" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case "FUNCTION":
      // hexagon (matches NODE_SHAPES)
      return (
        <svg {...common}>
          <path d="M8 1.5 L13.5 5 V11 L8 14.5 L2.5 11 V5 Z" />
        </svg>
      );
    case "STATE_STORE":
      // cylinder / database — the universal "store" glyph
      return (
        <svg {...common}>
          <ellipse cx="8" cy="3.5" rx="5" ry="1.6" />
          <path d="M3 3.5 V12.5 A5 1.6 0 0 0 13 12.5 V3.5" />
          <path d="M3 6.5 A5 1.6 0 0 0 13 6.5" />
          <path d="M3 9.5 A5 1.6 0 0 0 13 9.5" />
        </svg>
      );
    case "UTILITY":
      // wrench
      return (
        <svg {...common}>
          <path d="M3.5 12.5 L8 8" />
          <path d="M11 3 A3 3 0 0 0 6 5 L3 5 L3 7 L6 7 A3 3 0 0 0 12 5 L13 7 L13 5 Z" />
        </svg>
      );
    case "FILE":
      // page with folded corner
      return (
        <svg {...common}>
          <path d="M3.5 2 H10 L12.5 4.5 V14 H3.5 Z" />
          <path d="M10 2 V4.5 H12.5" />
          <path d="M5.5 8 H10.5 M5.5 10.5 H10.5" />
        </svg>
      );
    case "GHOST":
      // dashed diamond — matches the dashed GHOST shape on canvas
      return (
        <svg {...common} strokeDasharray="1.5 1.5">
          <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />
        </svg>
      );
    case "ROUTE":
      // signpost / arrow on a path
      return (
        <svg {...common}>
          <path d="M3 3 L13 8 L3 13 Z" fill={color} stroke="none" />
          <path d="M0 8 H3 M13 8 H16" opacity="0.5" />
        </svg>
      );
    case "TEST":
      // flask
      return (
        <svg {...common}>
          <path d="M6 2 H10 M6.5 2 V6 L3.5 12 A2 2 0 0 0 5.3 14.5 H10.7 A2 2 0 0 0 12.5 12 L9.5 6 V2" />
          <path d="M4.5 10 H11.5" />
        </svg>
      );
    case "STORY":
      // book — storybook
      return (
        <svg {...common}>
          <path d="M3 3 H8 V13 H3 Z" />
          <path d="M8 3 H13 V13 H8" />
          <path d="M8 3 V13" />
        </svg>
      );
    case "THIRD_PARTY":
      // package box with band
      return (
        <svg {...common}>
          <path d="M8 1.5 L13.5 4 V12 L8 14.5 L2.5 12 V4 Z" />
          <path d="M2.5 4 L8 6.5 L13.5 4" />
          <path d="M8 6.5 V14.5" />
        </svg>
      );

    // ── OO / Structural ──
    case "CLASS":
      // "C" badge
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
          <path d="M10 6 A2.5 2.5 0 1 0 10 10" />
        </svg>
      );
    case "METHOD":
      // gears
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 2.5 V4.5 M8 11.5 V13.5 M2.5 8 H4.5 M11.5 8 H13.5
                   M4 4 L5.2 5.2 M10.8 10.8 L12 12 M4 12 L5.2 10.8 M10.8 5.2 L12 4" />
        </svg>
      );
    case "INTERFACE":
      // "I" badge
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
          <path d="M8 5 V11" />
        </svg>
      );
    case "ENUM":
      // list of values
      return (
        <svg {...common}>
          <path d="M3 4 H5 M3 8 H5 M3 12 H5" />
          <path d="M6.5 4 H13 M6.5 8 H13 M6.5 12 H10" />
        </svg>
      );
    case "STRUCT":
      // braces { }
      return (
        <svg {...common}>
          <path d="M5 2 C3.5 2 3.5 4 3.5 5 V7 C3.5 7.5 3 8 2.5 8 C3 8 3.5 8.5 3.5 9 V11 C3.5 12 3.5 14 5 14" />
          <path d="M11 2 C12.5 2 12.5 4 12.5 5 V7 C12.5 7.5 13 8 13.5 8 C13 8 12.5 8.5 12.5 9 V11 C12.5 12 12.5 14 11 14" />
          <path d="M6 8 H10" />
        </svg>
      );
    case "MODULE":
      // stacked layers
      return (
        <svg {...common}>
          <path d="M8 1.5 L14 4 L8 6.5 L2 4 Z" />
          <path d="M2 7 L8 9.5 L14 7" />
          <path d="M2 10 L8 12.5 L14 10" />
        </svg>
      );
    case "TRAIT":
      // sparkle / trait star
      return (
        <svg {...common}>
          <path d="M8 2 L9.3 6.7 L14 8 L9.3 9.3 L8 14 L6.7 9.3 L2 8 L6.7 6.7 Z" fill={color} />
        </svg>
      );
    case "IMPL_BLOCK":
      // "impl" block — nested rect
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M2 6.5 H14" />
          <path d="M4 9 H8 M4 11 H10" opacity="0.7" />
        </svg>
      );
    case "PACKAGE":
      // crate
      return (
        <svg {...common}>
          <path d="M2.5 5 L8 2.5 L13.5 5 V11 L8 13.5 L2.5 11 Z" />
          <path d="M2.5 5 L8 7.5 L13.5 5 M8 7.5 V13.5" />
        </svg>
      );

    default:
      // generic node circle
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
        </svg>
      );
  }
}
