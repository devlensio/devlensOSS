import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { Command } from "commander";
import { withGlobalFlags } from "../options.js";
import { emit, info } from "../output.js";
import { scanManifest, LANGUAGE_LABEL, type Language } from "../../core/manifest.js";

// `devlens detect [path]` — quick language/framework/manifest/deps report.
// Cheap (no AST parsing, no graph build). Built for AI agents that need to
// decide HOW to analyze a repo before running `devlens analyze`.

const SOURCE_EXT: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".cjs", ".mjs"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  python: [".py"],
  go: [".go"],
  rust: [".rs"],
  java: [".java"],
};

function countSourceFiles(root: string, exts: string[]): number {
  let count = 0;
  const walk = (dir: string) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "target" || e.name === "dist" || e.name === "build" || e.name === ".venv" || e.name === "vendor") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (exts.some((x) => e.name.endsWith(x))) count++;
    }
  };
  walk(root);
  return count;
}

function gitHead(root: string): { commit: string | null; branch: string | null; dirty: boolean } {
  try {
    const commit = execSync(`git -C ${JSON.stringify(root)} rev-parse HEAD`, { encoding: "utf-8", timeout: 3000 }).trim();
    const branch = execSync(`git -C ${JSON.stringify(root)} branch --show-current`, { encoding: "utf-8", timeout: 3000 }).trim() || null;
    const status = execSync(`git -C ${JSON.stringify(root)} status --porcelain`, { encoding: "utf-8", timeout: 3000 }).trim();
    return { commit, branch, dirty: status.length > 0 };
  } catch {
    return { commit: null, branch: null, dirty: false };
  }
}

export function registerDetectCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("detect")
      .description("Detect the language, manifest, and dependencies of a repo (fast, no analysis)")
      .argument("[path]", "repository path", ".")
      .option("--deps", "include the full dependency list in the output", false)
      .action((repoArg, opts) => {
        const root = path.resolve(process.cwd(), repoArg ?? ".");
        if (!fs.existsSync(root)) {
          emit({ path: root, error: "path does not exist" });
          return;
        }

        const scan = scanManifest(root);
        const ext = SOURCE_EXT[scan.language as Language] ?? [];
        const sourceFiles = scan.language !== "unknown" ? countSourceFiles(root, ext) : 0;
        const git = gitHead(root);

        info(`Detected ${LANGUAGE_LABEL[scan.language]} repository`);
        emit({
          path: root,
          language: scan.language,
          languageLabel: LANGUAGE_LABEL[scan.language],
          manifest: scan.manifest,
          manifests: scan.manifests,
          sourceFiles,
          dependencyCount: scan.dependencies.length,
          devDependencyCount: scan.devDependencies.length,
          ...(opts.deps ? { dependencies: scan.dependencies, devDependencies: scan.devDependencies } : {}),
          git,
        });
      })
  );
}