// tokenizer.ts
//
// Architecture: thin query/field preparation layer on top of mature libraries.
// MiniSearch owns tokenization, BM25+ scoring and index persistence; this file
// only handles what MiniSearch does not: splitting identifiers at camelCase,
// snake_case, kebab and path boundaries so "createUser" in a query reaches the
// "create user" tokens produced when names were indexed, dropping stopwords
// (stopword package, English list) and stemming (wink-porter2-stemmer).
//
// Flow: raw task text -> capture structured signals in priority order (quoted
// and backticked names, Capitalized identifiers, lowerCamelCase, path-like
// strings, snake_case, prose words longest-first) -> identifier splitting ->
// stopword removal -> stemming -> order-preserving dedupe capped at 10 terms.
// The cap matters: more terms dilute IDF discrimination. Field text for the
// index goes through splitNameparts/splitPath only (stemming happens inside
// MiniSearch uniformly for index and query sides).

import { removeStopwords } from "stopword";
import stemmer from "wink-porter2-stemmer";

export function splitNameparts(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./\\]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function splitPath(p: string): string[] {
  return p
    .replace(/[_\-./\\]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function queryTerms(task: string): string[] {
  const out: string[] = [];

  const quoted = task.match(/[`"']([^`"']{3,120})[`"']/g) ?? [];
  for (const q of quoted) out.push(...splitNameparts(q.slice(1, -1)));

  const caps = task.match(/\b[A-Z][A-Za-z0-9_]{2,}\b/g) ?? [];
  for (const c of caps) out.push(...splitNameparts(c));

  const camels = task.match(/\b[a-z][a-zA-Z0-9]*[A-Z][A-Za-z0-9]*\b/g) ?? [];
  for (const c of camels) out.push(...splitNameparts(c));

  const paths = task.match(/[\w./\\-]+\.[a-z]{1,5}\b/gi) ?? [];
  for (const p of paths) out.push(...splitPath(p));

  const snakes = task.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
  for (const s of snakes) out.push(...splitNameparts(s));

  const prose = (task.match(/\b[a-z][a-z0-9]{2,}\b/g) ?? []).sort(
    (a, b) => b.length - a.length
  );
  out.push(...prose);

  const stemmed = removeStopwords(out).map((t) => stemmer(t));

  const seen = new Set<string>();
  const final: string[] = [];
  for (const t of stemmed) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    final.push(t);
    if (final.length >= 10) break;
  }
  return final;
}
