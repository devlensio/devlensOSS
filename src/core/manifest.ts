// Shared manifest scanner — language detection + third-party dependency listing
// for ALL supported languages (JS/TS, Python, Go, Rust, Java).
//
// Used by two consumers so behavior never drifts:
//   - `devlens detect`  (CLI) — quick language/framework/deps report for agents
//   - pre-scan handler   (server) — third-party layer for the analyze UI gate
//
// The engine's own `detectLanguage` isn't part of the public API, and the
// pre-scan path only read package.json — non-JS repos silently lost their
// whole third-party layer. This module is the fix, engine-independent.

import fs from "node:fs";
import path from "node:path";

export type Language = "javascript" | "typescript" | "python" | "go" | "rust" | "java" | "unknown";

export interface DepEntry {
  name: string;
  version?: string;
}

export interface ManifestScan {
  language: Language;
  /** The manifest that defines the primary language (the "entry" manifest). */
  manifest: string | null;
  /** Every manifest-ish file found in the repo root (any language). */
  manifests: string[];
  dependencies: DepEntry[];
  devDependencies: DepEntry[];
  hasConfig: Record<string, boolean>;
}

// ── detection ────────────────────────────────────────────────────────────────

const MANIFEST_CANDIDATES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
] as const;

function fileExists(dir: string, file: string): boolean {
  try {
    return fs.statSync(path.join(dir, file)).isFile();
  } catch {
    return false;
  }
}

/** Detect the primary language of a repo by its manifests (same rules as the engine). */
export function detectLanguage(repoPath: string): Language {
  const root = path.resolve(repoPath);
  const has = (f: string) => fileExists(root, f);

  if (has("package.json")) {
    return has("tsconfig.json") ? "typescript" : "javascript";
  }
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) return "python";
  if (has("go.mod")) return "go";
  if (has("Cargo.toml")) return "rust";
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) return "java";
  return "unknown";
}

/** Human label for a detected language (used in CLI output). */
export const LANGUAGE_LABEL: Record<Language, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  unknown: "Unknown",
};

// ── dependency parsers (dependency-free, tolerant) ───────────────────────────

const SPEC_EXTRA = /\[[^\]]*\]/g;

/** `fastapi==0.115` / `flask>=3` / `pydantic[email]` / `name @ url` → name + version */
function cleanSpec(spec: string): DepEntry {
  const raw = (spec.replace(SPEC_EXTRA, "").trim().split(/\s+/)[0] ?? "").replace(/,$/, "");
  const m = /^([A-Za-z0-9_.-]+)(.*)$/.exec(raw);
  if (!m) return { name: raw };
  return { name: m[1], version: m[2]?.replace(/^[=~<>!]+/, "") || undefined };
}

/** Parse `name = "version"` style TOML table rows (Cargo / pyproject). */
function parseTomlRow(line: string): DepEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) return null;
  const eq = trimmed.indexOf("=");
  if (eq === -1) return null;
  const key = trimmed.slice(0, eq).trim().replace(/"/g, "");
  if (!key || key.includes(".")) return null; // section metadata (name/version/etc.)
  const value = trimmed.slice(eq + 1).replace(/,$/, "").trim();
  // key = { version = "1.2.3" } | key = { workspace = true } | key = "*"
  const inner = /^\{(.*)\}$/.exec(value)?.[1] ?? "";
  if (inner) {
    const verMatch = /version\s*=\s*"([^"]*)"/.exec(inner);
    return { name: key, version: verMatch?.[1] ?? undefined };
  }
  if (value === "true" || value === "false" || value === "workspace") return { name: key };
  const version = value.replace(/^"|"$/g, "");
  return { name: key, version: version && version !== "*" ? version : undefined };
}

function parseJsonManifest(file: string): { deps: DepEntry[]; devDeps: DepEntry[] } {
  try {
    const pkg = JSON.parse(fs.readFileSync(file, "utf-8"));
    const toDeps = (obj: unknown): DepEntry[] =>
      obj && typeof obj === "object"
        ? Object.entries(obj as Record<string, unknown>).map(([name, v]) => ({
            name,
            version: typeof v === "string" ? v : undefined,
          }))
        : [];
    return { deps: toDeps(pkg.dependencies), devDeps: toDeps(pkg.devDependencies) };
  } catch {
    return { deps: [], devDeps: [] };
  }
}

