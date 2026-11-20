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
  "href",   // for <a> links (sanitized separately)
  "title",
  "class",  // summary-label marks a bold topic heading
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

const HAS_BLOCKS = /<(p|ul|ol|pre|li|div|br|h[1-6])\b/i;

/**
 * Summaries arrive as a mix of HTML (`<code>`, `<ul>`) and plain prose whose
 * only structure is newlines. Handing the plain kind to the browser collapses
 * it into one wall of text, so paragraphs are made explicit here and the
 * result is sanitized in the same pass.
 */
export function summaryToHtml(raw: string): string {
  if (!raw) return "";
  const html = HAS_BLOCKS.test(raw)
    ? wrapLooseText(raw)
    : raw
        .split(/\n\s*\n/)
        .map(par => `<p>${par.trim().replace(/\n/g, "<br/>")}</p>`)
        .join("");
  return sanitizeSummary(markTopicLabels(html));
}

// Prose that sits before the first block tag is a bare text node, so it loses
// its paragraph spacing and justification. Wrap each such run in a <p>.
function wrapLooseText(html: string): string {
  return html
    .split(/(<\/?(?:p|ul|ol|li|pre|h[1-6]|div|blockquote|table)\b[^>]*>)/i)
    .map((part, i) => {
      if (i % 2 === 1) return part;                     // the tag itself
      const text = part.trim();
      if (!text) return part;
      return `<p>${text.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

// Summaries use "Label: body" as their structure. A bold run that ends in a
// colon is a topic heading and gets its own line; bold used mid-sentence for
// emphasis is left inline.
function markTopicLabels(html: string): string {
  return html.replace(
    /<strong>\s*([^<]{1,60}?):\s*<\/strong>/g,
    (_match, label: string) => `<strong class="summary-label">${label}:</strong>`,
  );
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
