import { categorizeLibrary } from "devlensio";
import { scanManifest } from "../../core/manifest.js";

// GET /api/pre-scan?repoPath=...
// Fast — reads the repo's manifest(s) only, no AST parsing.
// Was package.json-only (JS/TS repos fine); now scans the manifest of ANY
// supported language so Python/Go/Rust/Java repos get their third-party layer.

export async function handlePreScan(req: Request): Promise<Response> {
  const url      = new URL(req.url);
  const repoPath = url.searchParams.get("repoPath");

  if (!repoPath) {
    return Response.json(
      { success: false, error: "repoPath query param is required" },
      { status: 400 }
    );
  }

  const { language, manifest, dependencies, devDependencies } = scanManifest(repoPath);

  const included: { name: string; version?: string; category: string }[] = [];
  const excluded: { name: string; version?: string; category: string }[] = [];

  // JS/TS: the engine's category heuristics decide what's runtime vs devtool.
  // Other languages: every manifest dependency is a candidate third-party lib —
  // the extractors' own import resolution decides what actually shows up as a
  // THIRD_PARTY node, so erring toward "included" is correct for the gate.
  for (const d of dependencies) {
    const cat = language === "javascript" || language === "typescript"
      ? categorizeLibrary(d.name, false)
      : "runtime";
    const entry = { name: d.name, version: d.version, category: cat };
    if (cat === "runtime") included.push(entry);
    else excluded.push(entry);
  }

  for (const d of devDependencies) {
    excluded.push({ name: d.name, version: d.version, category: "devtool" });
  }

  return Response.json({
    success: true,
    data: {
      language,
      manifest,
      included,
      excluded,
    },
  });
}