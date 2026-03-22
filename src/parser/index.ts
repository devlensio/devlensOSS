import { Project } from "ts-morph";
import path from "path";
import fs from "fs";
import { CodeNode } from "../types";
import { extractComponents } from "./extractors/components";
import { extractHooks } from "./extractors/hooks";
import { extractFunctions } from "./extractors/functions";
import { extractStores } from "./extractors/stores";
import { createHash } from "crypto";

// Directories to skip entirely while walking
const IGNORE_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "migrations",
  ".git",
];

// File patterns to skip
function shouldIgnoreFile(fileName: string): boolean {
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName)) return true;
  if (/\.stories\.(ts|tsx|js|jsx)$/.test(fileName)) return true;
  if (/\.d\.ts$/.test(fileName)) return true;
  if (/\.config\.(ts|js)$/.test(fileName)) return true;
  return false;
}

// Recursively walks directory and adds valid source files to the project
function addFilesRecursively(dir: string, project: Project): void {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // If we can't read a directory just skip it
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip ignored directories immediately
      if (IGNORE_DIRS.includes(entry.name)) continue;
      addFilesRecursively(fullPath, project);
    } else if (entry.isFile()) {
      // Only process source files
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      // Skip ignored file patterns
      if (shouldIgnoreFile(entry.name)) continue;
      project.addSourceFileAtPath(fullPath);
    }
  }
}

export interface ParserResult {
  nodes: CodeNode[];
  stats: {
    totalFiles: number;
    totalNodes: number;
    componentCount: number;
    hookCount: number;
    functionCount: number;
    storeCount: number;
    skippedFiles: number;
  };
}

export function parseRepo(repoPath: string): ParserResult {
  // Set up ts-morph project
  const project = new Project({
    compilerOptions: {
      allowJs: true,    // support plain JS files
      checkJs: false,   // don't type check JS, just parse
      jsx: 4,           // support JSX (4 = React)
      strict: false,    // don't enforce strict mode on user's code
    },
    skipAddingFilesFromTsConfig: true,
  });

  // Walk directory and add files manually
  // This approach works reliably on all platforms including Windows
  addFilesRecursively(repoPath, project);

  const sourceFiles = project.getSourceFiles();
  const allNodes: CodeNode[] = [];
  let skippedFiles = 0;


  for (const file of sourceFiles) {
    try {
      const absFilePath = file.getFilePath();
      const relativePath = path.relative(repoPath, absFilePath).replace(/\\/g, "/");

      // One FILE node per source file — represents the file itself in the graph
      const fileNode: CodeNode = {
        id: `file::${relativePath}`,
        name: path.basename(relativePath),
        type: "FILE",
        filePath: relativePath,
        startLine: 1,
        endLine: file.getEndLineNumber(),
        parentFile: `file::${relativePath}`,  //there is no parent file for file type node
        metadata: {
          nodeCount: 0,
          childNodeIds: [],
          language: absFilePath.endsWith('.ts') || absFilePath.endsWith('.tsx') ? 'typescript' :
                    absFilePath.endsWith('.js') || absFilePath.endsWith('.jsx') ? 'javascript' : 'unknown',
        },
      };

      const components = extractComponents(file);
      const hooks = extractHooks(file);
      const functions = extractFunctions(file);
      const stores = extractStores(file);

      const extracted = [...components, ...hooks, ...functions, ...stores];
      
      for (const node of extracted) {
        // Normalize all extracted nodes to relative paths so every node in the
        // graph uses the same coordinate system as the FILE nodes.
        // Extractors store absolute ts-morph paths; we rewrite them here.
        node.filePath = relativePath;
        node.id = `${relativePath}::${node.name}`;
        node.parentFile = `file::${relativePath}`;
        if(node.rawCode){
          node.codeHash = createHash("sha256").update(node.rawCode).digest("hex").slice(0, 16);
        }
      }
      fileNode.metadata.nodeCount = extracted.length;
      fileNode.metadata.childNodeIds = extracted.map(n => n.id);
      // File node hash — based on all child code combined
      const fileRawCode = extracted.map(n => n.rawCode ?? "").join("\n");
      if (fileRawCode.trim()) {
        fileNode.codeHash = createHash("sha256").update(fileRawCode).digest("hex").slice(0, 16);
      }

      allNodes.push(fileNode, ...extracted);
    } catch (error) {
      // Never let one bad file break the entire analysis
      console.warn(`Skipped file due to error: ${file.getFilePath()}`);
      skippedFiles++;
    }
  }

  const componentCount = allNodes.filter((n) => n.type === "COMPONENT").length;
  const hookCount = allNodes.filter((n) => n.type === "HOOK").length;
  const functionCount = allNodes.filter((n) => n.type === "FUNCTION").length;
  const storeCount = allNodes.filter((n) => n.type === "STATE_STORE").length;

  return {
    nodes: allNodes,
    stats: {
      totalFiles: sourceFiles.length,
      totalNodes: allNodes.length,
      componentCount,
      hookCount,
      functionCount,
      storeCount,
      skippedFiles,
    },
  };
}