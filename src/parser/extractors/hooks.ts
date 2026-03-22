import { SourceFile, SyntaxKind } from "ts-morph";
import { CodeNode } from "../../types";

function makeId(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function extractDependencies(node: any): string[] {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const deps: string[] = [];
  for (const call of calls) {
    const name = call.getExpression().getText();
    if (name.startsWith("use")) {
      deps.push(name);
    }
  }
  return [...new Set(deps)];
}

function extractReturnType(node: any): string {
  const returnStatements = node.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  if (returnStatements.length === 0) return "void";
  
  // Check if it returns an array (like useState pattern)
  for (const ret of returnStatements) {
    const expr = ret.getExpression();
    if (!expr) continue;
    if (expr.getKind() === SyntaxKind.ArrayLiteralExpression) return "array";
    if (expr.getKind() === SyntaxKind.ObjectLiteralExpression) return "object";
  }
  return "unknown";
}

export function extractHooks(file: SourceFile): CodeNode[] {
  const nodes: CodeNode[] = [];
  const filePath = file.getFilePath();

  // ─── Function Declaration Hooks ────────────────────────────────────────────
  // e.g. function useAuth() { ... }

  for (const fn of file.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    // Hooks must start with "use" followed by uppercase
    if (!/^use[A-Z]/.test(name)) continue;

    const dependencies = extractDependencies(fn);
    const returnType = extractReturnType(fn);
    const isAsync = fn.isAsync();

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "HOOK",
      filePath,
      startLine: fn.getStartLineNumber(),
      endLine: fn.getEndLineNumber(),
      rawCode: fn.getText(),
      metadata: {
        dependencies,   // other hooks this hook uses internally
        returnType,     // array, object, or void
        isAsync,
      },
    });
  }

  // ─── Arrow Function Hooks ──────────────────────────────────────────────────
  // e.g. const useAuth = () => { ... }

  for (const variable of file.getVariableDeclarations()) {
    const name = variable.getName();

    // Hooks must start with "use" followed by uppercase
    if (!/^use[A-Z]/.test(name)) continue;

    const initializer = variable.getInitializer();
    if (!initializer) continue;

    const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;
    if (!isArrow) continue;

    const dependencies = extractDependencies(initializer);
    const returnType = extractReturnType(initializer);
    const isAsync = initializer.asKind(SyntaxKind.ArrowFunction)?.isAsync() ?? false;

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "HOOK",
      filePath,
      startLine: variable.getStartLineNumber(),
      endLine: variable.getEndLineNumber(),
      rawCode: variable.getText(),
      metadata: {
        dependencies,
        returnType,
        isAsync,
      },
    });
  }

  return nodes;
}