function parsePyproject(file: string): { deps: DepEntry[]; devDeps: DepEntry[] } {
  const src = fs.readFileSync(file, "utf-8");
  const deps: DepEntry[] = [];
  const devDeps: DepEntry[] = [];
  let target: "deps" | "dev" | null = null; // which list the current section feeds
  let inArray = false;

  const push = (item: DepEntry | null) => {
    if (!item || !item.name) return;
    (target === "dev" ? devDeps : deps).push(item);
  };

  for (const raw of src.split("\n")) {
    const line = raw.trim();
    const secMatch = /^\[([^\]]+)\]/.exec(line);
    if (secMatch) {
      inArray = false;
      const sec = secMatch[1].toLowerCase();
      if (sec === "project" || sec === "tool.poetry.dependencies") target = "deps";
      else if (
        sec.startsWith("project.optional-dependencies") ||
        sec === "dependency-groups" ||
        sec.startsWith("tool.poetry.group") ||
        sec === "tool.poetry.dev-dependencies"
      ) target = "dev";
      else target = null; // build-system, project.urls, project.scripts, tool.* — not deps
      continue;
    }
    if (!target) continue;
    if (inArray) {
      if (line.startsWith("]")) { inArray = false; continue; }
      push(cleanSpec(line.replace(/,$/, "").replace(/^"|"$/g, "")));
      continue;
    }
    if (/^dependencies\s*=\s*\[/.test(line)) {
      inArray = true;
      const rest = line.replace(/^dependencies\s*=\s*\[/, "").trim();
      if (rest && !rest.includes("]")) {
        push(cleanSpec(rest.replace(/[,"]+$/, "")));
        if (rest.includes("]")) inArray = false;
      } else if (rest === "]") {
        inArray = false;
      }
      continue;
    }
    // Poetry/PDM `name = "spec"` rows (already inside a deps section)
    const m = /^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"/.exec(line);
    if (m && !["name", "version", "requires-python", "description", "authors", "readme", "license"].includes(m[1])) {
      push(cleanSpec(m[1] + (m[2] ? `==${m[2]}` : "")));
    }
  }
  return { deps: dedupe(deps), devDeps: dedupe(devDeps) };
}

function parseRequirements(file: string): DepEntry[] {
  const src = fs.readFileSync(file, "utf-8");
  return src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("--"))
    .map((l) => cleanSpec(l))
    .filter((d) => d.name);
}

function parseGoMod(file: string): DepEntry[] {
  const src = fs.readFileSync(file, "utf-8");
  const out: DepEntry[] = [];
  let inBlock = false;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (/^require\s*\(/.test(line)) { inBlock = true; continue; }
    if (inBlock) {
      if (line === ")") { inBlock = false; continue; }
      const [name, version] = line.split(/\s+/);
      if (name && !name.startsWith("//") && name !== "module" && name !== "go") {
        out.push({ name, version });
      }
      continue;
    }
    const m = /^require\s+(\S+)(?:\s+(\S+))?/.exec(line);
    if (m) out.push({ name: m[1], version: m[2] });
  }
  // drop the module's own path (module line) + indirect markers
  return dedupe(out.filter((d) => d.name));
}

function parseCargo(file: string): { deps: DepEntry[]; devDeps: DepEntry[] } {
  const src = fs.readFileSync(file, "utf-8");
  const deps: DepEntry[] = [];
  const devDeps: DepEntry[] = [];
  let section = "";
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    const secMatch = /^\[([^\]]+)\]/.exec(line);
    if (secMatch) {
      section = secMatch[1].toLowerCase();
      continue;
    }
    const isDeps = section === "dependencies" || section.startsWith("dependencies.");
    const isDev = section.startsWith("dev-dependencies");
    if (!isDeps && !isDev) continue;
    const entry = parseTomlRow(line);
    if (entry) (isDev ? devDeps : deps).push(entry);
  }
  return { deps: dedupe(deps), devDeps: dedupe(devDeps) };
}

function parsePom(file: string): { deps: DepEntry[]; devDeps: DepEntry[] } {
  const src = fs.readFileSync(file, "utf-8");
  const deps: DepEntry[] = [];
  const devDeps: DepEntry[] = [];
  const depBlock = /<dependencies>([\s\S]*?)<\/dependencies>/.exec(src)?.[1] ?? "";
  const re = /<dependency>([\s\S]*?)<\/dependency>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(depBlock))) {
    const block = m[1];
    const gid = /<groupId>([^<]+)<\/groupId>/.exec(block)?.[1] ?? "";
    const aid = /<artifactId>([^<]+)<\/artifactId>/.exec(block)?.[1] ?? "";
    const version = /<version>([^<]+)<\/version>/.exec(block)?.[1];
    const scope = /<scope>([^<]+)<\/scope>/.exec(block)?.[1] ?? "compile";
    if (!gid && !aid) continue;
    const name = [gid, aid].filter(Boolean).join(":");
    const entry: DepEntry = { name, version: version && !version.includes("${") ? version : undefined };
    if (scope === "test") devDeps.push(entry);
    else deps.push(entry);
  }
  return { deps, devDeps };
}

