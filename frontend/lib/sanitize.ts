import DOMPurify from "dompurify";
import type { Config } from "dompurify";

// ─── Sanitization configuration ───────────────────────────────────────────────
//
// Allowlist of tags and attributes needed for LLM-generated summaries.
// The prompts instruct the LLM to use: <code>, <pre>, <ul>, <ol>, <li>,
// <strong>, <p>, and plain prose. We allowlist exactly those plus
// harmless structural tags, and strip everything else.

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "a",
  "span",
];

const ALLOWED_ATTR = [
  "href",      // for <a> links (sanitized separately)
  "title",
  "className", // not used in raw HTML but harmless to allow
];

// ─── DOMPurify config for summary HTML ────────────────────────────────────────

const SUMMARY_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
  ADD_ATTR: ["target", "rel"],
};

// ─── Relaxed config for code highlighting (hljs output) ──────────────────────
//
// highlight.js produces <span> elements with class attributes for syntax
// coloring. We need to allow those through.

const HLJS_CONFIG: Config = {
  ALLOWED_TAGS: [...ALLOWED_TAGS, "span", "div"],
  ALLOWED_ATTR: [...ALLOWED_ATTR, "class"],
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sanitize LLM-generated HTML summary content.
 * Strips all tags not in the allowlist, neutralizing script injection,
 * event handlers, and dangerous URIs.
 */
export function sanitizeSummary(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, SUMMARY_CONFIG) as unknown as string;
}

/**
 * Sanitize highlight.js output.
 * Allows class attributes for syntax-highlighting spans while still
 * stripping script tags, event handlers, and dangerous URIs.
 */
export function sanitizeHighlightedCode(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, HLJS_CONFIG) as unknown as string;
}
