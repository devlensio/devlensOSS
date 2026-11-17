import type { CallDefer, CallScope, CallSite, CodeNode, ResolvedCall } from "./types";

// callOrder/v1 display helpers. Every field is optional: a graph analysed by an
// engine older than callOrder/v1 has no ordering data and must render exactly as
// it does today, so "unknown" is always a first-class result here.

export interface CallMarkers {
  awaited: boolean;
  defer: CallDefer | null;
  deferDetail: string | null;
  conc: boolean;
  repeat: boolean;
  maybe: boolean;
  handler: boolean;
}

export interface CalleeOrder {
  // 1-based source position of the first call site that resolves to the callee.
  // Lexical only: it is never a runtime ordering guarantee.
  order: number;
  markers: CallMarkers;
}

export interface OrderedCallee {
  node: CodeNode;
  order: number | null;
  markers: CallMarkers | null;
}

export type CalleeOrderIndex = Map<string, Map<string, CalleeOrder>>;

const siteScope = (site: CallSite | undefined): CallScope | undefined => site?.scope;

function emptyMarkers(): CallMarkers {
  return {
    awaited: false,
    defer: null,
    deferDetail: null,
    conc: false,
    repeat: false,
    maybe: false,
    handler: false,
  };
}

// resolvedCalls carries the markers of the first occurrence; the matching
// CallSite adds `scope` (handled as `handler`) and any detail the projection
// dropped. Both sources are optional, so each flag is a claim only when set.
function mergeMarkers(markers: CallMarkers, call: ResolvedCall, site: CallSite | undefined) {
  if (call.awaited || site?.awaited) markers.awaited = true;
  if (call.conc || site?.conc) markers.conc = true;
  if (call.repeat || site?.repeat) markers.repeat = true;
  if (call.maybe || site?.maybe) markers.maybe = true;
  if (markers.defer === null) {
    markers.defer = call.defer ?? site?.defer ?? null;
    markers.deferDetail = call.deferDetail ?? site?.deferDetail ?? null;
  }
  if (siteScope(site) === "handler") markers.handler = true;
}

function callSitesOf(node: CodeNode): CallSite[] {
  const sites = node.metadata?.callSites;
  if (!Array.isArray(sites)) return [];
  return sites.filter((s): s is CallSite => typeof s === "object" && s !== null);
}

// Rust graphs emit node ids instead of records (CALL_ORDER.md §9); those carry
// no position and are skipped rather than guessed at.
function resolvedCallsOf(node: CodeNode): ResolvedCall[] {
  const calls = node.metadata?.resolvedCalls;
  if (!Array.isArray(calls)) return [];
  return calls.filter((c): c is ResolvedCall => typeof c === "object" && c !== null);
}

function firstOrdersByName(sites: CallSite[]): Map<string, number> {
  const byName = new Map<string, number>();
  for (const site of sites) {
    if (typeof site.order !== "number") continue;
    const seen = byName.get(site.name);
    if (seen === undefined || site.order < seen) byName.set(site.name, site.order);
  }
  return byName;
}

function sitesByOrder(sites: CallSite[]): Map<number, CallSite> {
  const byOrder = new Map<number, CallSite>();
  for (const site of sites) {
    if (typeof site.order !== "number") continue;
    if (!byOrder.has(site.order)) byOrder.set(site.order, site);
  }
  return byOrder;
}

function calleeOrderIndexFor(node: CodeNode): Map<string, CalleeOrder> {
  const calls = resolvedCallsOf(node);
  const callees = new Map<string, CalleeOrder>();
  if (calls.length === 0) return callees;

  const sites = callSitesOf(node);
  const byOrder = sitesByOrder(sites);
  const byName = firstOrdersByName(sites);

  for (const call of calls) {
    if (!call.nodeId) continue;
    const order =
      typeof call.firstOrder === "number" ? call.firstOrder : byName.get(call.name);
    if (typeof order !== "number") continue;

    const site = byOrder.get(order);
    const existing = callees.get(call.nodeId);
    if (existing === undefined) {
      const markers = emptyMarkers();
      mergeMarkers(markers, call, site);
      callees.set(call.nodeId, { order, markers });
      continue;
    }
    mergeMarkers(existing.markers, call, site);
    if (order < existing.order) existing.order = order;
  }

  return callees;
}

// Per caller: callee node id -> first source order and its markers.
export function buildCalleeOrder(nodesById: Record<string, CodeNode>): CalleeOrderIndex {
  const index: CalleeOrderIndex = new Map();
  for (const node of Object.values(nodesById)) {
    const callees = calleeOrderIndexFor(node);
    if (callees.size > 0) index.set(node.id, callees);
  }
  return index;
}

// Callees in declared call order. Callees without ordering data keep the order
// the engine gave them and carry no markers.
export function orderCallees(node: CodeNode, calleeNodes: CodeNode[]): OrderedCallee[] {
  const callees = calleeOrderIndexFor(node);
  return calleeNodes
    .map((callee) => {
      const hit = callees.get(callee.id);
      return {
        node: callee,
        order: hit?.order ?? null,
        markers: hit?.markers ?? null,
      };
    })
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY));
}
