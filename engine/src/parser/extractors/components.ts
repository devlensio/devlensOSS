//This file will extract the React Components from the files
import { SourceFile, SyntaxKind, Node } from "ts-morph";
import type { CodeNode } from "../../types";
import { detectFunctionDirective, type RenderingBoundary } from "../directives";
import {
  extractReturnTypeAnnotation,
  extractReferencedInterfaces,
} from "../typeUtils";

// Generates a unique id for a node
function makeId(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

// Checks if a node returns JSX by looking for JSX elements in its body
export function returnsJSX(node: Node): boolean {
  const jsxElements = node.getDescendantsOfKind(SyntaxKind.JsxElement);
  const jsxSelfClosing = node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  const jsxFragments = node.getDescendantsOfKind(SyntaxKind.JsxFragment);
  return jsxElements.length > 0 || jsxSelfClosing.length > 0 || jsxFragments.length > 0;
}

// Extracts hooks used inside a node (store every expression starting with use, e.g. useState, useEffect, useCustomHook)
function extractHooks(node: Node): string[] {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const hooks: string[] = [];
  for (const call of calls) {
    const name = call.getExpression().getText();
    if (name.startsWith("use")) {
      hooks.push(name);
    }
  }
  return [...new Set(hooks)]; // deduplicate
}

// Extracts the context variable names passed to useContext() calls.
// e.g. useContext(AuthContext) → ["AuthContext"]
// This is stored separately from hooks so stateEdges.ts can do a direct
// name lookup instead of relying on a fragile heuristic.
function extractContextRefs(node: Node): string[] {
  const refs: string[] = [];
  for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() === "useContext") {
      const arg = call.getArguments()[0];
      if (arg) refs.push(arg.getText());
    }
  }
  return [...new Set(refs)];
}

// This will return all the external calls made inside the component (meaning all the calls except the calls to the inner functions and the hooks)
function extractAllCalls(node: Node): string[] {
  const innerFunctionNames = new Set<string>();
  
  // variable declearations like const fn = () => {} or const fn = function() {}
  for(const varDecl of node.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const name = varDecl.getName();
    const init = varDecl.getInitializer();
    if(!init) continue;
    if(init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression) {
      innerFunctionNames.add(name);
    }
  }

  // Function declarations like function fn() {}
  for(const fn of node.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName();
    if(name) innerFunctionNames.add(name);
  }

  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const externalCalls = new Set<string>();

  for(const call of calls) {
    const expr     = call.getExpression();
    const fullExpr = expr.getText();
    const rootName = fullExpr.split(".")[0];

    if(rootName.startsWith("use")) continue; // skip hooks
    if(rootName.startsWith("React")) continue;
    if(innerFunctionNames.has(rootName)) continue; // skip calls to inner functions

    // Capture the full expression (e.g. "axios.get" not just "axios") so
    // callEdges.ts can create a per-method third-party node when needed.
    externalCalls.add(fullExpr);
  }
  return [...externalCalls];
}

// Checks if a component has any state (useState or useReducer)
function hasState(hooks: string[]): boolean {
  return hooks.includes("useState") || hooks.includes("useReducer");
}

// Extracts prop types from the first parameter of a component function.
// Handles three patterns:
//   1. function Button({ color }: ButtonProps) — named ref → look up interface
//   2. function Button({ color }: { color: string }) — inline object type literal
//   3. const Button: React.FC<ButtonProps> = ... — generic type argument (regex)
function extractPropTypes(
  fn: any,
  sourceFile: SourceFile
): Record<string, string> | undefined {
  const params = fn.getParameters ? fn.getParameters() : [];
  if (!params.length) return undefined;

  const firstParam = params[0];
  const typeNode = firstParam.getTypeNode();
  if (!typeNode) return undefined;

  const typeText = typeNode.getText();

  // Pattern 2: inline object literal `{ color: string; onClick: () => void }`
  if (typeText.startsWith("{")) {
    try {
      const typeLiteral = typeNode.asKind(SyntaxKind.TypeLiteral);
      if (typeLiteral) {
        const props: Record<string, string> = {};
        for (const member of typeLiteral.getProperties()) {
          props[member.getName()] = member.getTypeNode()?.getText() ?? "unknown";
        }
        return Object.keys(props).length ? props : undefined;
      }
    } catch {
      return undefined;
    }
  }

  // Pattern 1: named type reference like `ButtonProps`
  const trimmed = typeText.trim();
  if (/^[A-Z][A-Za-z0-9_]*$/.test(trimmed)) {
    const result = extractReferencedInterfaces(sourceFile, [trimmed]);
    return result[trimmed] ?? undefined;
  }

  return undefined;
}

