//This file will extract the React Components from the files
import { SourceFile, SyntaxKind, Node } from "ts-morph";
import type { CodeNode } from "../../types";

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

// Checks if a component has any state (useState or useReducer)
function hasState(hooks: string[]): boolean {
  return hooks.includes("useState") || hooks.includes("useReducer");
}

export function extractComponents(file: SourceFile): CodeNode[] {
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
        hasState: hasState(hooks),
        exportType: fn.isDefaultExport() ? "default" : "named",
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
        hasState: hasState(hooks),
        exportType: isDefault ? "default" : isExported ? "named" : "none",
        isMemoized: isMemoOrForwardRef,  // useful metadata for scoring later
      },
    });
  }

  return nodes;
}