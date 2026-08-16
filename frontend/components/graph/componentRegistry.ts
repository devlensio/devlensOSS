import type { NodeType, EdgeType } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Component Registry — the single source of truth for the Filter Control
 *  Center (graph page header).
 *
 *  WHY THIS FILE EXISTS:
 *  Nodes, edges and languages keep growing as the engine adds languages. If
 *  each type is scattered across dropdown components, adding one means touching
 *  many files. Here we centralise everything (labels, groups, which languages
 *  emit a type) so the Control Center renders it automatically.
 *
 *  HOW TO ADD A NEW NODE/EDGE TYPE:
 *    1. Add it to the NodeType / EdgeType union in `lib/types.tsx`.
 *    2. Add a color + shape in `components/graph/cytoscapeConfig.ts`.
 *    3. Add a definition below (label + group + languages). Done — it now
 *       appears in the Control Center grouped and searchable.
 *
 *  HOW TO ADD A NEW LANGUAGE:
 *    1. Add a `LanguageDef` below with its node/edge types and label.
 *    2. The Control Center's "Languages" tab lists it, and the type groups
 *       cross-reference `languages` so users can filter by language.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NodeGroup = "frontend" | "core" | "oop";
export type EdgeGroup = "dataflow" | "structure" | "framework" | "jsx";

export interface NodeTypeDef {
  type: NodeType;
  label: string;
  group: NodeGroup;
  /** languages that can emit this node type (for the Language tab) */
  languages: string[];
  /** short human description shown on hover in the Control Center */
  description: string;
}

export interface EdgeTypeDef {
  type: EdgeType;
  label: string;
  group: EdgeGroup;
  languages: string[];
  description: string;
}

export interface LanguageDef {
  id: string;
  label: string;
  /** node types this language typically produces */
  nodeTypes: NodeType[];
  /** edge types this language typically produces */
  edgeTypes: EdgeType[];
}

// ─── Node type definitions ────────────────────────────────────────────────────

export const NODE_TYPE_DEFS: NodeTypeDef[] = [
  // Frontend / React
  { type: "COMPONENT",   label: "Component",  group: "frontend", languages: ["typescript", "javascript"], description: "React component" },
  { type: "HOOK",        label: "Hook",       group: "frontend", languages: ["typescript", "javascript"], description: "React hook" },
  { type: "STATE_STORE", label: "Store",      group: "frontend", languages: ["typescript", "javascript"], description: "Global state store (Zustand/Jotai)" },
  { type: "ROUTE",       label: "Route",      group: "frontend", languages: ["typescript", "javascript", "python", "java", "go", "rust"], description: "URL route / endpoint" },
  { type: "STORY",       label: "Storybook",  group: "frontend", languages: ["typescript", "javascript"], description: "Storybook story" },

  // Core / language-agnostic
  { type: "FUNCTION",    label: "Function",   group: "core", languages: ["typescript", "javascript", "python", "go", "rust"], description: "Standalone function" },
  { type: "FILE",        label: "File",       group: "core", languages: ["typescript", "javascript", "python", "java", "go", "rust"], description: "Source file" },
  { type: "GHOST",       label: "Ghost",      group: "core", languages: ["typescript", "javascript"], description: "Inferred external reference" },
  { type: "UTILITY",     label: "Utility",    group: "core", languages: ["typescript", "javascript"], description: "Utility helper" },
  { type: "TEST",        label: "Test",       group: "core", languages: ["typescript", "javascript", "python", "java", "go", "rust"], description: "Unit/integration test" },
  { type: "THIRD_PARTY", label: "Library",    group: "core", languages: ["typescript", "javascript", "python", "java", "go", "rust"], description: "Third-party package" },

  // OOP / multi-language structural
  { type: "CLASS",       label: "Class",      group: "oop", languages: ["typescript", "python", "java"], description: "Class definition" },
  { type: "METHOD",      label: "Method",     group: "oop", languages: ["typescript", "python", "java", "go", "rust"], description: "Method on a class/struct" },
  { type: "INTERFACE",   label: "Interface",  group: "oop", languages: ["typescript", "java", "go", "rust"], description: "Interface / abstract contract" },
  { type: "ENUM",        label: "Enum",       group: "oop", languages: ["typescript", "java", "go", "rust"], description: "Enumeration type" },
  { type: "STRUCT",      label: "Struct",     group: "oop", languages: ["go", "rust"], description: "Struct / record" },
  { type: "MODULE",      label: "Module",     group: "oop", languages: ["python", "go", "rust", "java"], description: "Module / top-level unit" },
  { type: "TRAIT",       label: "Trait",      group: "oop", languages: ["rust"], description: "Rust trait" },
  { type: "IMPL_BLOCK",  label: "Impl",       group: "oop", languages: ["rust"], description: "Rust impl block" },
  { type: "PACKAGE",     label: "Package",    group: "oop", languages: ["python", "java", "go"], description: "Package / namespace" },
];

