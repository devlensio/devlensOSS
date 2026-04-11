import { Project, SyntaxKind } from "ts-morph";
import path from "path";
import fs from "fs";
import type { CodeNode, CodeEdge, RouteNode, BackendRouteNode, ProjectFingerprint } from "../../types";
import type { LookupMaps } from "../buildLookup";

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

// Cleans a Next.js matcher pattern to a base path for matching
// "/dashboard/:path*" → "/dashboard"
// "/admin"            → "/admin"
function cleanMatcherPattern(pattern: string): string {
  return pattern
    .replace(/\/:path\*/g, "")   // remove /:path*
    .replace(/\/:[^/]+/g, "")    // remove any :param segments
    .replace(/\*/g, "")          // remove wildcards
    .replace(/\/$/, "")          // remove trailing slash
    || "/";                       // fallback to root
}

// Checks if a route path is protected by a guard pattern
function routeMatchesPattern(routePath: string, guardPattern: string): boolean {
  if (guardPattern === "/") return true; // guards all routes
  return routePath === guardPattern || routePath.startsWith(guardPattern + "/");
}

// ─── Next.js Guard Detection ──────────────────────────────────────────────────

function detectNextjsGuards(
  lookup: LookupMaps,
  routeNodes: (RouteNode | BackendRouteNode)[],
  repoPath: string,
  project: Project
): CodeEdge[] {
  const edges: CodeEdge[] = [];

  // Find middleware file — could be at root or inside src/
  const possiblePaths = [
    path.join(repoPath, "middleware.ts"),
    path.join(repoPath, "middleware.js"),
    path.join(repoPath, "src", "middleware.ts"),
    path.join(repoPath, "src", "middleware.js"),
  ];

  const middlewarePath = possiblePaths.find((p) => fs.existsSync(p));
  if (!middlewarePath) return edges;

  // Find the middleware node in our extracted nodes.
  // nodesByFile is now keyed by relative forward-slash paths (same as node.filePath).
  const relativeMiddlewarePath = path.relative(repoPath, middlewarePath).replace(/\\/g, "/");
  const middlewareNodes = lookup.nodesByFile.get(relativeMiddlewarePath);
  if (!middlewareNodes || middlewareNodes.length === 0) return edges;

  // Use the first node from middleware file as the source
  const middlewareNode = middlewareNodes[0];

  // Open middleware file with ts-morph
  const sourceFile = project.getSourceFile(middlewarePath);
  if (!sourceFile) return edges;

  // Find the config variable declaration
  // export const config = { matcher: [...] }
  const configVariable = sourceFile
    .getVariableDeclarations()
    .find((v) => v.getName() === "config");

  if (!configVariable) return edges;

  const initializer = configVariable.getInitializer();
  if (!initializer) return edges;

  // Find the matcher array inside config object
  const objLiteral = initializer.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!objLiteral) return edges;

  for (const prop of objLiteral.getProperties()) {
    const propName = (prop as any).getName?.();
    if (propName !== "matcher") continue;

    const propInitializer = (prop as any).getInitializer?.();
    if (!propInitializer) continue;

    // matcher can be a single string or an array
    // matcher: '/dashboard'
    // matcher: ['/dashboard', '/admin']
    const patterns: string[] = [];

    if (propInitializer.getKind() === SyntaxKind.StringLiteral) {
      // Single string pattern
      patterns.push(
        propInitializer.getText().replace(/^['"`]|['"`]$/g, "")
      );
    } else if (
      propInitializer.getKind() === SyntaxKind.ArrayLiteralExpression
    ) {
      // Array of patterns
      const arrayLiteral = propInitializer.asKind(
        SyntaxKind.ArrayLiteralExpression
      );
      if (!arrayLiteral) continue;

      for (const element of arrayLiteral.getElements()) {
        const text = element.getText().replace(/^['"`]|['"`]$/g, "");
        patterns.push(text);
      }
    }

    // For each pattern find matching route nodes
    for (const pattern of patterns) {
      const basePath = cleanMatcherPattern(pattern);

      for (const routeNode of routeNodes) {
        if (routeNode.type === "MIDDLEWARE") continue;

        if (routeMatchesPattern(routeNode.urlPath, basePath)) {
          edges.push({
            from: middlewareNode.id,
            to: routeNode.urlPath,
            type: "GUARDS",
            metadata: {
              pattern,
              guardedPath: routeNode.urlPath,
            },
          });
        }
      }
    }
  }

  return edges;
}

// ─── Express/Fastify/Koa Guard Detection ──────────────────────────────────────

function detectBackendGuards(
  lookup: LookupMaps,
  routeNodes: (RouteNode | BackendRouteNode)[],
  project: Project
): CodeEdge[] {
  const edges: CodeEdge[] = [];

  // Only look at backend route nodes
  const backendRoutes = routeNodes.filter(
    (r) => r.type === "BACKEND_ROUTE"
  ) as BackendRouteNode[];

  for (const file of project.getSourceFiles()) {
    const callExpressions = file.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const call of callExpressions) {
      const expressionText = call.getExpression().getText();

      // Only look for app.use() / router.use() calls
      if (!expressionText.endsWith(".use")) continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      let guardPath = "/";         // default — guards all routes
      let middlewareName: string | undefined;

      if (args.length === 1) {
        // app.use(middlewareName) — no path, guards all routes
        const argText = args[0].getText();
        if (
          !argText.includes("=>") &&
          !argText.includes("function") &&
          /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(argText)
        ) {
          middlewareName = argText;
        }
      } else if (args.length >= 2) {
        // app.use('/admin', middlewareName)
        const firstArgText = args[0].getText();

        // First arg must be a string path
        if (
          firstArgText.startsWith("'") ||
          firstArgText.startsWith('"') ||
          firstArgText.startsWith("`")
        ) {
          guardPath = firstArgText.replace(/^['"`]|['"`]$/g, "");

          // Last arg is the middleware function
          const lastArgText = args[args.length - 1].getText();
          if (
            !lastArgText.includes("=>") &&
            !lastArgText.includes("function") &&
            /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lastArgText)
          ) {
            middlewareName = lastArgText;
          }
        }
      }

      if (!middlewareName) continue;

      // Look up middleware in our extracted nodes
      const middlewareNodes = lookup.nodesByName.get(middlewareName);
      if (!middlewareNodes || middlewareNodes.length === 0) continue;

      const middlewareNode = middlewareNodes[0];

      // Find matching backend routes
      for (const route of backendRoutes) {
        if (routeMatchesPattern(route.urlPath, guardPath)) {
          edges.push({
            from: middlewareNode.id,
            to: route.urlPath,
            type: "GUARDS",
            metadata: {
              guardedPath: route.urlPath,
              httpMethod: route.httpMethod,
            },
          });
        }
      }
    }
  }

  return edges;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function detectGuardEdges(
  nodes: CodeNode[],
  lookup: LookupMaps,
  routeNodes: (RouteNode | BackendRouteNode)[],
  repoPath: string,
  fingerprint: ProjectFingerprint
): CodeEdge[] {

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

  const edges: CodeEdge[] = [];

  // Next.js — middleware.ts with matcher config
  if (
    fingerprint.framework === "nextjs" ||
    fingerprint.projectType === "fullstack"
  ) {
    edges.push(
      ...detectNextjsGuards(lookup, routeNodes, repoPath, project)
    );
  }

  // Express / Fastify / Koa — app.use() calls
  if (
    fingerprint.framework === "express" ||
    fingerprint.framework === "fastify" ||
    fingerprint.framework === "koa" ||
    fingerprint.projectType === "fullstack"
  ) {
    edges.push(
      ...detectBackendGuards(lookup, routeNodes, project)
    );
  }

  return edges;
}