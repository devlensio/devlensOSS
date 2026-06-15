import path from "path";
import fs from "fs";
import type { CodeEdge, CodeNode } from "../../types";
import type { LookupMaps } from "../buildLookup";
import { extractPackageName } from "../thirdPartyLibs";
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

export interface ImportEdgeResult {
    edges: CodeEdge[];
    // Dynamically-created per-method THIRD_PARTY nodes (one per unique named import).
    // Collected here so the pipeline can add them to allNodes before rendering.
    thirdPartyMethodNodes: CodeNode[];
}

export function detectImportEdges(lookupMp: LookupMaps, repoPath: string): ImportEdgeResult {
    const edges: CodeEdge[] = [];
    const createdEdges = new Set<string>();

    // Dedup method nodes across all files — same named import in multiple files
    // produces only ONE node (e.g. a single [npm]/react::useState node).
    const methodNodesMap = new Map<string, CodeNode>();

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

            if (!isLocalImport(moduleSpecifier)) {
                // ─── Third-party import ───────────────────────────────────
                const pkgName        = extractPackageName(moduleSpecifier);
                const thirdPartyNode = lookupMp.thirdPartyNodesByName.get(pkgName);

                if (thirdPartyNode) {
                    const fileAliasMap = lookupMp.thirdPartyImportAliases.get(sourceRelative) ?? new Map<string, string>();

                    // ── Named imports → one method node per imported name ──────
                    // e.g. import { useState, useEffect } from 'react'
                    //   → nodes [npm]/react::useState, [npm]/react::useEffect
                    //   → fileAliasMap: "useState" → "[npm]/react::useState"
                    for (const specifier of importDecl.getNamedImports()) {
                        const localAlias   = specifier.getAliasNode()?.getText() ?? specifier.getName();
                        const importedName = specifier.getName();

                        const methodNodeId = `[npm]/${pkgName}::${importedName}`;

                        if (!methodNodesMap.has(methodNodeId)) {
                            methodNodesMap.set(methodNodeId, {
                                id:        methodNodeId,
                                name:      `${pkgName}.${importedName}`,
                                type:      "THIRD_PARTY",
                                filePath:  `[npm]/${pkgName}`,
                                startLine: 0,
                                endLine:   0,
                                rawCode:   undefined,
                                codeHash:  undefined,
                                metadata: {
                                    isThirdParty:    true,
                                    packageVersion:  thirdPartyNode.metadata.packageVersion,
                                    category:        thirdPartyNode.metadata.category,
                                    parentPackageId: thirdPartyNode.id,
                                    methodName:      importedName,
                                },
                            });
                        }

                        // Map the local alias to the method node so callEdges can resolve it
                        fileAliasMap.set(localAlias, methodNodeId);

                        // IMPORTS edge: source file → method node
                        const edgeKey = `${sourceFileNode.id}→${methodNodeId}:IMPORTS`;
                        if (!createdEdges.has(edgeKey)) {
                            createdEdges.add(edgeKey);
                            edges.push({
                                from: sourceFileNode.id,
                                to:   methodNodeId,
                                type: "IMPORTS",
                                metadata: { importPath: moduleSpecifier, isThirdParty: true, importedName },
                            });
                        }
                    }

                    // ── Default import → package node ─────────────────────────
                    // e.g. import axios from 'axios'
                    //   → fileAliasMap: "axios" → "[npm]/axios"
                    //   Method nodes for member-access calls (axios.get) are created
                    //   lazily in callEdges.ts when the actual calls are encountered.
                    const defaultImport = importDecl.getDefaultImport();
                    if (defaultImport) {
                        fileAliasMap.set(defaultImport.getText(), thirdPartyNode.id);

                        const edgeKey = `${sourceFileNode.id}→${thirdPartyNode.id}:IMPORTS`;
                        if (!createdEdges.has(edgeKey)) {
                            createdEdges.add(edgeKey);
                            edges.push({
                                from: sourceFileNode.id,
                                to:   thirdPartyNode.id,
                                type: "IMPORTS",
                                metadata: { importPath: moduleSpecifier, isThirdParty: true },
                            });
                        }
                    }

                    // ── Namespace import → package node ───────────────────────
                    // e.g. import * as ReactQuery from '@tanstack/react-query'
                    //   → fileAliasMap: "ReactQuery" → "[npm]/@tanstack/react-query"
                    const namespaceImport = importDecl.getNamespaceImport();
                    if (namespaceImport) {
                        fileAliasMap.set(namespaceImport.getText(), thirdPartyNode.id);

                        const edgeKey = `${sourceFileNode.id}→${thirdPartyNode.id}:IMPORTS`;
                        if (!createdEdges.has(edgeKey)) {
                            createdEdges.add(edgeKey);
                            edges.push({
                                from: sourceFileNode.id,
                                to:   thirdPartyNode.id,
                                type: "IMPORTS",
                                metadata: { importPath: moduleSpecifier, isThirdParty: true },
                            });
                        }
                    }

                    lookupMp.thirdPartyImportAliases.set(sourceRelative, fileAliasMap);
                }
                continue; // always skip local-resolution path for non-local imports
            }

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

    return { edges, thirdPartyMethodNodes: [...methodNodesMap.values()] };
}
