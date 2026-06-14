"use client";

import parse, { type DOMNode } from "html-react-parser";
import { sanitizeSummary, sanitizeHighlightedCode } from "@/lib/sanitize";

// ─── SafeHtml ────────────────────────────────────────────────────────────────
//
// Alternative to dangerouslySetInnerHTML that parses HTML into React elements.
// React controls the DOM tree, so event handlers in the HTML are inert —
// they never execute because React never attaches them.
//
// This approach:
//   1. Sanitizes with DOMPurify (removes dangerous tags/attributes)
//   2. Parses the sanitized HTML into a React element tree via html-react-parser
//   3. Returns a React fragment — no dangerouslySetInnerHTML needed
//
// Trade-offs:
//   + Eliminates the core React anti-pattern (dangerouslySetInnerHTML)
//   + React owns the DOM — injected event handlers are impossible
//   + DOMPurify still strips dangerous tags as defense-in-depth
//   − Slight overhead from parsing HTML into an element tree
//   − Some edge-case HTML structures may render differently
//   − Adds a dependency (html-react-parser) and its bundle cost (~3 KB gzip)

interface SafeHtmlProps {
  /** Raw HTML string to render */
  html: string;
  /** Use highlight.js config (allows class attrs for syntax spans) */
  mode?: "summary" | "highlighted";
  /** Optional className on the wrapper div */
  className?: string;
  /** Optional inline styles on the wrapper div */
  style?: React.CSSProperties;
}

export function SafeHtml({
  html,
  mode = "summary",
  className,
  style,
}: SafeHtmlProps) {
  if (!html) return null;

  const sanitized =
    mode === "highlighted"
      ? sanitizeHighlightedCode(html)
      : sanitizeSummary(html);

  const elements = parse(sanitized, {
    // Only allow known-safe tags — belt-and-suspenders with DOMPurify
    replace: (domNode: DOMNode) => {
      // html-react-parser types the domNode loosely;
      // we cast to access name/attribs for element nodes.
      const node = domNode as any;

      // Skip text nodes and comments
      if (!node || typeof node.type !== "string") return undefined;

      // Strip any remaining script/style/iframe/object tags
      // (DOMPurify already removes these, but this is defense-in-depth)
      const dangerous = new Set([
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "textarea",
        "select",
        "button",
        "link",
        "meta",
        "base",
      ]);
      if (dangerous.has(node.name)) return <></>;

      return undefined; // allow default rendering
    },
  });

  return (
    <div className={className} style={style}>
      {elements}
    </div>
  );
}

// ─── Standalone parsers ───────────────────────────────────────────────────────
//
// For cases where you want the parsed React nodes without a wrapper div
// (e.g., injecting into an existing container).

export function parseSummaryToElements(html: string): React.ReactNode {
  if (!html) return null;
  const sanitized = sanitizeSummary(html);
  const result = parse(sanitized);
  return result;
}

export function parseHighlightedToElements(html: string): React.ReactNode {
  if (!html) return null;
  const sanitized = sanitizeHighlightedCode(html);
  const result = parse(sanitized);
  return result;
}
