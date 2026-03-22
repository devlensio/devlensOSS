export type Language = "javascript" | "typescript" | "python" | "unknown";


export type Framework =
  | "nextjs"
  | "react"
  | "express"
  | "fastify"
  | "koa"
  | "unknown";


export type FrontendFramework = "nextjs" | "react";
export type BackendFramework = "express" | "fastify" | "koa";  // no unknown here


export type RouterType =
  | "app"
  | "pages"
  | "app+pages"
  | "react-router"
  | "none";


export type ProjectType = "frontend" | "backend" | "fullstack" | "unknown";

// ─── State Management 
export type StateLibrary =
  | "zustand"
  | "redux"
  | "recoil"
  | "jotai"
  | "context-only";

// ─── Data Fetching ───
export type DataFetchingLibrary = "react-query" | "swr" | "axios" | "fetch";

// ─── Databases ───────
export type DatabaseLibrary =
  | "prisma"
  | "drizzle"
  | "mongodb"
  | "firebase"
  | "supabase"
  | "planetscale"
  | "postgres"
  | "mysql"
  | "sqlite";

// ─── Project Fingerprint 
export interface ProjectFingerprint {
  language: Language;
  projectType: ProjectType;
  framework: Framework;
  router: RouterType;
  stateManagement: StateLibrary[];
  dataFetching: DataFetchingLibrary[];
  databases: DatabaseLibrary[];
  rawDependencies: Record<string, string>;
}

// ─── Filesystem Nodes 
export type RouteNodeType =
  | "PAGE"
  | "LAYOUT"
  | "API_ROUTE"
  | "LOADING"
  | "ERROR"
  | "MIDDLEWARE"
  | "NOT_FOUND";

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

// ─── Code Nodes ──────
export type NodeType =
  | "COMPONENT"
  | "HOOK"
  | "FUNCTION"
  | "STATE_STORE"
  | "UTILITY"
  | "FILE"
  | "GHOST"
  | "ROUTE";

export interface CodeNode {
  id: string;
  name: string;
  type: NodeType;
  filePath: string;
  startLine: number;
  endLine: number;
  rawCode?: string; //! IMPORTANT: never persisted to database (without user permission), discarded after summarization
  codeHash?: string;
  technicalSummary?: string;  // what the code does: inputs, outputs, side effects
  businessSummary?:  string;  // what it means in product terms (auth, checkout etc.)
  security?: {
    severity: "none" | "low" | "medium" | "high";
    summary:  string;
  };
  summaryModel?:     string;  // e.g. "claude-haiku-4-5" or "qwen2.5-coder:3b"
  summarizedAt?:     string;  // ISO timestamp
  isEmbedded?: boolean; //tells if vectors has been generated for the node or not.
  parentFile?: string; //points to the FILE node id for this file
  score?: Number;
  metadata: Record<string, unknown>;
}

// ─── Graph Edges ─────
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
  | "HANDLES";  // SPECIAL EDGES FOR THE ROUTE NODE TYPE

export interface CodeEdge {
  from: string;
  to: string;
  type: EdgeType;
  metadata?: Record<string, unknown>;
}