function dedupe(list: DepEntry[]): DepEntry[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

// ── public entry ─────────────────────────────────────────────────────────────

export function scanManifest(repoPath: string): ManifestScan {
  const root = path.resolve(repoPath);
  const manifests: string[] = [];
  const hasConfig: Record<string, boolean> = {};
  for (const cand of MANIFEST_CANDIDATES) {
    if (fileExists(root, cand)) {
      manifests.push(cand);
      hasConfig[cand] = true;
    }
  }

  const language = detectLanguage(root);
  let manifest: string | null = null;
  let deps: DepEntry[] = [];
  let devDeps: DepEntry[] = [];

  // Parse the language's primary manifest first (also try extra requirement/dev files).
  switch (language) {
    case "javascript":
    case "typescript":
      if (hasConfig["package.json"]) {
        manifest = "package.json";
        ({ deps, devDeps } = parseJsonManifest(path.join(root, "package.json")));
      }
      break;
    case "python": {
      const py = path.join(root, "pyproject.toml");
      if (hasConfig["pyproject.toml"]) {
        manifest = "pyproject.toml";
        ({ deps, devDeps } = parsePyproject(py));
      } else if (hasConfig["requirements.txt"]) {
        manifest = "requirements.txt";
        deps = parseRequirements(path.join(root, "requirements.txt"));
      } else if (hasConfig["setup.py"]) {
        manifest = "setup.py"; // deps not statically parseable — best effort via name
      }
      // extra dev requirements
      for (const extra of ["requirements-dev.txt", "requirements-dev.in", "dev-requirements.txt"]) {
        if (fileExists(root, extra)) {
          devDeps.push(...parseRequirements(path.join(root, extra)));
        }
      }
      break;
    }
    case "go":
      if (fileExists(root, "go.mod")) {
        manifest = "go.mod";
        deps = parseGoMod(path.join(root, "go.mod"));
      }
      break;
    case "rust":
      if (fileExists(root, "Cargo.toml")) {
        manifest = "Cargo.toml";
        ({ deps, devDeps } = parseCargo(path.join(root, "Cargo.toml")));
      }
      break;
    case "java":
      if (fileExists(root, "pom.xml")) {
        manifest = "pom.xml";
        ({ deps, devDeps } = parsePom(path.join(root, "pom.xml")));
      } else if (fileExists(root, "build.gradle") || fileExists(root, "build.gradle.kts")) {
        const g = fileExists(root, "build.gradle") ? "build.gradle" : "build.gradle.kts";
        manifest = g;
        // Gradle deps aren't statically parsed here (Groovy/Kotlin DSL); names only
        deps = gradleDependencyNames(path.join(root, g));
      }
      break;
    default:
      break;
  }

  return {
    language,
    manifest,
    manifests,
    dependencies: dedupe(deps),
    devDependencies: dedupe(devDeps),
    hasConfig,
  };
}

// Helper declared after use (hoisted function declaration) — gradle best effort.
function gradleDependencyNames(file: string): DepEntry[] {
  const src = fs.readFileSync(file, "utf-8");
  const out: DepEntry[] = [];
  const re = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(?\s*["']([^:"']+):([^:"']+)(?::([^"']+))?["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({ name: `${m[1]}:${m[2]}`, version: m[3]?.replace(/["']$/, "") || undefined });
  }
  return out;
}