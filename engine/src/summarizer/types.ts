//storing types used for summarization flow

import type { PipelineResult } from "../pipeline";

export interface NodeSummary {
    // The result of summarizing a single node.
    // These fields are written directly onto the CodeNode itself —
    // not stored separately. When you fetch a node you get its summary too.
    technicalSummary: string;
    businessSummary: string;
     security: {
        severity :  "none" | "low" | "medium" | "high";
        summary: string;
    }
    model: string;
    summarizedAt: string;
    tokensUsed?: number;
}


// Group of nodes that forms cyclic dependencies
export interface CycleGroup {
  nodeIds: string[];   // IDs of all nodes in this cycle
  size:    number;     
}

//For the openSource model, if the user pauses the summarization step in middle, we would need the checkpoint to give  user resume option. For openSource , the storage of the checkpoint will happen via file writes. Saved to disk after every batch processing
// Path: ~/.devlens/graphs/{graphId}/commits/{commitHash}.summaries.json

export interface SummaryCheckpoint {
    graphId:    string;
  commitHash: string;
  status:     "running" | "paused" | "completed";
  createdAt:  string;   // when summarization started
  updatedAt:  string;   // when checkpoint was last saved
  nodeOrder:   string[][];        // order in which summaries have to be derived. Currently I am using Kahn's algo for this. However scope for better algo is there. If you are contributor feel free to propose a better algo.
  cycleGroups: CycleGroup[]; 
  fileNodes:   string[];    
  lastCompletedLevel:      number;  
  lastCompletedCycleGroup: number;  
  lastCompletedFileNode:   number;  
  totalNodes:     number;  // nodeOrder.length + cycleGroups flat + fileNodes.length
  completedNodes: number;
}

//Since the runner will never call job queue directly, callbacks has to be passed to execute the functions
export interface SummarizationCallbacks {
    onStarted:  (totalNodes: number) => void;
    onProgress: (completed: number, total: number, nodeName: string) => void;
    onPause:    () => void;
    onCancel:   (cleanedUp: boolean) => void;
    onComplete: () => void;
    onError:    (error: string) => void;
}

//inputs (everything runSummarization needs to do its job)
export interface SummarizationInput {
    job: import("../jobs/types").Job;
    queue:    import("../jobs/queue/interface").JobQueue;
    graphId:  string;
    commitHash: string;
    repoPath: string;
    previousCommitHash?: string;
    routes: PipelineResult["routes"];
    // generateEmbeddings:  boolean;   // Will be done speerately in cloud backend
    callbacks: SummarizationCallbacks;
}

export interface TopologicalResult {
    nodeOrder:   string[][];
    cycleGroups: CycleGroup[];
    fileNodes:   string[];
}

// Edge types that drive topological sort order.
// A node must wait for all nodes it has these edges TO before being summarized.
// export const HARD_DEPENDENCY_EDGES = new Set([
//   "CALLS",
//   "READS_FROM",
//   "WRITES_TO",
//   "GUARDS",
// ]);


// Cycle groups at or below this size → summarize together in one LLM call
// Above this → summarize individually
export const MAX_GROUP_SUMMARY_SIZE = 3;

// Nodes whose source code exceeds this token estimate → MapReduce
// ~1200 tokens ≈ 900 lines — only very large files hit this
export const MAPREDUCE_TOKEN_THRESHOLD = 1200;

// Batch size for the files to be summarized at a time
export const FILE_BATCH_SIZE = 10;