// ─── Edge type definitions ────────────────────────────────────────────────────

export const EDGE_TYPE_DEFS: EdgeTypeDef[] = [
  // Dataflow
  { type: "CALLS",      label: "Calls",      group: "dataflow", languages: ["*"], description: "Function/method call" },
  { type: "READS_FROM", label: "Reads From", group: "dataflow", languages: ["*"], description: "Reads data from a model/store" },
  { type: "WRITES_TO",  label: "Writes To",  group: "dataflow", languages: ["*"], description: "Writes data to a model/store" },
  { type: "USES",       label: "Uses",       group: "dataflow", languages: ["*"], description: "Uses an external value/function" },

  // Structure
  { type: "IMPORTS",    label: "Imports",    group: "structure", languages: ["*"], description: "Imports a module/package" },
  { type: "EXTENDS",    label: "Extends",    group: "structure", languages: ["typescript", "python", "java", "go"], description: "Inherits from a parent class/struct" },
  { type: "IMPLEMENTS", label: "Implements", group: "structure", languages: ["typescript", "java", "go", "rust"], description: "Implements an interface/trait" },
  { type: "EXPORTS",    label: "Exports",    group: "structure", languages: ["python", "go", "rust", "java"], description: "Exports a symbol/module" },

  // Framework / app wiring
  { type: "HANDLES",        label: "Handles",     group: "framework", languages: ["*"], description: "Route/endpoint handler" },
  { type: "WRAPPED_BY",     label: "Wrapped By",  group: "framework", languages: ["typescript", "javascript"], description: "Wrapped by HOC/decorator" },
  { type: "NEXTJS_API_CALL",label: "Next API",    group: "framework", languages: ["typescript", "javascript"], description: "Next.js API route call" },
  { type: "NAVIGATES_TO",   label: "Navigates To",group: "framework", languages: ["typescript", "javascript"], description: "Client-side navigation" },
  { type: "THROWS",      label: "Throws",     group: "framework", languages: ["java", "python"], description: "Throws an exception type" },

  // JSX / component graph
  { type: "PROP_PASS", label: "Prop Pass", group: "jsx", languages: ["typescript", "javascript"], description: "Passes props" },
  { type: "EMITS",     label: "Emits",     group: "jsx", languages: ["typescript", "javascript"], description: "Emits an event" },
  { type: "LISTENS",   label: "Listens",   group: "jsx", languages: ["typescript", "javascript"], description: "Listens to an event" },
  { type: "GUARDS",    label: "Guards",    group: "jsx", languages: ["typescript", "javascript"], description: "Conditional/branch guard" },
  { type: "TESTS",     label: "Tests",     group: "jsx", languages: ["*"], description: "Test → tested node" },
];

// ─── Language definitions ─────────────────────────────────────────────────────

