import { SourceFile, SyntaxKind } from "ts-morph";
import { CodeNode } from "../../types";

// these are used to detect the routes in the Nextjs
const HTTP_METHOD_EXPORTS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);


function makeId(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function extractParams(node: any): string[] {
  const params = node.getParameters ? node.getParameters() : [];
  return params.map((p: any) => p.getName());
}

function extractFunctionCalls(node: any): string[] {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const names: string[] = [];
  for (const call of calls) {
    const name = call.getExpression().getText();
    // Skip hooks, they are handled by hooks extractor
    if (name.startsWith("use")) continue;
    // Skip console calls, they are noise
    if (name.startsWith("console")) continue;
    names.push(name);
  }
  return [...new Set(names)];
}

function extractHookCalls(node: any): string[] {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const hooks: string[] = [];
  for (const call of calls) {
    const name = call.getExpression().getText();
    // Only capture custom hooks — use[A-Z] pattern
    // Built-in React hooks (useState etc.) are not in our node graph
    if (/^use[A-Z]/.test(name)) hooks.push(name);
  }
  return [...new Set(hooks)];
}

function extractApiCalls(node: any): string[] {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const apiCalls: string[] = [];

  for (const call of calls) {
    const text = call.getText();
    const expr = call.getExpression().getText();

    // ─── fetch ────────────────────────────────────────────────────────────────
    if (expr === "fetch") {
      const args = call.getArguments();
      if (args.length > 0) apiCalls.push(`fetch(${args[0].getText()})`);
    }

    // ─── axios ────────────────────────────────────────────────────────────────
    if (
      expr === "axios.get" ||
      expr === "axios.post" ||
      expr === "axios.put" ||
      expr === "axios.delete" ||
      expr === "axios.patch" ||
      expr === "axios"
    ) {
      const args = call.getArguments();
      if (args.length > 0) apiCalls.push(`${expr}(${args[0].getText()})`);
    }

    // ─── React Query (useQuery, useMutation, useInfiniteQuery) ────────────────
    if (
      expr === "useQuery" ||
      expr === "useMutation" ||
      expr === "useInfiniteQuery" ||
      expr === "useSuspenseQuery"
    ) {
      const args = call.getArguments();
      if (args.length > 0) apiCalls.push(`${expr}(${args[0].getText()})`);
    }

    // ─── SWR ──────────────────────────────────────────────────────────────────
    if (expr === "useSWR" || expr === "useSWRMutation") {
      const args = call.getArguments();
      if (args.length > 0) apiCalls.push(`${expr}(${args[0].getText()})`);
    }
  }

  return [...new Set(apiCalls)];
}

function hasErrorHandling(node: any): boolean {
  const tryCatch = node.getDescendantsOfKind(SyntaxKind.TryStatement);
  return tryCatch.length > 0;
}

function extractThrowStatements(node: any): boolean {
  const throws = node.getDescendantsOfKind(SyntaxKind.ThrowStatement);
  return throws.length > 0;
}

export function extractFunctions(file: SourceFile): CodeNode[] {
  const nodes: CodeNode[] = [];
  const filePath = file.getFilePath();

  // ─── Function Declarations ─────────────────────────────────────────────────

  for (const fn of file.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    // Skip React components (uppercase) — handled by components extractor.
    // Exception: HTTP method exports (GET, POST, etc.) are uppercase but are
    // route handlers, not components. Captured in the dedicated section below.
    if (/^[A-Z]/.test(name) && !HTTP_METHOD_EXPORTS.has(name)) continue;

    // Skip hooks - handled by hooks extractor
    if (/^use[A-Z]/.test(name)) continue;

    const params = extractParams(fn);
    const calls = extractFunctionCalls(fn);
    const hookCalls = extractHookCalls(fn);
    const apiCalls = extractApiCalls(fn);
    const isAsync = fn.isAsync();
    const hasErrors = hasErrorHandling(fn);
    const throws = extractThrowStatements(fn);

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "FUNCTION",
      filePath,
      startLine: fn.getStartLineNumber(),
      endLine: fn.getEndLineNumber(),
      rawCode: fn.getText(),
      metadata: {
        params,
        calls,
        hookCalls,
        apiCalls,
        isAsync,
        hasErrorHandling: hasErrors,
        throws,
        lineCount: fn.getEndLineNumber() - fn.getStartLineNumber(),
        isHttpHandler: HTTP_METHOD_EXPORTS.has(name),
        httpMethod: HTTP_METHOD_EXPORTS.has(name) ? name : undefined,
      },
    });
  }

  // ─── Arrow Function Declarations ───────────────────────────────────────────

  for (const variable of file.getVariableDeclarations()) {
    const name = variable.getName();

    // Skip React components and not nextJs HTTP routes
    if (/^[A-Z]/.test(name) && !HTTP_METHOD_EXPORTS.has(name)) continue;

    // Skip hooks
    if (/^use[A-Z]/.test(name)) continue;

    const initializer = variable.getInitializer();
    if (!initializer) continue;

    const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;
    if (!isArrow) continue;

    const params = extractParams(initializer);
    const calls = extractFunctionCalls(initializer);
    const hookCalls = extractHookCalls(initializer);
    const apiCalls = extractApiCalls(initializer);
    const isAsync = initializer.getText().startsWith("async");
    const hasErrors = hasErrorHandling(initializer);
    const throws = extractThrowStatements(initializer);

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "FUNCTION",
      filePath,
      startLine: variable.getStartLineNumber(),
      endLine: variable.getEndLineNumber(),
      rawCode: variable.getText(),
      metadata: {
        params,
        calls,
        hookCalls,
        apiCalls,
        isAsync,
        hasErrorHandling: hasErrors,
        throws,
        lineCount: variable.getEndLineNumber() - variable.getStartLineNumber(),
        isHttpHandler: HTTP_METHOD_EXPORTS.has(name),
        httpMethod:     HTTP_METHOD_EXPORTS.has(name) ? name : undefined,
      },
    });
  }

  // ─── HTTP Method Exports (re-exported via export { GET } pattern) ──────────
  //
  // Handles the case where a route.ts re-exports a handler defined elsewhere:
  //   import { myHandler } from "./handlers";
  //   export { myHandler as GET };
  //
  // In this case getFunctions() and getVariableDeclarations() won't find GET.
  // We detect export specifiers that alias to an HTTP method name.

  for (const exportDecl of file.getExportDeclarations()) {
    for (const specifier of exportDecl.getNamedExports()) {
      const exportedName = specifier.getAliasNode()?.getText()
        ?? specifier.getName();

      if (!HTTP_METHOD_EXPORTS.has(exportedName)) continue;

      // The local name is what was imported — use it to find the original node
      const localName = specifier.getName();

      // Check if we already captured it above (direct export)
      const alreadyCaptured = nodes.some(n => n.name === exportedName);
      if (alreadyCaptured) continue;

      // We can't get line numbers reliably for re-exports, so use the
      // export declaration's position as a proxy
      nodes.push({
        id:        makeId(filePath, exportedName),
        name:      exportedName,
        type:      "FUNCTION",
        filePath,
        startLine: exportDecl.getStartLineNumber(),
        endLine:   exportDecl.getEndLineNumber(),
        rawCode:   exportDecl.getText(),
        metadata: {
          params:           [],
          calls:            [],
          apiCalls:         [],
          isAsync:          false,
          hasErrorHandling: false,
          throws:           false,
          lineCount:        1,
          isHttpHandler:    true,
          httpMethod:       exportedName,
          // Record that this is a re-export so routeEdges can follow
          // the chain to the actual implementation if needed
          isReExport:       true,
          reExportedFrom:   localName,
        },
      });
    }
  }

  return nodes;
}