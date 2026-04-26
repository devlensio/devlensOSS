import { Project, SyntaxKind } from "ts-morph";
import path from "path";
import fs from "fs";
import type { BackendRouteNode, BackendFramework } from "../types";

const HTTP_METHODS = [
  "get", "post", "put", "delete",
  "patch", "options", "head",
];

const APP_INSTANCE_NAMES = [
  "app", "router", "fastify",
  "server", "api", "koa",
];

const IGNORE_DIRS = [
  "node_modules", "dist", "build",
  ".next", "coverage", ".git",
];

function extractParams(urlPath: string): string[] {
  const matches = urlPath.match(/:([a-zA-Z0-9_]+)/g) || [];
  return matches.map((m) => m.replace(":", ""));
}

function normalizeMethod(method: string): string {
  return method.toUpperCase(); 
}

// Detects backend framework from file import statements
function detectFileFramework(
  fileContent: string
): BackendFramework | null {
  if (
    fileContent.includes("from 'express'") ||
    fileContent.includes('from "express"') ||
    fileContent.includes("require('express')") ||
    fileContent.includes('require("express")')
  ) return "express";

  if (
    fileContent.includes("from 'fastify'") ||
    fileContent.includes('from "fastify"') ||
    fileContent.includes("require('fastify')") ||
    fileContent.includes('require("fastify")')
  ) return "fastify";

  if (
    fileContent.includes("from 'koa'") ||
    fileContent.includes('from "koa"') ||
    fileContent.includes("require('koa')") ||
    fileContent.includes('require("koa")')
  ) return "koa";

  return null;
}

function findBackendFiles(dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      findBackendFiles(fullPath, files);
    } else if (entry.isFile()) {
      if (/\.(ts|js)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

export function analyzeBackendRoutes(repoPath: string): BackendRouteNode[] {
  const nodes: BackendRouteNode[] = [];

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      strict: false,
    },
    skipAddingFilesFromTsConfig: true,
  });

  const files = findBackendFiles(repoPath);

  // Only add files that actually import a backend framework
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    if (detectFileFramework(content)) {
      project.addSourceFileAtPath(filePath);
    }
  }

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath();
    const content = fs.readFileSync(filePath, "utf-8");
    const framework = detectFileFramework(content);
    if (!framework) continue;

    const callExpressions = file.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const call of callExpressions) {
      try {
        const expression = call.getExpression();
        const expressionText = expression.getText();

        const parts = expressionText.split(".");
        if (parts.length < 2) continue;

        const methodName = parts[parts.length - 1].toLowerCase();
        const objectName = parts[parts.length - 2].toLowerCase();

        if (!HTTP_METHODS.includes(methodName)) continue;

        const isKnownInstance = APP_INSTANCE_NAMES.includes(objectName);
        const looksLikeRouter =
          objectName.includes("router") ||
          objectName.includes("app") ||
          objectName.includes("server") ||
          objectName.includes("api");

        if (!isKnownInstance && !looksLikeRouter) continue;

        const args = call.getArguments();
        if (args.length === 0) continue;

        const firstArgText = args[0].getText();

        // Must be a string literal
        if (
          !firstArgText.startsWith("'") &&
          !firstArgText.startsWith('"') &&
          !firstArgText.startsWith("`")
        ) continue;

        // Remove quotes correctly — handles single, double, and backtick
        const urlPath = firstArgText.replace(/^['"`]|['"`]$/g, "");

        if (!urlPath.startsWith("/")) continue;

        // Extract handler name if last argument is a simple identifier
        let handlerName: string | undefined;
        let inlineHandler: {rawCode: string, startLine: number, endLine: number} | undefined;

        if (args.length >= 2) {
          const lastArg = args[args.length - 1];
          const lastArgText = lastArg.getText();
          
          if (
            !lastArgText.includes("=>") &&
            !lastArgText.includes("function") &&
            /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lastArgText)
          ) {
            handlerName = lastArgText;
          }else if(lastArgText.includes("=>") || lastArgText.includes("function")){
            //extract the inline handler 
            inlineHandler = {
              rawCode:   lastArgText,
              startLine: lastArg.getStartLineNumber(),
              endLine:   lastArg.getEndLineNumber(),
            }
          };
        }

        const params = extractParams(urlPath);

        nodes.push({
          type: "BACKEND_ROUTE",
          urlPath,
          filePath,
          httpMethod: normalizeMethod(methodName),
          handlerName,
          inlineHandler,
          framework,
          isDynamic: params.length > 0,
          params: params.length > 0 ? params : undefined,
        });
      } catch {
        continue;
      }
    }
  }

  return nodes;
}