

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";


// ── Query Keys ───────────────────────────────────────────────────────────────
// Centralized so cache invalidation is consistent everywhere

export const keys = {
  graphs:     ()                              => ["graphs"]                          as const,
  graph:      (graphId: string, hash?: string) => ["graph", graphId, hash]           as const,
  clusters:   (graphId: string, hash?: string) => ["clusters", graphId, hash]        as const,
  graphMeta:  (graphId: string)               => ["graphMeta", graphId]              as const,
  jobs:       ()                              => ["jobs"]                            as const,
  job:        (jobId: string)                 => ["job", jobId]                      as const,
  config:     ()                              => ["config"]                          as const,
  nodeCode:   (graphId: string, hash: string, nodeId: string) => ["nodeCode", graphId, hash, nodeId] as const,
  diff: (graphId: string, from: string, to: string) => ["diff", graphId, from, to] as const,
};

//Graph Hooks

export function useGraphList() {
  return useQuery({
    queryKey: keys.graphs(),
    queryFn:  () => api.listGraphs(),
  });
}

export function useGraph(graphId: string, commitHash?: string) {
  return useQuery({
    queryKey: keys.graph(graphId, commitHash),
    queryFn:  () => api.getGraph(graphId, commitHash),
    enabled:  !!graphId,
    staleTime: Infinity,  // graph data never goes stale
  });
}

export function useGraphMeta(graphId: string) {
  return useQuery({
    queryKey: keys.graphMeta(graphId),
    queryFn:  () => api.getGraphMeta(graphId),
    enabled:  !!graphId,
  });
}

export function useClusters(graphId: string, commitHash?: string) {
  return useQuery({
    queryKey: keys.clusters(graphId, commitHash),
    queryFn:  () => api.getClusters(graphId, commitHash),
    enabled:  !!graphId,
    staleTime: Infinity,
  });
}

export function useNodeCode(graphId: string, commitHash: string, nodeId: string | null) {
  return useQuery({
    queryKey: keys.nodeCode(graphId, commitHash, nodeId ?? ""),
    queryFn:  () => api.getNodeCode(graphId, commitHash, nodeId!),
    enabled:  !!nodeId,  // only fetch when a node is selected
    staleTime: Infinity,
  });
}

// ── Job hooks ────────────────────────────────────────────────────────────────

export function useJobList() {
  return useQuery({
    queryKey: keys.jobs(),
    queryFn:  () => api.listJobs(),
    refetchInterval: 3000,  // poll every 3s — jobs change frequently
  });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: keys.job(jobId),
    queryFn:  () => api.getJob(jobId),
    enabled:  !!jobId,
    refetchInterval: 2000,
  });
}

// ── Config hooks ─────────────────────────────────────────────────────────────

export function useConfig() {
  return useQuery({
    queryKey: keys.config(),
    queryFn:  () => api.getConfig(),
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

export function useAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.analyze,
    onSuccess: () => {
      // Invalidate graphs list so new graph appears
      queryClient.invalidateQueries({ queryKey: keys.graphs() });
      queryClient.invalidateQueries({ queryKey: keys.jobs() });
    },
  });
}

export function usePauseJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.pauseJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
    },
  });
}

export function useResumeJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.resumeJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.cancelJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
    },
  });
}

export function useDeleteGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (graphId: string) => api.deleteGraph(graphId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.graphs() });
    },
  });
}

export function usePatchConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.patchConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.config() });
    },
  });
}

export function useCommitDiff(graphId: string, fromHash: string, toHash: string) {
  return useQuery({
    queryKey: keys.diff(graphId, fromHash, toHash),
    queryFn:  () => api.getDiff(graphId, fromHash, toHash),
    enabled:  !!fromHash && !!toHash && fromHash !== toHash,
    staleTime: Infinity,  // diff between two fixed commits never changes
  });
}