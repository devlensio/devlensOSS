import type {
  GraphResponse,
  GraphListItem,
  ClusterResult,
  CodeNode,
  GraphMeta,
  Job,
  JobSummary,
  DevLensConfig,
  NodeDiff,
} from "./types";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:3000";

//  Base helpers ─
//
// All helpers extract the error message from the response body before throwing.
// Backend always returns { success: false, error: "..." } on failure —
// we surface that message directly so the user sees something actionable.

async function get<T>(url: string): Promise<T> {
  const res  = await fetch(`${ENGINE_URL}${url}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json.data;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${url}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json.data;
}

async function patch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${url}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json.data;
}

async function del<T>(url: string): Promise<T> {
  const res  = await fetch(`${ENGINE_URL}${url}`, { method: "DELETE" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json.data;
}

//  API ─

export const api = {

  health: () =>
    get<{ status: string }>("/api/health"),

  //  Config 
  getConfig: () =>
    get<DevLensConfig>("/api/config"),

  patchConfig: (config: Partial<DevLensConfig>) =>
    patch<DevLensConfig>("/api/config", config),

  //  Graphs 
  listGraphs: () =>
    get<GraphListItem[]>("/api/graphs"),

  getGraph: (graphId: string, commitHash?: string) =>
    get<GraphResponse>(commitHash
      ? `/api/graph/${graphId}/${commitHash}`
      : `/api/graph/${graphId}`),

  getGraphMeta: (graphId: string) =>
    get<GraphMeta>(`/api/graph/${graphId}/commits`),

  deleteGraph: (graphId: string) =>
    del<null>(`/api/graph/${graphId}`),

  deleteCommit: (graphId: string, commitHash: string) =>
    del<null>(`/api/graph/${graphId}/commit/${commitHash}`),

  getDiff: (graphId: string, fromHash: string, toHash: string) =>
    get<NodeDiff>(`/api/graph/${graphId}/diff?from=${fromHash}&to=${toHash}`),

  getClusters: (graphId: string, commitHash?: string) =>
    get<ClusterResult>(commitHash
      ? `/api/graph/${graphId}/${commitHash}/clusters`
      : `/api/graph/${graphId}/clusters`),

  getNodeCode: (graphId: string, commitHash: string, nodeId: string) =>
    post<CodeNode>(`/api/graph/${graphId}/${commitHash}/node`, { nodeId }),

  //  Jobs 
  analyze: (body: {
    repoPath:           string;
    skipSummarization?: boolean;
    forceSummarize?:    boolean;
  }) => post<Job>("/api/analyze", body),

  listJobs: () =>
    get<JobSummary[]>("/api/jobs"),

  getJob: (jobId: string) =>
    get<Job>(`/api/job/${jobId}`),

  pauseJob:  (jobId: string) => post<null>(`/api/job/${jobId}/pause`),
  resumeJob: (jobId: string) => post<null>(`/api/job/${jobId}/resume`),
  cancelJob: (jobId: string) => post<null>(`/api/job/${jobId}/cancel`),

  summarize: (graphId: string, commitHash: string) =>
    post<null>(`/api/graph/${graphId}/${commitHash}/summarize`),

  // SSE — not a fetch, returns EventSource
  streamJob: (jobId: string): EventSource =>
    new EventSource(`${ENGINE_URL}/api/job/${jobId}/stream`),
};