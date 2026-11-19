import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import "highlight.js/styles/github-dark.css";
import { sanitizeHighlightedCode } from "@/lib/sanitize";

let registered = false;

function register() {
  if (registered) return;
  registered = true;
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("css", css);
}

const LANGS = ["typescript", "javascript", "python", "java", "go", "rust", "bash", "json", "yaml", "xml", "css"];

export function languageFor(graphLanguage: string | undefined, filePath: string | undefined): string | undefined {
  const lang = (graphLanguage ?? "").toLowerCase();
  if (lang.includes("typescript") || lang.includes("javascript")) return "typescript";
  if (lang.includes("python")) return "python";
  if (lang.includes("java") && !lang.includes("javascript")) return "java";
  if (lang.includes("go")) return "go";
  if (lang.includes("rust")) return "rust";
  const ext = (filePath ?? "").split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": case "tsx": return "typescript";
    case "js": case "jsx": case "mjs": case "cjs": return "javascript";
    case "py": return "python";
    case "java": return "java";
    case "go": return "go";
    case "rs": return "rust";
    case "sh": case "bash": return "bash";
    case "json": return "json";
    case "yml": case "yaml": return "yaml";
    case "html": case "xml": case "svg": return "xml";
    case "css": case "scss": return "css";
    default: return undefined;
  }
}

/** Highlight a snippet to sanitized HTML. Falls back to auto-detection. */
export function highlightToHtml(
  code: string,
  graphLanguage?: string,
  filePath?: string,
): string {
  if (!code) return "";
  register();
  const lang = languageFor(graphLanguage, filePath);
  const out = lang
    ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    : hljs.highlightAuto(code, LANGS).value;
  return sanitizeHighlightedCode(out);
}
function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turn occurrences of graph node names inside highlighted HTML into clickable
 * spans. Only text outside tags is replaced, so the highlighter's markup is
 * preserved. Longest names win, so `resolveGraphNode` is not split by
 * `resolveGraph`.
 */
export function linkifyCode(html: string, names: Map<string, string>): string {
  if (!html || names.size === 0) return html;
  const keys = [...names.keys()].filter((k) => k.length > 2).sort((a, b) => b.length - a.length);
  if (!keys.length) return html;
  const re = new RegExp(`\\b(${keys.map(escRe).join("|")})\\b`, "g");

  return html
    .split(/(<[^>]+>)/)
    .map((seg) => {
      if (seg.startsWith("<")) return seg;
      return seg.replace(re, (m) => {
        const id = names.get(m)!;
        const safe = id.replace(/"/g, "&quot;");
        return `<span class="code-node-link" data-node="${safe}">${m}</span>`;
      });
    })
    .join("");
}