export const LANGUAGE_DEFS: LanguageDef[] = [
  {
    id: "typescript",
    label: "TypeScript / JavaScript (React)",
    nodeTypes: ["COMPONENT", "HOOK", "FUNCTION", "STATE_STORE", "UTILITY", "FILE", "GHOST", "ROUTE", "TEST", "STORY", "THIRD_PARTY", "CLASS", "METHOD", "INTERFACE", "ENUM"],
    edgeTypes: ["CALLS", "IMPORTS", "READS_FROM", "WRITES_TO", "PROP_PASS", "EMITS", "LISTENS", "WRAPPED_BY", "GUARDS", "HANDLES", "TESTS", "USES", "NEXTJS_API_CALL", "NAVIGATES_TO", "IMPLEMENTS", "EXTENDS"],
  },
  {
    id: "python",
    label: "Python",
    nodeTypes: ["CLASS", "METHOD", "FUNCTION", "MODULE", "PACKAGE", "ROUTE", "TEST", "FILE", "THIRD_PARTY", "ENUM"],
    edgeTypes: ["CALLS", "IMPORTS", "READS_FROM", "WRITES_TO", "HANDLES", "TESTS", "IMPLEMENTS", "EXTENDS", "EXPORTS", "THROWS"],
  },
  {
    id: "java",
    label: "Java",
    nodeTypes: ["CLASS", "METHOD", "INTERFACE", "ENUM", "MODULE", "PACKAGE", "ROUTE", "TEST", "FILE", "THIRD_PARTY"],
    edgeTypes: ["CALLS", "IMPORTS", "READS_FROM", "WRITES_TO", "HANDLES", "TESTS", "IMPLEMENTS", "EXTENDS", "EXPORTS", "THROWS"],
  },
  {
    id: "go",
    label: "Go",
    nodeTypes: ["PACKAGE", "STRUCT", "METHOD", "INTERFACE", "ENUM", "FUNCTION", "MODULE", "ROUTE", "TEST", "FILE", "THIRD_PARTY"],
    edgeTypes: ["CALLS", "IMPORTS", "READS_FROM", "WRITES_TO", "HANDLES", "TESTS", "IMPLEMENTS", "EXTENDS", "EXPORTS"],
  },
  {
    id: "rust",
    label: "Rust",
    nodeTypes: ["STRUCT", "ENUM", "TRAIT", "IMPL_BLOCK", "METHOD", "MODULE", "FUNCTION", "ROUTE", "TEST", "FILE", "THIRD_PARTY"],
    edgeTypes: ["CALLS", "IMPORTS", "READS_FROM", "WRITES_TO", "HANDLES", "TESTS", "IMPLEMENTS", "EXTENDS", "EXPORTS"],
  },
];

// ─── Derived maps for convenient lookup ───────────────────────────────────────

export const NODE_TYPE_DEF_BY_TYPE: Record<NodeType, NodeTypeDef> =
  Object.fromEntries(NODE_TYPE_DEFS.map(d => [d.type, d])) as Record<NodeType, NodeTypeDef>;

export const EDGE_TYPE_DEF_BY_TYPE: Record<EdgeType, EdgeTypeDef> =
  Object.fromEntries(EDGE_TYPE_DEFS.map(d => [d.type, d])) as Record<EdgeType, EdgeTypeDef>;

export const NODE_GROUPS: { id: NodeGroup; label: string }[] = [
  { id: "frontend", label: "Frontend / React" },
  { id: "core",     label: "Core" },
  { id: "oop",      label: "OO / Structural" },
];

export const EDGE_GROUPS: { id: EdgeGroup; label: string }[] = [
  { id: "dataflow",  label: "Data Flow" },
  { id: "structure", label: "Structure" },
  { id: "framework", label: "Framework / App" },
  { id: "jsx",       label: "Component / JSX" },
];

/** The default node types to show when a new graph loads (mirrors DEFAULT_NODE_TYPES). */
export const DEFAULT_VISIBLE_NODE_TYPES: NodeType[] = [
  "COMPONENT", "HOOK", "FUNCTION", "STATE_STORE", "ROUTE", "TEST", "STORY",
  "CLASS", "METHOD", "INTERFACE", "ENUM", "STRUCT", "TRAIT", "MODULE", "PACKAGE",
];

export const DEFAULT_VISIBLE_EDGE_TYPES: EdgeType[] = [
  "CALLS", "PROP_PASS", "READS_FROM", "WRITES_TO", "EMITS", "LISTENS",
  "WRAPPED_BY", "GUARDS", "TESTS", "USES", "HANDLES", "NEXTJS_API_CALL",
  "NAVIGATES_TO", "IMPLEMENTS", "EXTENDS", "EXPORTS", "THROWS",
];
