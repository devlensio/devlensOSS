import type { CodeNode } from "../../types";

// Picks the node whose filePath shares the most leading path segments
// with the reference path. When multiple nodes have the same name (e.g.
// two files both export a function called "handleSubmit"), this heuristic
// selects the one physically closest to the caller in the directory tree.
export function closestByPath(candidates: CodeNode[], referencePath: string): CodeNode {
  const refParts = referencePath.split("/");

  let best      = candidates[0];
  let bestScore = 0;

  for (const candidate of candidates) {
    const parts = candidate.filePath.split("/");
    let score   = 0;
    const len   = Math.min(refParts.length, parts.length);
    for (let i = 0; i < len; i++) {
      if (refParts[i] === parts[i]) score++;
      else break;
    }
    if (score > bestScore) {
      bestScore = score;
      best      = candidate;
    }
  }

  return best;
}
