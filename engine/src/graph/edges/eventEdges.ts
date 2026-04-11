import { Project, SyntaxKind, Node } from "ts-morph";
import path from "path";
import fs from "fs";
import type { CodeNode, CodeEdge } from "../../types";
import type { LookupMaps } from "../buildLookup";

// Patterns that indicate an event is being emitted
const EMITTER_PATTERNS = [
  "dispatchEvent",
  ".emit",
];

// Patterns that indicate an event is being listened to
const LISTENER_PATTERNS = [
  "addEventListener",
  ".on",
  ".once",
];

// Recursively walk directory and add files to project
function addFilesRecursively(dir: string, project: Project): void {
  const IGNORE_DIRS = [
    "node_modules", "dist", "build",
    ".next", "coverage", ".git",
  ];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      addFilesRecursively(fullPath, project);
    } else if (entry.isFile()) {
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      if (/\.d\.ts$/.test(entry.name)) continue;
      project.addSourceFileAtPath(fullPath);
    }
  }
}

// Creates a ghost node for an event
function createGhostNode(eventName: string): CodeNode {
  return {
    id: `ghost::event:${eventName}`,
    name: `event:${eventName}`,
    type: "GHOST",
    filePath: "",
    startLine: 0,
    endLine: 0,
    metadata: {
      ghostType: "event",
      eventName,
    },
  };
}

// Extracts event name from a dispatchEvent call
// window.dispatchEvent(new CustomEvent('payment-complete'))
// We need to go one level deeper into CustomEvent arguments
function extractDispatchEventName(call: Node): string | null {
  const args = (call as any).getArguments?.();
  if (!args || args.length === 0) return null;

  const firstArg = args[0];
  const firstArgText = firstArg.getText();

  // Must be new CustomEvent('...')
  if (!firstArgText.startsWith("new CustomEvent")) return null;

  // Get arguments of CustomEvent constructor
  const newExpression = firstArg.asKind(SyntaxKind.NewExpression);
  if (!newExpression) return null;

  const customEventArgs = newExpression.getArguments();
  if (customEventArgs.length === 0) return null;

  const eventNameArg = customEventArgs[0].getText();
  // Remove surrounding quotes
  return eventNameArg.replace(/^['"`]|['"`]$/g, "");
}

// Extracts event name from emit/addEventListener/on/once calls
// eventEmitter.emit('payment-complete', data)
// window.addEventListener('payment-complete', handler)
// First argument is always the event name
function extractEventName(call: Node): string | null {
  const args = (call as any).getArguments?.();
  if (!args || args.length === 0) return null;

  const firstArg = args[0].getText();

  // Must be a string literal
  if (
    !firstArg.startsWith("'") &&
    !firstArg.startsWith('"') &&
    !firstArg.startsWith("`")
  ) return null;

  return firstArg.replace(/^['"`]|['"`]$/g, "");
}

// Walks up the AST from a node to find the containing function name
// Returns the function name or null if not found
function findContainingFunctionName(node: Node): string | null {
  let current: Node | undefined = node.getParent();

  while (current) {
    // Check if current node is any kind of function
    if (
      current.getKind() === SyntaxKind.FunctionDeclaration ||
      current.getKind() === SyntaxKind.FunctionExpression ||
      current.getKind() === SyntaxKind.ArrowFunction ||
      current.getKind() === SyntaxKind.MethodDeclaration
    ) {
      // Try to get the name
      const asFuncDecl = current.asKind(SyntaxKind.FunctionDeclaration);
      if (asFuncDecl) return asFuncDecl.getName() ?? null;

      const asMethod = current.asKind(SyntaxKind.MethodDeclaration);
      if (asMethod) return asMethod.getName() ?? null;

      // For arrow functions and function expressions
      // the name comes from the variable they are assigned to
      const parent = current.getParent();
      if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
        return (parent as any).getName?.() ?? null;
      }

      return null;
    }

    current = current.getParent();
  }

  return null;
}

export interface EventEdgeResult {
  edges: CodeEdge[];
  ghostNodes: CodeNode[];
}


//MAIN FUNCTION
export function detectEventEdges(
  lookup: LookupMaps,
  repoPath: string
): EventEdgeResult {
  const edges: CodeEdge[] = [];
  const ghostNodes: CodeNode[] = [];

  // Track ghost nodes by event name to avoid duplicates
  const ghostsByEventName = new Map<string, CodeNode>();

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: 4,
      strict: false,
    },
    skipAddingFilesFromTsConfig: true,
  });

  addFilesRecursively(repoPath, project);

  for (const file of project.getSourceFiles()) {
    const callExpressions = file.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const call of callExpressions) {
      const expressionText = call.getExpression().getText();

      // ─── Determine if emitter or listener ─────────────────────────────────
      const isEmitter = EMITTER_PATTERNS.some((p) =>
        expressionText.includes(p)
      );
      const isListener = LISTENER_PATTERNS.some((p) =>
        expressionText.includes(p)
      );

      if (!isEmitter && !isListener) continue;

      // ─── Extract event name ────────────────────────────────────────────────
      let eventName: string | null = null;

      if (expressionText.includes("dispatchEvent")) {
        // dispatchEvent wraps CustomEvent — need to go deeper
        eventName = extractDispatchEventName(call);
      } else {
        // emit / addEventListener / on / once — first arg is event name
        eventName = extractEventName(call);
      }

      if (!eventName) continue;

      // ─── Find containing function ──────────────────────────────────────────
      const containingName = findContainingFunctionName(call);
      if (!containingName) continue;

      // Look up containing function in our extracted nodes
      const containingNodes = lookup.nodesByName.get(containingName);
      if (!containingNodes || containingNodes.length === 0) continue;

      // Use first match — same name in multiple files is rare for event handlers
      const containingNode = containingNodes[0];

      // ─── Get or create ghost node ──────────────────────────────────────────
      let ghostNode = ghostsByEventName.get(eventName);
      if (!ghostNode) {
        ghostNode = createGhostNode(eventName);
        ghostsByEventName.set(eventName, ghostNode);
        ghostNodes.push(ghostNode);
      }

      // ─── Create edge ───────────────────────────────────────────────────────
      if (isEmitter) {
        edges.push({
          from: containingNode.id,
          to: ghostNode.id,
          type: "EMITS",
          metadata: { eventName },
        });
      }

      if (isListener) {
        edges.push({
          from: ghostNode.id,
          to: containingNode.id,
          type: "LISTENS",
          metadata: { eventName },
        });
      }
    }
  }

  return { edges, ghostNodes };
}