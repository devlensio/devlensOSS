import { fileStorage } from "./fileStorage";
import type { GraphStorage } from "./interface";

export const storage: GraphStorage = fileStorage;

// Re-export types so consumers only need to import from storage/index
export type { GraphIndexEntry, GraphMeta, CommitData, NodeDiff } from "./fileStorage";
export type { GraphStorage } from "./interface";