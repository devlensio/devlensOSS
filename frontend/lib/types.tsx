// Mirrors engine types — keep in sync with src/types.ts

export type NodeType =
  | "COMPONENT"
  | "HOOK"
  | "FUNCTION"
  | "STATE_STORE"
  | "UTILITY"
  | "FILE"
  | "GHOST"
  | "ROUTE"
  | "TEST"
  | "STORY";

export type EdgeType =
  | "CALLS"
  | "IMPORTS"
  | "READS_FROM"
  | "WRITES_TO"
  | "PROP_PASS"
  | "EMITS"
  | "LISTENS"
  | "WRAPPED_BY"
  | "GUARDS"
  | "HANDLES"
  | "TESTS"
  | "USES";

  export type RouteNodeType =
  | "PAGE"
  | "LAYOUT"
  | "API_ROUTE"
  | "LOADING"
  | "ERROR"
  | "MIDDLEWARE"
  | "NOT_FOUND";

  export type BackendFramework = "express" | "fastify" | "koa";

  export interface RouteNode {
  type: RouteNodeType;
  nodeId?:string;
  urlPath: string;
  filePath: string;
  isDynamic: boolean;
  isCatchAll: boolean;
  isGroupRoute: boolean;
  layoutPath?: string;
  params?: string[];
  httpMethods?: string[];
}

export interface BackendRouteNode {
  type: "BACKEND_ROUTE";
  nodeId?:string;
  urlPath: string;
  filePath: string;
  httpMethod: string;
  handlerName?: string;
  framework: BackendFramework;
  isDynamic: boolean;
  params?: string[];
}



export interface CodeNode {
  id:               string;
  name:             string;
  type:             NodeType;
  filePath:         string;
  startLine:        number;
  endLine:          number;
  rawCode?:         string;
  codeHash?:        string;
  technicalSummary?: string;
  businessSummary?:  string;
  security?: {
    severity: "none" | "low" | "medium" | "high";
    summary:  string;
  };
  summaryModel?:    string;
  summarizedAt?:    string;
  parentFile?:      string;
  score?:           number;
  metadata:         Record<string, unknown>;
}

export interface CodeEdge {
  from:      string;
  to:        string;
  type:      EdgeType;
  metadata?: Record<string, unknown>;
}

export interface GraphResponse {
  graphId:     string;
  repoPath:    string;
  analyzedAt:  string;
  fingerprint: Record<string, unknown>;
  routes:      any[];
  nodes:       CodeNode[];
  edges:       CodeEdge[];
  nodesById:   Record<string, CodeNode>;
  nodeScores:  Record<string, number>;
  gitInfo:     {
    commitHash: string;
    branch:     string;
    message:    string;
    hasGit:     boolean;
  };
}

export interface GraphListItem {
  graphId:          string;
  repoPath:         string;
  framework:        string;
  language:         string;
  latestCommit:     string;
  latestAnalyzedAt: string;
  commitCount:      number;
}

export interface ClusterNode {
  nodeId: string;
  rank:   number;
}

export interface ClusterFile {
  filePath: string;
  nodeIds:  ClusterNode[];
}

export interface Cluster {
  id:        string;
  label:     string;
  files:     ClusterFile[];
  nodeCount: number;
  topNodes:  string[];
}

export interface InterClusterEdge {
  from:   string;
  to:     string;
  weight: number;
}

export interface ClusterResult {
  clusters:          Cluster[];
  interClusterEdges: InterClusterEdge[];
  clusterMembership: Record<string, string>;
}

// ── Job types ────────────────────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type JobPhase = "analysis" | "summarization";

export type AnalysisStep =
  | "fingerprint"
  | "filesystem"
  | "parse"
  | "edges"
  | "scoring";

