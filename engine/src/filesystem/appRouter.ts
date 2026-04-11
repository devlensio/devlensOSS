import fs from "fs";
import path from "path";
import type { RouteNode, RouteNodeType } from "../types";

// Converts a filesystem path to a URL path
// e.g. /users/[userId]/posts → /users/:userId/posts
function toUrlPath(relativePath: string): string {
  return (
    "/" +
    relativePath
      .split(path.sep)
      .map((segment) => {
        if (segment.startsWith("[...") && segment.endsWith("]")) {
          // Catch-all: [...slug] → :slug*
          const param = segment.slice(4, -1);
          return `:${param}*`;
        }
        if (segment.startsWith("[") && segment.endsWith("]")) {
          // Dynamic: [userId] → :userId
          const param = segment.slice(1, -1);
          return `:${param}`;
        }
        if (segment.startsWith("(") && segment.endsWith(")")) {
          // Route group: (auth) → ignored in URL
          return null;
        }
        return segment;
      })
      .filter(Boolean)
      .join("/")
  );
}

// Extracts param names from a url path
// e.g. /users/:userId/posts/:postId → ["userId", "postId"]
function extractParams(urlPath: string): string[] {
  const matches = urlPath.match(/:([a-zA-Z]+)\*?/g) || [];
  return matches.map((m) => m.replace(":", "").replace("*", ""));
}

// Determines the RouteNodeType from a filename
function getRouteNodeType(fileName: string): RouteNodeType | null {
  if (fileName === "page.tsx" || fileName === "page.ts" || fileName === "page.jsx" || fileName === "page.js") return "PAGE";
  if (fileName === "layout.tsx" || fileName === "layout.ts" || fileName === "layout.jsx" || fileName === "layout.js") return "LAYOUT";
  if (fileName === "loading.tsx" || fileName === "loading.ts") return "LOADING";
  if (fileName === "error.tsx" || fileName === "error.ts") return "ERROR";
  if (fileName === "not-found.tsx" || fileName === "not-found.ts") return "NOT_FOUND";
  if (fileName === "route.ts" || fileName === "route.js") return "API_ROUTE";
  return null;
}

// Finds the closest layout file that wraps a given route
function findLayoutPath(filePath: string, appDir: string): string | undefined {
  let dir = path.dirname(filePath);
  while (dir !== appDir && dir !== path.dirname(appDir)) {
    const layout = ["layout.tsx", "layout.ts", "layout.jsx", "layout.js"]
      .map((f) => path.join(dir, f))
      .find((f) => fs.existsSync(f));
    if (layout) return layout;
    dir = path.dirname(dir);
  }
  return undefined;
}

// Recursively walks the app directory and collects all route nodes
function walkAppDir(
  currentDir: string,
  appDir: string,
  nodes: RouteNode[]
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      walkAppDir(fullPath, appDir, nodes);
      continue;
    }

    const nodeType = getRouteNodeType(entry.name);
    if (!nodeType) continue;

    // Get path relative to app directory
    const relativePath = path.relative(appDir, path.dirname(fullPath));
    const urlPath = relativePath === "." ? "/" : toUrlPath(relativePath);
    const params = extractParams(urlPath);
    const isDynamic = params.length > 0;
    const isCatchAll = urlPath.includes("*");
    const isGroupRoute = path
      .dirname(fullPath)
      .split(path.sep)
      .some((s) => s.startsWith("(") && s.endsWith(")"));

    const layoutPath =
      nodeType === "PAGE"
        ? findLayoutPath(fullPath, appDir)
        : undefined;

    nodes.push({
      type: nodeType,
      urlPath,
      filePath: fullPath,
      isDynamic,
      isCatchAll,
      isGroupRoute,
      layoutPath,
      params: params.length > 0 ? params : undefined,
    });
  }
}

export function analyzeAppRouter(repoPath: string): RouteNode[] {
  let appDir = path.join(repoPath, "src/app");
  if (!fs.existsSync(appDir)) {
    appDir = path.join(repoPath, "app");
  }
  if (!fs.existsSync(appDir)) {
    throw new Error(`No app directory found at: ${appDir}`);
  }

  // Check for middleware at root level
  const nodes: RouteNode[] = [];
  const middlewarePath = ["middleware.ts", "middleware.js"]
    .map((f) => path.join(repoPath, f))
    .find((f) => fs.existsSync(f));

  if (middlewarePath) {
    nodes.push({
      type: "MIDDLEWARE",
      urlPath: "*",
      filePath: middlewarePath,
      isDynamic: false,
      isCatchAll: true,
      isGroupRoute: false,
    });
  }

  walkAppDir(appDir, appDir, nodes);
  return nodes;
}