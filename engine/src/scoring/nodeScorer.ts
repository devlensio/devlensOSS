import type { CodeNode } from "../types";
import type { ConnectionProfile, ConnectionMaxima } from "./connectionCounter";

// Utility name patterns — low-value nodes
const UTILITY_PATTERN = /^(format|get|set|is|has|cn|clsx|classNames|util|helper|parse|convert|transform|sanitize|normalize|encode|decode|map|filter|reduce|sort|group|chunk|flatten|merge|pick|omit|debounce|throttle|memoize|curry|compose|pipe)/i;

// Logarithmic normalization using 75th percentile (top 25% ~1.0)
function logNorm(count: number, p75: number): number {
  if (p75 <= 0 || count <= 0) return 0;
  return Math.min(1.0, Math.log10(count + 1) / Math.log10(p75 + 1));
}

// Complexity bucket (0-4): lines + API calls + error handling + outgoing calls
function calcComplexity(
  node: CodeNode,
  profile: ConnectionProfile
): number {
  const lines = node.endLine - node.startLine;

  let lineSignal: number;
  if      (lines < 5)   lineSignal = 0.1;
  else if (lines < 15)  lineSignal = 0.3;
  else if (lines < 30)  lineSignal = 0.5;
  else if (lines < 60)  lineSignal = 0.7;
  else if (lines < 100) lineSignal = 0.9;
  else                  lineSignal = 1.0;

  const apiCalls  = node.metadata.apiCalls as string[] | undefined;
  const apiSignal = apiCalls && apiCalls.length > 0 ? 1.0 : 0.0;

  const errorSignal = node.metadata.hasErrorHandling === true ? 1.0 : 0.0;

  let callDepthSignal: number;
  const outgoing = profile.outgoingCalls;
  if      (outgoing === 0)  callDepthSignal = 0.0;
  else if (outgoing <= 2)   callDepthSignal = 0.3;
  else if (outgoing <= 4)   callDepthSignal = 0.6;
  else if (outgoing <= 6)   callDepthSignal = 0.8;
  else                      callDepthSignal = 1.0;

  return (lineSignal + apiSignal + errorSignal + callDepthSignal);
}

// Connections bucket (0-3): log-norm signals w/ dominant amplification + isolation penalty
function calcConnections(
  node: CodeNode,
  profile: ConnectionProfile,
  maxima: ConnectionMaxima
): number {

  const incomingCallsSignal = logNorm(
    profile.incomingCalls,
    maxima.p75IncomingCalls
  );

  const outgoingCallsSignal = logNorm(
    profile.outgoingCalls,
    maxima.p75OutgoingCalls
  );

  const stateDependency = profile.incomingReads + profile.incomingWrites;
  const stateSignal     = logNorm(
    stateDependency,
    maxima.p75IncomingReads
  );

  const propSignal = logNorm(
    profile.incomingProps,
    maxima.p75IncomingProps
  );

  const totalConnectivity =
    profile.incomingCalls  +
    profile.outgoingCalls  +
    profile.incomingReads  +
    profile.incomingWrites +
    profile.incomingProps;

  const isolationPenalty = totalConnectivity === 0 ? -1.0 : 0.0;

  const primarySignal =
    Math.max(incomingCallsSignal, outgoingCallsSignal, stateSignal, propSignal);
  const secondarySum =
    incomingCallsSignal + outgoingCallsSignal + stateSignal + propSignal
    - primarySignal;

  const raw = primarySignal * 2.5 + Math.min(0.5, secondarySum) + isolationPenalty;

  return Math.min(3.0, Math.max(0, raw));
}

// Type bonus (0-2)
function calcTypeBonus(node: CodeNode): number {
  switch (node.type) {
    case "STATE_STORE": return 2.0;
    case "COMPONENT":   return 0.75;
    case "HOOK":        return 0.75;
    case "FUNCTION":    return 0.5;
    case "ROUTE": return 2;
    case "TEST":        return 0.3;   //  low bonus because test files are secondary, do not play role in the logical part
    case "STORY":       return 0.3;
    default:            return 0.0;
  }
}

// Noise penalty (0 to -2): utility names + tiny isolated functions
function calcNoisePenalty(
  node: CodeNode,
  profile: ConnectionProfile
): number {
  let penalty = 0.0;

  if (UTILITY_PATTERN.test(node.name)) {
    penalty -= 1.0;
  }

  const lines = node.endLine - node.startLine;
  const totalIncoming =
    profile.incomingCalls  +
    profile.incomingReads  +
    profile.incomingWrites +
    profile.incomingProps;

  if (lines < 5 && totalIncoming === 0) {
    penalty -= 1.0;
  }

  return penalty;
}

// Main scorer: base(1) + complexity(4) + connections(3) + type(2) + noise(-2) → 0-10
export function scoreNode(
  node: CodeNode,
  profile: ConnectionProfile,
  maxima: ConnectionMaxima
): number {

  if (node.type === "GHOST") return 5.0;
  if (node.type === "FILE") return 0;

  const base        = 1.0;
  const complexity  = calcComplexity(node, profile);
  const connections = calcConnections(node, profile, maxima);
  const typeBonus   = calcTypeBonus(node);
  const noise       = calcNoisePenalty(node, profile);

  const raw = base + complexity + connections + typeBonus + noise;

  return Math.min(10, Math.max(0, raw));
}
