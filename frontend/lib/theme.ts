// ─── DevLens visual tokens ───────────────────────────────────────────────────
//
// Two surfaces, deliberately different:
//
//   UI    — warm paper light theme for every chrome surface: navbar, sidebar,
//           node panel, filters, tooltips. Optimised for reading prose and
//           scanning lists in a bright room.
//   CODE  — Dracula dark theme for anything that shows source. Developers read
//           code in a dark IDE, so the code panes keep that exact familiarity
//           even while the rest of the app is light.
//
// Import these instead of re-declaring a local `C = {...}` object in every
// component: the palette drifted between panels when each file owned a copy.

export const UI = {
  bg: "#faf9f6",
  surface: "#ffffff",
  elevated: "#f4f2ec",
  sunk: "#eeece4",
  border: "#e3ded3",
  borderSubtle: "#ece8df",

  text: "#1c1917",
  textSub: "#57534e",
  textDim: "#78716c",
  textGhost: "#8c857a",

  accent: "#0e766e",
  accentHover: "#0b5f59",
  accentSoft: "rgba(14, 118, 110, 0.08)",
  accentBorder: "rgba(14, 118, 110, 0.26)",

  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
  info: "#1d4ed8",
} as const;

export const CODE = {
  bg: "#282a36",
  surface: "#21222c",
  elevated: "#343746",
  border: "#44475a",
  borderSoft: "#3a3c4d",

  text: "#f8f8f2",
  textSub: "#c6c9dd",
  textDim: "#9ba1bf",

  cyan: "#8be9fd",
  green: "#50fa7b",
  orange: "#ffb86c",
  pink: "#ff79c6",
  purple: "#bd93f9",
  red: "#ff5555",
  yellow: "#f1fa8c",
  comment: "#6272a4",
} as const;

/** Hex + alpha suffix, e.g. `tint(UI.accent, "14")`. */
export const tint = (hex: string, alpha = "14") => `${hex}${alpha}`;

/**
 * Bumped whenever the graph UI changes in a way the user needs to confirm is
 * live. Rendered small in the code-view bar: when a fix "doesn't apply", the
 * first question is which bundle the tab is actually running.
 */
export const UI_REV = "drag-2";

export const RADIUS = { sm: 6, md: 8, lg: 12, xl: 16 } as const;

/** Shared scale — keeps every panel on the same vertical rhythm. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;