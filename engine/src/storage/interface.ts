import type { PipelineResult } from "../pipeline";
import type { GraphIndexEntry, GraphMeta, NodeDiff } from "./fileStorage";

export interface GraphStorage {
  saveGraph(result: PipelineResult, options?: {force?: boolean}): void;
  getGraph(graphId: string, commitHash?: string): PipelineResult | undefined;
  listGraphs(): GraphIndexEntry[];
  getGraphMeta(graphId: string): GraphMeta | undefined;
  deleteGraph(graphId: string): boolean;
  diffCommits(graphId: string, fromHash: string, toHash: string): NodeDiff | undefined;

  // ── Summarization ──────────────────────────────────────────────────────────
  markCommitSummarized(graphId: string, commitHash: string): void;
  isCommitSummarized(graphId: string, commitHash: string): boolean;
  findLastSummarizedAncestor(graphId: string, commitHash: string, repoPath: string): Promise<string | undefined>;
  saveNodeSummaries(graphId: string, commitHash: string, nodeUpdates: Map<string, {
    technicalSummary: string;
    businessSummary:  string;
    security:         { severity: "none" | "low" | "medium" | "high"; summary: string };
    summaryModel:     string;
    summarizedAt:     string;
  }>): void;
  getCheckpointPath(graphId: string, commitHash: string): string;
  removeFromSummarizedCommits(graphId: string, commitHash: string): void;
}