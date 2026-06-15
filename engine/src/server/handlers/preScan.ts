import { readPackageDependencies, categorizeLibrary } from "../../graph/thirdPartyLibs";

// GET /api/pre-scan?repoPath=...
// Fast — reads package.json only, no AST parsing.
export async function handlePreScan(req: Request): Promise<Response> {
  const url      = new URL(req.url);
  const repoPath = url.searchParams.get("repoPath");

  if (!repoPath) {
    return Response.json(
      { success: false, error: "repoPath query param is required" },
      { status: 400 }
    );
  }

  const { dependencies, devDependencies } = readPackageDependencies(repoPath);

  const included: { name: string; version: string; category: string }[] = [];
  const excluded: { name: string; version: string; category: string }[] = [];

  for (const [name, version] of Object.entries(dependencies)) {
    const cat = categorizeLibrary(name, false);
    const entry = { name, version, category: cat };
    if (cat === "runtime") {
      included.push(entry);
    } else {
      excluded.push(entry);
    }
  }

  for (const [name, version] of Object.entries(devDependencies)) {
    // devDeps are always excluded (devtool category)
    excluded.push({ name, version, category: "devtool" });
  }

  return Response.json({
    success: true,
    data: { included, excluded },
  });
}
