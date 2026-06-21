import path from "node:path";
import { storage } from "devlensio";
import { die } from "./output.js";

// Resolve a graphId from --graph, or fall back to the graph whose repoPath
// matches the current working directory.
export function resolveGraphId(graphOpt?: string): string {
  if (graphOpt) return graphOpt;

  const cwd = path.resolve(process.cwd()).toLowerCase();
  const match = storage.listGraphs().find((g) => path.resolve(g.repoPath).toLowerCase() === cwd);
  if (match) return match.graphId;

  return die(
    "No --graph given and no analyzed graph matches the current directory. " +
      "Run `devlens analyze` here first, or pass --graph <id>."
  );
}