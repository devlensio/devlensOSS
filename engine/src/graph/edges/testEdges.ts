//This file will detect the TEST edges from the test/story files to the components they are testing. 

import path from "path";
import type { CodeEdge } from "../../types";
import type { LookupMaps } from "../buildLookup";
import fs from "fs";
import { Project } from "ts-morph";
import { isLocalImport } from "./importEdges";


function getConfigPath(repoPath: string): string | undefined {
    const tsConfig = path.join(repoPath, "tsconfig.json");
    const jsconfig = path.join(repoPath, "jsconfig.json");
    if (fs.existsSync(tsConfig)) return tsConfig;
    if (fs.existsSync(jsconfig)) return jsconfig;
    return undefined;
}

function addFilesRecursively(dir: string, project: Project): void {
    const IGNORE_DIRS = ["node_modules", "dist", "build", ".next", "coverage", ".git"];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORE_DIRS.includes(entry.name)) continue;
            addFilesRecursively(path.join(dir, entry.name), project);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            project.addSourceFileAtPath(path.join(dir, entry.name));
        }
    }
}

function resolveAlias(
    moduleSpecifier: string,
    repoPath: string,
    currentDir: string,
): string {
    // Try to read tsconfig paths
    const tsconfigPath = path.join(repoPath, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
        try {
            const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
            const paths = tsconfig.compilerOptions?.paths ?? {};
            const baseUrl = tsconfig.compilerOptions?.baseUrl ?? ".";
            const base = path.join(repoPath, baseUrl);

            // Check each alias — e.g. "@/*": ["./src/*"]
            for (const [alias, targets] of Object.entries(paths)) {
                const aliasPrefix = alias.replace("/*", "/");
                if (moduleSpecifier.startsWith(aliasPrefix)) {
                    const rest = moduleSpecifier.slice(aliasPrefix.length);
                    const target = (targets as string[])[0].replace("/*", "");
                    return path.join(base, target, rest);
                }
            }
        } catch {
            // malformed tsconfig — fall through
        }
    }

    // Fallback — relative import
    return path.join(currentDir, moduleSpecifier);
}


// ─── detectTestEdges ──────────────────────────────────────────────────────────
//
// Creates TESTS edges from TEST/STORY file nodes to the actual component/
// function/hook nodes they import from production code.
//
// Resolution strategy:
//   1. Find all TEST and STORY file nodes
//   2. For each, read its import declarations via ts-morph
//   3. Resolve each named import to its target file
//   4. Look up the named export in nodesByFile to find the exact node
//   5. Create TESTS edge: testNode → TESTS → productionNode

export function detectTestEdges(lookup: LookupMaps, repoPath: string): CodeEdge[] {
    const edges: CodeEdge[] = [];
    const createdEdges = new Set<string>();

    //filter all TEST and STORY file nodes
    const testFileNodes = [...lookup.fileNodesByPath.values()].filter(
        n => ["TEST", "STORY"].includes(n.type)
    );

    if (testFileNodes.length === 0) return edges;

    //setup ts-morph project for import resolution
    const configPath = getConfigPath(repoPath);
    const project = configPath
        ? new Project({
            tsConfigFilePath: configPath,
            skipAddingFilesFromTsConfig: true,    // we do not want it to consider node modules or other unwanted files. So we manually walk down the repo.
        })
        : new Project({ skipAddingFilesFromTsConfig: true });


    addFilesRecursively(repoPath, project);

    for (const testNode of testFileNodes) {
        const absFilePath = path.join(repoPath, testNode.filePath);
        const sourceFile = project.getSourceFile(absFilePath);
        if (!sourceFile) continue;

        const importDecls = sourceFile.getImportDeclarations();

        for (const importDecl of importDecls) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            if (!isLocalImport(moduleSpecifier)) continue;    // we are not considering third party or library imports.

            let resolvedPath: string | undefined;

            const resolvedFile = importDecl.getModuleSpecifierSourceFile();
            if (resolvedFile) {
                resolvedPath = resolvedFile.getFilePath();
            } else {
                //This code block will rarely hit because ts-morph will handlethe resolvedFile from the project
                const currentDir = path.dirname(absFilePath);
                let basePath = resolveAlias(moduleSpecifier, repoPath, currentDir);

                const candidates = [
                    basePath,
                    basePath + ".ts", basePath + ".tsx",
                    basePath + ".js", basePath + ".jsx",
                    path.join(basePath, "index.ts"),
                    path.join(basePath, "index.tsx"),
                ];
                resolvedPath = candidates.find(c => fs.existsSync(c));
            }


            if (!resolvedPath) continue;

            const targetRelative = path.relative(repoPath, resolvedPath).replace(/\\/g, "/");

            // Get named imports — { Button } from "./Button"
            const namedImports = importDecl.getNamedImports();

            for (const namedImport of namedImports) {
                const importedName = namedImport.getName();

                // Find the actual production node by name in the target file
                const nodesInFile = lookup.nodesByFile.get(targetRelative) ?? [];
                const targetNode = nodesInFile.find(n => n.name === importedName);

                if (!targetNode) continue;

                // Skip if target is also a TEST/STORY node — test importing test
                if (targetNode.type === "TEST" || targetNode.type === "STORY") continue;

                const edgeKey = `${testNode.id}→${targetNode.id}`;
                if (createdEdges.has(edgeKey)) continue;

                createdEdges.add(edgeKey);

                edges.push({
                    from: testNode.id,
                    to: targetNode.id,
                    type: "TESTS",
                    metadata: {
                        importPath: moduleSpecifier,
                        testFileType: testNode.type,
                    },
                });
            }
        }
    }

    console.log(`  TESTS edges: ${edges.length}`);
    return edges;
}