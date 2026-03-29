import fs from "fs";
import path from "path";
import { Project, SyntaxKind } from "ts-morph";
import { CodeEdge, CodeNode } from "../../types";
import { LookupMaps } from "../buildLookup";

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


export function detectPropEdges(nodes: CodeNode[], lookupMp: LookupMaps, repoPath: string): CodeEdge[] {
    const edges: CodeEdge[] = [];

    // Track created edges for deduplication
    // Key: "fromId→toId" — value: index in edges array
    // So we can update renderCount on duplicates
    const edgeIndex = new Map<string, number>();

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

    const componentNodes = nodes.filter(n => n.type === "COMPONENT");

    for (const component of componentNodes) {
        const absPath = path.resolve(repoPath, component.filePath).replace(/\\/g, "/");
        const sourceFile = project.getSourceFile(absPath);
        if (!sourceFile) continue;

        // Find the specific function/component declaration by name and line range
        // Only scan JSX within this component's body — not the whole file
        const allFunctions = [
            ...sourceFile.getFunctions(),
            ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
            ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression),
        ];

        // Find the function that matches this component by name and line range
        const componentFn = allFunctions.find(fn => {
            const start = fn.getStartLineNumber();
            const end = fn.getEndLineNumber();
            return (
                component.startLine >= start &&
                component.endLine <= end &&
                // For named functions, also check name matches
                (fn.getKind() !== SyntaxKind.FunctionDeclaration ||
                    (fn as any).getName?.() === component.name)
            );
        });

        // Only scan JSX within this component's scope
        const scanTarget = componentFn ?? sourceFile;

        const jsxOpeningElements = scanTarget.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
        const jsxSelfClosingElements = scanTarget.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);

        const allJsxElements = [...jsxOpeningElements, ...jsxSelfClosingElements];

        for (const jsxElement of allJsxElements) {
            const tagName = jsxElement.getTagNameNode().getText();
            // Skip HTML native elements — they start with lowercase
            if (/^[a-z]/.test(tagName)) continue;

            const targetNodes = lookupMp.nodesByName.get(tagName);
            if (!targetNodes || targetNodes.length === 0) continue; // this means that this is not a component we extracted

            //Extract prop names passed to the component
            const attributes = jsxElement.getAttributes();
            const props: string[] = [];
            for (const attr of attributes) {
                // Regular prop: user={currentUser} or disabled
                // Spread prop: {...props} — we skip these
                if (attr.getKind() === SyntaxKind.JsxAttribute) {
                    const propName = attr.getFirstChild()?.getText();
                    if (propName) props.push(propName);
                }
            }

            //here we create the edge to each matching target component
            for (const targetNode of targetNodes) {
                if (targetNode.id === component.id) continue; //skip self referencing

                const edgeKey = `${component.id}→${targetNode.id}`;
                if (edgeIndex.has(edgeKey)) {
                    // Edge already exists — update renderCount
                    const idx = edgeIndex.get(edgeKey)!;
                    const existing = edges[idx];
                    const currentCount = existing.metadata?.renderCount as number ?? 1;
                    edges[idx] = {
                        ...existing,
                        metadata: {
                            ...existing.metadata,
                            renderCount: currentCount + 1,
                        },
                    };
                } else {
                    // create new edge
                    const newEdge: CodeEdge = {
                        from: component.id,
                        to: targetNode.id,
                        type: "PROP_PASS",
                        metadata: {
                            props,
                            renderCount: 1,
                        }
                    };
                    edgeIndex.set(edgeKey, edges.length);
                    edges.push(newEdge);
                }
            }
        }
    }
    return edges;
}