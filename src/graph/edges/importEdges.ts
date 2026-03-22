import path from "path";
import fs from "fs";
import { CodeEdge, CodeNode } from "../../types";
import { LookupMaps } from "../buildLookup";
import { Project } from "ts-morph";

// Aliases we consider as local imports
const LOCAL_PREFIXES = ["./", "../", "@/", "~/", "#/"];

// Check if an import is local (not third party)
export function isLocalImport(importPath: string) {
    return LOCAL_PREFIXES.some(prefix => importPath.startsWith(prefix));
}

//Get config file path - tsconfig first, jsconfig as fallback
function getConfigPath(repoPath: string): string | undefined {
    const tsconfig = path.join(repoPath, "tsconfig.json");
    const jsconfig = path.join(repoPath, "jsconfig.json");
    if (fs.existsSync(tsconfig)) return tsconfig;
    if (fs.existsSync(jsconfig)) return jsconfig;
    return undefined;
}


// Recursively walk directory and add files to project
// Same approach as parser — reliable on Windows
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



export function detectImportEdges(lookupMp: LookupMaps, repoPath: string): CodeEdge[] {
    const edges: CodeEdge[] = [];
    const createdEdges = new Set<string>();

    const configPath = getConfigPath(repoPath);
    const project = configPath
      ? new Project({ tsConfigFilePath: configPath, skipAddingFilesFromTsConfig: true })
      : new Project({
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
        const absFilePath = file.getFilePath();
        const sourceRelative = path.relative(repoPath, absFilePath).replace(/\\/g, "/");
        const sourceFileNode = lookupMp.fileNodesByPath.get(sourceRelative);
        if (!sourceFileNode) continue;

        const importDeclarations = file.getImportDeclarations();

        for (const importDecl of importDeclarations) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            if (!isLocalImport(moduleSpecifier)) continue;

            // ─── Resolve the imported file path ───────────────────────────
            let resolvedPath: string | undefined;

            // First try ts-morph automatic resolution
            // Works when tsconfig/jsconfig exists
            const resolvedFile = importDecl.getModuleSpecifierSourceFile();
            if (resolvedFile) {
                resolvedPath = resolvedFile.getFilePath();
            } else {
                // Fallback — manually resolve relative and alias paths
                // Used when no tsconfig exists (e.g. in tests)
                const currentDir = path.dirname(absFilePath);
                let basePath = moduleSpecifier;

                // Handle @/ ~/ #/ aliases → resolve to src/
                if (
                    moduleSpecifier.startsWith("@/") ||
                    moduleSpecifier.startsWith("~/") ||
                    moduleSpecifier.startsWith("#/")
                ) {
                    basePath = path.join(repoPath, "src", moduleSpecifier.slice(2));
                } else {
                    // Relative import — resolve from current file's directory
                    basePath = path.join(currentDir, moduleSpecifier);
                }

                // Try all possible extensions and index file patterns
                const candidates = [
                    basePath,
                    basePath + ".ts",
                    basePath + ".tsx",
                    basePath + ".js",
                    basePath + ".jsx",
                    path.join(basePath, "index.ts"),
                    path.join(basePath, "index.tsx"),
                    path.join(basePath, "index.js"),
                    path.join(basePath, "index.jsx"),
                ];

                resolvedPath = candidates.find((c) => fs.existsSync(c));
            }

            if (!resolvedPath) continue;

            const targetRelative = path.relative(repoPath, resolvedPath).replace(/\\/g, "/");
            const targetFileNode = lookupMp.fileNodesByPath.get(targetRelative);
            if (!targetFileNode) continue;

            const edgeKey = `${sourceFileNode.id}→${targetFileNode.id}`;
            if (createdEdges.has(edgeKey)) continue;
            createdEdges.add(edgeKey);

            edges.push({
                from: sourceFileNode.id,
                to: targetFileNode.id,
                type: "IMPORTS",
                metadata: { importPath: moduleSpecifier },
            });
        }
    }

    return edges;
}