import path from "node:path";
import { storage } from "devlensio";
import { die } from "./output.js";

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Resolve a graphId from --graph, or fall back to the graph whose repoPath
// matches the current working directory. If cwd is inside an analyzed repo
// (e.g. you cd'd into a subfolder), the nearest ancestor repo is used — this
// makes `devlens query` work from anywhere inside a repo, which agents rely on.
export function resolveGraphId(graphOpt?: string): string {
  if (graphOpt) return graphOpt;

  const cwd = path.resolve(process.cwd());
  const graphs = storage.listGraphs()
    .map((g) => ({ ...g, repoAbs: path.resolve(g.repoPath) }))
    .filter((g) => isWithin(cwd, g.repoAbs))
    .sort((a, b) => b.repoAbs.length - a.repoAbs.length); // nearest ancestor first

  if (graphs.length > 0) return graphs[0].graphId;

  return die(
    "No --graph given and no analyzed graph matches (or contains) the current directory. " +
      "Run `devlens analyze` here first, or pass --graph <id>."
  );
}