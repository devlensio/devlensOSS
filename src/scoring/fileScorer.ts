import { CodeNode } from "../types";

// ─── Internal Gravity (G_int) ──────────────────────────────────────────────
// Formula: Σ(S²) / ΣS
// Favors one high scorer over many averages
function calcInternalGravity(childScores: number[]): number {
  if (childScores.length === 0) return 0;

  const sumOfSquares = childScores.reduce((acc, s) => acc + s * s, 0);
  const sumOfScores  = childScores.reduce((acc, s) => acc + s,     0);

  if (sumOfScores === 0) return 0;

  return sumOfSquares / sumOfScores;
}

// ─── Reputation Boost (R_ext) ─────────────────────────────────────────────
// Formula: (10 - G_int) × (1 - 1/log10(importedBy + 10))
// Log-scaled import popularity
function calcReputationBoost(gInt: number, importedBy: number): number {
  const gap        = 10 - gInt;
  const multiplier = 1 - (1 / Math.log10(importedBy + 10));
  return gap * multiplier;
}

// ─── Best Child Floor ──────────────────────────────────────────────────────
// fileScore >= bestChild × 0.90 (dilution protection)
const BEST_CHILD_FLOOR_RATIO = 0.90;

// ─── File Score: gravity + floor + reputation ───────────────────────────────
export function scoreFile(
  fileNode: CodeNode,
  children: CodeNode[],
  nodeScores: Map<string, number>,
  importedBy: number
): number {

  if (fileNode.type !== "FILE") return 0;

// Empty files (types/barrels): reputation only
  if (children.length === 0) {
    const gInt = 0;
    const rExt = calcReputationBoost(gInt, importedBy);
    return Math.min(10, Math.max(0, rExt));
  }

  const childScores = children.map((n) => nodeScores.get(n.id) ?? 0);

// 1. Internal gravity
  const gInt = calcInternalGravity(childScores);

// 2. Apply best-child floor
  const maxChildScore = Math.max(...childScores);
  const floor         = maxChildScore * BEST_CHILD_FLOOR_RATIO;
  const adjustedGInt  = Math.max(gInt, floor);

// 3. Reputation boost
  const rExt = calcReputationBoost(adjustedGInt, importedBy);

  return Math.min(10, Math.max(0, adjustedGInt + rExt));
}