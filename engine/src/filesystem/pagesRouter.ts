import fs from "fs";
import path from "path";
import type { RouteNode, RouteNodeType } from "../types";

// Converts a filesystem path to a URL path
// e.g. users/[userId]/posts → /users/:userId/posts
function toUrlPath(relativePath: string): string {
  if (relativePath === "index") return "/";
  
  return (
    "/" +
    relativePath
      .split(path.sep)
      .map((segment) => {
        // Remove file extension from last segment
        segment = segment.replace(/\.(tsx|ts|jsx|js)$/, "");
        
        if (segment === "index") return null;
        
        if (segment.startsWith("[...") && segment.endsWith("]")) {
          const param = segment.slice(4, -1);
          return `:${param}*`;
        }
        if (segment.startsWith("[") && segment.endsWith("]")) {
          const param = segment.slice(1, -1);
          return `:${param}`;
        }
        return segment;
      })
      .filter(Boolean)
      .join("/")
  );
}

// Extracts param names from a url path
function extractParams(urlPath: string): string[] {
  const matches = urlPath.match(/:([a-zA-Z]+)\*?/g) || [];
  return matches.map((m) => m.replace(":", "").replace("*", ""));
}

// Checks if a file is a valid page file
function isPageFile(fileName: string): boolean {
  return /\.(tsx|ts|jsx|js)$/.test(fileName);
}

// Checks if a file is a special Next.js file to skip
function isSpecialFile(fileName: string): boolean {
  const special = ["_app", "_document", "_error", "_middleware"];
  const nameWithoutExt = fileName.replace(/\.(tsx|ts|jsx|js)$/, "");
  return special.includes(nameWithoutExt);
}

// Determines node type based on file location
function getRouteNodeType(
  relativePath: string,
  fileName: string
): RouteNodeType {
  const nameWithoutExt = fileName.replace(/\.(tsx|ts|jsx|js)$/, "");
  
  // Files inside pages/api are API routes
  if (relativePath.startsWith("api" + path.sep) || relativePath === "api") {
    return "API_ROUTE";
  }
  
  if (nameWithoutExt === "404") return "NOT_FOUND";
  
  return "PAGE";
}

function walkPagesDir(
  currentDir: string,
  pagesDir: string,
  nodes: RouteNode[]
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      walkPagesDir(fullPath, pagesDir, nodes);
      continue;
    }

    // Skip non page files
    if (!isPageFile(entry.name)) continue;

    // Skip special Next.js files like _app.tsx, _document.tsx
    if (isSpecialFile(entry.name)) continue;

    const relativePath = path.relative(pagesDir, fullPath);
    const nodeType = getRouteNodeType(
      path.relative(pagesDir, currentDir),
      entry.name
    );
    const urlPath = toUrlPath(relativePath);
    const params = extractParams(urlPath);

    nodes.push({
      type: nodeType,
      urlPath,
      filePath: fullPath,
      isDynamic: params.length > 0,
      isCatchAll: urlPath.includes("*"),
      isGroupRoute: false, // pages router has no route groups
      params: params.length > 0 ? params : undefined,
    });
  }
}

export function analyzePagesRouter(repoPath: string): RouteNode[] {
  let pagesDir = path.join(repoPath, "src/pages");
  if (!fs.existsSync(pagesDir)) {
    pagesDir = path.join(repoPath, "pages");
  }
  if (!fs.existsSync(pagesDir)) {
    throw new Error(`No pages directory found at: ${pagesDir}`);
  }

  const nodes: RouteNode[] = [];

  // Check for middleware at root level
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

  walkPagesDir(pagesDir, pagesDir, nodes);
  return nodes;
}