export type ProgressEvent =
  | { event: "queued";                  jobId: string; position: number }
  | { event: "analysis_started";        jobId: string }
  | { event: "analysis_progress";       jobId: string; step: AnalysisStep }
  | { event: "analysis_complete";       jobId: string; graphId: string; nodeCount: number; edgeCount: number }
  | { event: "summarization_started";   jobId: string; totalNodes: number }
  | { event: "summarization_progress";  jobId: string; completed: number; total: number; nodeName: string }
  | { event: "summarization_complete";  jobId: string }
  | { event: "paused";                  jobId: string; completedNodes: number; totalNodes: number }
  | { event: "resumed";                 jobId: string; completedNodes: number; totalNodes: number }
  | { event: "cancelled";               jobId: string; cleanedUp: boolean }
  | { event: "completed";               jobId: string; graphId: string }
  | { event: "failed";                  jobId: string; error: string };

export interface Job {
  jobId:                   string;
  status:                  JobStatus;
  phase:                   JobPhase | null;
  repoPath:                string;
  isGithubRepo:            boolean;
  graphId?:                string;
  skipSummarization?:      boolean;
  forceSummarize?:         boolean;
  summarizationTotal?:     number;
  summarizationCompleted?: number;
  createdAt:               string;
  startedAt?:              string;
  pausedAt?:               string;
  cancelledAt?:            string;
  completedAt?:            string;
  failedAt?:               string;
  error?:                  string;
}

export interface JobSummary {
  jobId:                   string;
  status:                  JobStatus;
  phase:                   JobPhase | null;
  repoPath:                string;
  graphId?:                string;
  summarizationTotal?:     number;
  summarizationCompleted?: number;
  createdAt:               string;
  startedAt?:              string;
  pausedAt?:               string;
  cancelledAt?:            string;
  completedAt?:            string;
  failedAt?:               string;
  error?:                  string;
}

// ── Config types ─────────────────────────────────────────────────────────────

export type LLMProvider =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "gemini"
  | "ollama"
  | "managed";

export type EmbeddingProvider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "gemini"
  | "ollama"
  | "managed";

export interface SummarizationConfig {
  provider:  LLMProvider;
  model:     string;
  apiKey?:   string;
  baseUrl?:  string;
  batchSize: number;
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model:    string;
  apiKey?:  string;
  baseUrl?: string;
}

export interface DevLensConfig {
  deploymentMode: "local" | "cloud";
  summarization:  SummarizationConfig;
  embedding:      EmbeddingConfig;
}

// ── Graph meta types ─────────────────────────────────────────────────────────

export interface CommitSummary {
  commitHash:    string;
  branch:        string;
  message:       string;
  analyzedAt:    string;
  nodeCount:     number;
  edgeCount:     number;
  hasGit:        boolean;
  isSummarized?: boolean;
}

export interface GraphMeta {
  graphId:           string;
  repoPath:          string;
  isGithubRepo:      boolean;
  commits:           CommitSummary[];
  summarizedCommits: string[];
}

// ── Diff types ───────────────────────────────────────────────────────────────

export interface DiffNode {
  nodeId:   string;
  name:     string;
  type:     string;
  score:    number;
  filePath: string;
}

export interface ScoreChange {
  nodeId:      string;
  name:        string;
  type:        string;
  scoreBefore: number;
  scoreAfter:  number;
  delta:       number;
}

export interface EdgeChange {
  nodeId:       string;
  name:         string;
  addedEdges:   { to: string; type: string }[];
  removedEdges: { to: string; type: string }[];
}

export interface MovedNode {
  nodeId:      string;
  name:        string;
  fromFile:    string;
  toFile:      string;
  scoreBefore: number;
  scoreAfter:  number;
}

export interface CodeChange {
  nodeId:      string;
  name:        string;
  type:        string;
  filePath:    string;
  score:       number;
  scoreBefore: number;
  scoreAfter:  number;
}
 
// this is to compare 2 different commits
export interface NodeDiff {
  added:        DiffNode[];
  removed:      DiffNode[];
  scoreChanged: ScoreChange[];
  codeChanged:  CodeChange[];
  edgesChanged: EdgeChange[];
  moved:        MovedNode[];
  unchanged:    number;
}


// This interface for the overlayed graph when a node is being clicked
export interface OverlayGraph {
  rootNodeId:      string;
  activeNodeTypes: NodeType[];
  activeEdgeTypes: EdgeType[];
  mode: "full" | "khop" | "blast";
  hopDepth?: number; // only for khop/blast radius mode
}