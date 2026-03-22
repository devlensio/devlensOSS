import { CodeNode, CodeEdge } from "../types";

export interface ConnectionProfile {
  incomingCalls: number;
  outgoingCalls: number;
  incomingReads: number;
  incomingWrites: number;
  incomingProps: number;
  outgoingProps: number;
  importedBy: number;
}

export interface ConnectionMaxima {
  maxIncomingCalls: number;
  maxOutgoingCalls: number;
  maxIncomingReads: number;
  maxIncomingWrites: number;
  maxIncomingProps: number;
  maxOutgoingProps: number;
  maxImportedBy: number;
  // 75th percentile values — used for normalization
  // prevents outliers from compressing all other scores
  p75IncomingCalls: number;
  p75OutgoingCalls: number;
  p75IncomingReads: number;
  p75IncomingProps: number;
}

export interface ConnectionCountResult {
  profiles: Map<string, ConnectionProfile>;
  maxima: ConnectionMaxima;
}

function emptyProfile(): ConnectionProfile {
  return {
    incomingCalls:  0,
    outgoingCalls:  0,
    incomingReads:  0,
    incomingWrites: 0,
    incomingProps:  0,
    outgoingProps:  0,
    importedBy:     0,
  };
}

// Computes the 75th percentile of a number array
function percentile75(values: number[]): number {
  if (values.length === 0) return 1;

  // Build frequency map — O(n)
  // key: connection count value, value: how many nodes have that count
  const freq = new Map<number, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }

  // Sort only the UNIQUE keys — O(k log k) where k << n
  // In practice k is tiny — most codebases have counts 1-20
  // even if they have 500+ nodes
  const uniqueKeys = Array.from(freq.keys()).sort((a, b) => a - b);

  // Walk cumulative count until we reach the 75th percentile position
  const target = Math.floor(values.length * 0.75);
  let cumulative = 0;

  for (const key of uniqueKeys) {
    cumulative += freq.get(key)!;
    if (cumulative >= target) {
      return Math.max(1, key);
    }
  }

  // Fallback — return the largest value
  return Math.max(1, uniqueKeys[uniqueKeys.length - 1]);
}

export function countConnections(
  nodes: CodeNode[],
  edges: CodeEdge[]
): ConnectionCountResult {

  const profiles = new Map<string, ConnectionProfile>();

  // Initialize a profile for every node
  for (const node of nodes) {
    profiles.set(node.id, emptyProfile());
  }

  // ─── Pass 1 — Count edges ──────────────────────────────────────
  for (const edge of edges) {
    const fromProfile = profiles.get(edge.from);
    const toProfile   = profiles.get(edge.to);

    switch (edge.type) {
      case "CALLS":
        if (fromProfile) fromProfile.outgoingCalls += 1;
        if (toProfile)   toProfile.incomingCalls   += 1;
        break;

      case "READS_FROM":
        if (toProfile) toProfile.incomingReads += 1;
        break;

      case "WRITES_TO":
        if (toProfile) toProfile.incomingWrites += 1;
        break;

      case "PROP_PASS":
        if (fromProfile) fromProfile.outgoingProps += 1;
        if (toProfile)   toProfile.incomingProps   += 1;
        break;

      case "IMPORTS":
        if (toProfile) toProfile.importedBy += 1;
        break;
    }
  }

  // ─── Pass 2 — Find true maxima ────────────────────────────────
  let maxIncomingCalls  = 1;
  let maxOutgoingCalls  = 1;
  let maxIncomingReads  = 1;
  let maxIncomingWrites = 1;
  let maxIncomingProps  = 1;
  let maxOutgoingProps  = 1;
  let maxImportedBy     = 1;

  for (const profile of profiles.values()) {
    if (profile.incomingCalls  > maxIncomingCalls)  maxIncomingCalls  = profile.incomingCalls;
    if (profile.outgoingCalls  > maxOutgoingCalls)  maxOutgoingCalls  = profile.outgoingCalls;
    if (profile.incomingReads  > maxIncomingReads)  maxIncomingReads  = profile.incomingReads;
    if (profile.incomingWrites > maxIncomingWrites) maxIncomingWrites = profile.incomingWrites;
    if (profile.incomingProps  > maxIncomingProps)  maxIncomingProps  = profile.incomingProps;
    if (profile.outgoingProps  > maxOutgoingProps)  maxOutgoingProps  = profile.outgoingProps;
    if (profile.importedBy     > maxImportedBy)     maxImportedBy     = profile.importedBy;
  }

  // ─── Pass 3 — Compute 75th percentiles ────────────────────────
  // Collect all non-zero values per signal type
  // We only include non-zero values so nodes with no connections
  // don't drag the percentile down to zero
  const allIncomingCalls: number[] = [];
  const allOutgoingCalls: number[] = [];
  const allIncomingReads: number[] = [];
  const allIncomingProps: number[] = [];

  for (const profile of profiles.values()) {
    if (profile.incomingCalls > 0) allIncomingCalls.push(profile.incomingCalls);
    if (profile.outgoingCalls > 0) allOutgoingCalls.push(profile.outgoingCalls);
    if (profile.incomingReads > 0) allIncomingReads.push(profile.incomingReads);
    if (profile.incomingProps > 0) allIncomingProps.push(profile.incomingProps);
  }

  return {
    profiles,
    maxima: {
      maxIncomingCalls,
      maxOutgoingCalls,
      maxIncomingReads,
      maxIncomingWrites,
      maxIncomingProps,
      maxOutgoingProps,
      maxImportedBy,
      // 75th percentile — used for normalization in nodeScorer
      p75IncomingCalls: percentile75(allIncomingCalls),
      p75OutgoingCalls: percentile75(allOutgoingCalls),
      p75IncomingReads: percentile75(allIncomingReads),
      p75IncomingProps: percentile75(allIncomingProps),
    },
  };
}