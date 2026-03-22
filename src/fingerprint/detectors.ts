import fs from "fs";
import path from "path";
import {
  Language,
  Framework,
  RouterType,
  StateLibrary,
  DataFetchingLibrary,
  DatabaseLibrary,
  ProjectType,
} from "../types";

// Framework category arrays — used instead of type casts
const FRONTEND_FRAMEWORKS: Framework[] = ["nextjs", "react"];
const BACKEND_FRAMEWORKS: Framework[] = ["express", "fastify", "koa"];

export function detectLanguage(repoPath: string): Language {
  if (fs.existsSync(path.join(repoPath, "tsconfig.json"))) return "typescript";
  return "javascript";
}

export function detectFramework(deps: Record<string, string>): Framework {
  if ("next" in deps) return "nextjs";
  if ("react" in deps) return "react";
  if ("express" in deps) return "express";
  if ("fastify" in deps) return "fastify";
  if ("koa" in deps) return "koa";
  return "unknown";
}

export function detectRouter(
  deps: Record<string, string>,
  framework: Framework,
  repoPath: string
): RouterType {
  // Router detection only applies to Next.js and React
  // Backend frameworks handle routing via code not filesystem
  if (framework === "nextjs") {
    const hasAppDir = fs.existsSync(path.join(repoPath, "src/app")) || fs.existsSync(path.join(repoPath, "app"));
    const hasPagesDir = fs.existsSync(path.join(repoPath, "src/pages")) || fs.existsSync(path.join(repoPath, "pages"));
    if (hasAppDir && hasPagesDir) return "app+pages";
    if (hasAppDir) return "app";
    if (hasPagesDir) return "pages";
  }
  if (framework === "react") {
    if ("react-router-dom" in deps) return "react-router";
  }
  return "none";
}

export function detectStateManagement(
  deps: Record<string, string>
): StateLibrary[] {
  const found: StateLibrary[] = [];
  if ("zustand" in deps) found.push("zustand");
  if ("redux" in deps || "@reduxjs/toolkit" in deps) found.push("redux");
  if ("recoil" in deps) found.push("recoil");
  if ("jotai" in deps) found.push("jotai");
  if (found.length === 0) found.push("context-only");
  return found;
}

export function detectDataFetching(
  deps: Record<string, string>
): DataFetchingLibrary[] {
  const found: DataFetchingLibrary[] = [];
  if ("@tanstack/react-query" in deps || "react-query" in deps)
    found.push("react-query");
  if ("swr" in deps) found.push("swr");
  if ("axios" in deps) found.push("axios");
  if (found.length === 0) found.push("fetch");
  return found;
}

export function detectDatabases(
  deps: Record<string, string>
): DatabaseLibrary[] {
  const found: DatabaseLibrary[] = [];
  if ("prisma" in deps || "@prisma/client" in deps) found.push("prisma");
  if ("drizzle-orm" in deps) found.push("drizzle");
  if ("mongoose" in deps || "mongodb" in deps) found.push("mongodb");
  if ("firebase" in deps || "firebase-admin" in deps) found.push("firebase");
  if ("@supabase/supabase-js" in deps) found.push("supabase");
  if ("@planetscale/database" in deps) found.push("planetscale");
  if ("pg" in deps || "postgres" in deps) found.push("postgres");
  if ("mysql2" in deps) found.push("mysql");
  if ("better-sqlite3" in deps) found.push("sqlite");
  return found;
}

export function detectProjectType(
  framework: Framework,
  deps: Record<string, string>,
  repoPath: string
): ProjectType {
  const frontendDeps = [
    "next", "react", "react-dom",
    "@tanstack/react-query", "swr",
  ];
  const backendDeps = [
    "express", "fastify", "koa",
    "koa-router", "@fastify/router",
  ];
  const databaseDeps = [
    "prisma", "@prisma/client", "drizzle-orm",
    "mongoose", "mongodb", "pg", "mysql2",
    "better-sqlite3", "firebase", "@supabase/supabase-js",
  ];

  const hasFrontendDeps = Object.keys(deps).some((d) =>
    frontendDeps.includes(d)
  );
  const hasBackendDeps = Object.keys(deps).some((d) =>
    backendDeps.includes(d)
  );
  const hasDatabaseDeps = Object.keys(deps).some((d) =>
    databaseDeps.includes(d)
  );

  // Check directory structures
  const hasFrontendStructure =
    fs.existsSync(path.join(repoPath, "src", "app")) ||
    fs.existsSync(path.join(repoPath, "src", "pages")) ||
    (fs.existsSync(path.join(repoPath, "src")) &&
      fs.existsSync(path.join(repoPath, "src", "components")));

  const hasBackendStructure =
    fs.existsSync(path.join(repoPath, "routes")) ||
    fs.existsSync(path.join(repoPath, "server")) ||
    fs.existsSync(path.join(repoPath, "controllers")) ||
    fs.existsSync(path.join(repoPath, "services")) ||
    fs.existsSync(path.join(repoPath, "middleware"))
    
    fs.existsSync(path.join(repoPath, "src/routes")) ||
    fs.existsSync(path.join(repoPath, "src/server")) ||
    fs.existsSync(path.join(repoPath, "src/controllers")) ||
    fs.existsSync(path.join(repoPath, "src/services")) ||
    fs.existsSync(path.join(repoPath, "src/middleware"));

  // Framework-based detection first — most reliable signal
  if (FRONTEND_FRAMEWORKS.includes(framework)) {
    if (framework === "nextjs") {
      const hasApiRoutes =
        fs.existsSync(path.join(repoPath, "app", "api")) ||
        fs.existsSync(path.join(repoPath, "pages", "api"));
      if (hasApiRoutes || hasBackendDeps || hasDatabaseDeps) {
        return "fullstack";
      }
      return "frontend";
    }
    // Plain React
    if (hasBackendDeps || hasDatabaseDeps || hasBackendStructure) {
      return "fullstack";
    }
    return "frontend";
  }

  if (BACKEND_FRAMEWORKS.includes(framework)) {
    if (hasFrontendDeps || hasFrontendStructure) {
      return "fullstack";
    }
    return "backend";
  }

  // Framework unknown — score based on signals
  if (framework === "unknown") {
    let frontendScore = 0;
    let backendScore = 0;

    if (hasFrontendDeps) frontendScore += 2;
    if (hasFrontendStructure) frontendScore += 2;
    if (fs.existsSync(path.join(repoPath, "public"))) frontendScore += 1;
    if (fs.existsSync(path.join(repoPath, "index.html"))) frontendScore += 1;

    if (hasBackendDeps) backendScore += 2;
    if (hasDatabaseDeps) backendScore += 2;
    if (hasBackendStructure) backendScore += 2;
    if (
      fs.existsSync(path.join(repoPath, "server.ts")) ||
      fs.existsSync(path.join(repoPath, "server.js"))
    )
      backendScore += 1;

    if (frontendScore > 0 && backendScore > 0) return "fullstack";
    if (frontendScore > backendScore) return "frontend";
    if (backendScore > frontendScore) return "backend";
  }

  return "unknown";
}