export function extractComponents(file: SourceFile, fileDirective: RenderingBoundary = null): CodeNode[] {
  const nodes: CodeNode[] = [];
  const filePath = file.getFilePath();

  // ─── Function Declarations ─────────────────────────────────────────────────
  // e.g. function MyComponent() { return <div /> }

  for (const fn of file.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    // React components start with uppercase
    if (!/^[A-Z]/.test(name)) continue;

    // Must return JSX
    if (!returnsJSX(fn)) continue;

    const hooks = extractHooks(fn);
    const externalCalls = extractAllCalls(fn);
    const contextRefs = extractContextRefs(fn);
    const renderingBoundary = detectFunctionDirective(fn.getBody()) ?? fileDirective;
    const propTypes = extractPropTypes(fn, file);
    const returnType = extractReturnTypeAnnotation(fn) ?? "JSX.Element";

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "COMPONENT",
      filePath,
      startLine: fn.getStartLineNumber(),
      endLine: fn.getEndLineNumber(),
      rawCode: fn.getText(),
      metadata: {
        hooks,
        contextRefs,
        uses: externalCalls,
        hasState: hasState(hooks),
        exportType: fn.isDefaultExport() ? "default" : "named",
        propTypes,
        returnType,
        ...(renderingBoundary !== null && { renderingBoundary }),
      },
    });
  }

  // ─── Arrow Function Components ─────────────────────────────────────────────
  // e.g. const MyComponent = () => <div />
  // e.g. export const MyComponent = () => { return <div /> }

  for (const variable of file.getVariableDeclarations()) {
    const name = variable.getName();

    // React components start with uppercase
    if (!/^[A-Z]/.test(name)) continue;

    const initializer = variable.getInitializer();
    if (!initializer) continue;

    const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;

    // Check for React.memo and React.forwardRef wrappers
    const isMemoOrForwardRef =
      initializer.getKind() === SyntaxKind.CallExpression &&
      (initializer.getText().startsWith("React.memo") ||
        initializer.getText().startsWith("React.forwardRef") ||
        initializer.getText().startsWith("memo(") ||
        initializer.getText().startsWith("forwardRef("));

    // Must be either a direct arrow function or a wrapped component
    if (!isArrow && !isMemoOrForwardRef) continue;

    // For wrapped components we need to look inside the wrapper
    // to find the actual arrow function to check for JSX
    let nodeToAnalyze = initializer;

    if (isMemoOrForwardRef) {
      const callExpr = initializer.asKind(SyntaxKind.CallExpression);
      const firstArg = callExpr?.getArguments()[0];
      if (!firstArg) continue;

      // Inner component can be arrow function or regular function expression
      const asArrow = firstArg.asKind(SyntaxKind.ArrowFunction);
      const asFunctionExpr = firstArg.asKind(SyntaxKind.FunctionExpression);

      const inner = asArrow ?? asFunctionExpr;
      if (!inner) continue;

      nodeToAnalyze = inner;
    }

    // Must return JSX
    if (!returnsJSX(nodeToAnalyze)) continue;

    const hooks = extractHooks(nodeToAnalyze);
    const externalCalls = extractAllCalls(nodeToAnalyze);
    const contextRefs = extractContextRefs(nodeToAnalyze);
    const renderingBoundary = detectFunctionDirective(
      nodeToAnalyze.getKind() === SyntaxKind.ArrowFunction
        ? (nodeToAnalyze as any).getBody()
        : undefined
    ) ?? fileDirective;
    const propTypes = extractPropTypes(nodeToAnalyze, file);
    const returnType = extractReturnTypeAnnotation(nodeToAnalyze) ?? "JSX.Element";

    const variableStatement = variable.getVariableStatement();
    const isExported = variableStatement
      ? variableStatement.isExported()
      : false;
    const isDefault = variableStatement
      ? variableStatement.isDefaultExport()
      : false;

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "COMPONENT",
      filePath,
      startLine: variable.getStartLineNumber(),
      endLine: variable.getEndLineNumber(),
      rawCode: variable.getText(),
      metadata: {
        hooks,
        contextRefs,
        uses: externalCalls,
        hasState: hasState(hooks),
        exportType: isDefault ? "default" : isExported ? "named" : "none",
        isMemoized: isMemoOrForwardRef,
        propTypes,
        returnType,
        ...(renderingBoundary !== null && { renderingBoundary }),
      },
    });
  }

  return nodes;
}