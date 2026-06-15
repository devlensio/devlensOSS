import fs from "fs";
import path from "path";
import type { CodeNode } from "../types";

// ─── Exclusion / inclusion sets ───────────────────────────────────────────────

// Packages whose primary purpose is UI rendering, styling, or testing —
// they appear in almost every repo and add no analytical signal.
const UI_EXCLUSION_SET = new Set([
  // Core UI frameworks
  "react", "react-dom", "next", "gatsby", "nuxt", "@sveltejs/kit",
  "solid-js", "preact", "remix", "@remix-run/react", "@remix-run/node",
  // Styling
  "tailwindcss", "styled-components", "@emotion/react", "@emotion/styled",
  "sass", "less", "postcss", "autoprefixer",
  "clsx", "class-variance-authority", "tailwind-merge", "cva",
  // Animation / transition
  "framer-motion", "react-spring", "react-transition-group", "motion",
  // UI component kits (prefix-matched below for @radix-ui/* etc.)
  "@headlessui/react", "lucide-react", "react-icons", "@heroicons/react",
  "@phosphor-icons/react", "react-feather",
  // Testing
  "jest", "vitest", "@testing-library/react", "@testing-library/dom",
  "@testing-library/jest-dom", "@testing-library/user-event",
  "@playwright/test", "cypress", "mocha", "chai", "supertest",
  // Dev tools
  "typescript", "eslint", "prettier", "webpack", "vite", "esbuild",
  "rollup", "parcel", "turbopack",
  "@types/node", "@types/react", "@types/react-dom",
  "ts-node", "tsx", "nodemon", "concurrently", "husky", "lint-staged",
  "rimraf", "cross-env", "dotenv-cli",
]);

// Packages that ARE runtime logic — they represent real architectural decisions.
const RUNTIME_INCLUSION_SET = new Set([
  // HTTP clients
  "axios", "ky", "node-fetch", "got", "superagent", "undici",
  // Auth
  "next-auth", "@auth/core", "jsonwebtoken", "bcryptjs", "bcrypt",
  "passport", "clerk", "@clerk/nextjs", "@clerk/clerk-react", "lucia",
  // State management
  "zustand", "jotai", "recoil", "redux", "@reduxjs/toolkit", "mobx",
  "xstate", "valtio", "nanostores",
  // Data fetching / caching
  "@tanstack/react-query", "@tanstack/query-core",
  "swr", "@apollo/client", "urql", "graphql",
  // Validation / schema
  "zod", "yup", "joi", "valibot", "superstruct", "ajv",
  // ORM / DB
  "@prisma/client", "drizzle-orm", "mongoose", "sequelize", "typeorm",
  "pg", "mysql2", "better-sqlite3", "ioredis", "redis",
  "@neondatabase/serverless", "@vercel/postgres",
  // Payments
  "stripe", "@stripe/stripe-js", "@stripe/react-stripe-js",
  // Email
  "nodemailer", "@sendgrid/mail", "resend", "@aws-sdk/client-ses",
  // BaaS
  "@supabase/supabase-js", "firebase", "firebase-admin",
  // Cloud SDKs
  "aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb",
  "@aws-sdk/client-lambda", "@aws-sdk/client-sqs",
  // Realtime
  "socket.io", "socket.io-client", "ws", "pusher", "pusher-js",
  "@ably/ably",
  // Queues / jobs
  "bull", "bullmq", "node-cron", "agenda", "bee-queue",
  // File processing
  "sharp", "multer", "formidable",
  // CMS
  "contentful", "@sanity/client", "@sanity/image-url",
  // Observability
  "@sentry/nextjs", "@sentry/node", "posthog-js", "@posthog/node",
  "newrelic", "dd-trace",
  // Utilities
  "lodash", "date-fns", "dayjs", "moment", "uuid", "nanoid",
  "slugify", "cheerio", "marked", "gray-matter",
  // Backend frameworks
  "express", "fastify", "koa", "hono", "nestjs", "@nestjs/core",
  // AI / LLM
  "openai", "@anthropic-ai/sdk", "langchain", "@langchain/core",
  "ai", "@ai-sdk/openai", "@ai-sdk/anthropic",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function readPackageDependencies(repoPath: string): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { dependencies: {}, devDependencies: {} };
  }
  try {
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    return {
      dependencies:    pkg.dependencies    ?? {},
      devDependencies: pkg.devDependencies ?? {},
    };
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }
}

export function categorizeLibrary(
  packageName: string,
  isDev: boolean
): "runtime" | "ui" | "devtool" | "unknown" {
  // Check exact match in UI set
  if (UI_EXCLUSION_SET.has(packageName)) return "ui";

  // Check prefix matches for scoped UI packages like @radix-ui/*, @types/*
  if (
    packageName.startsWith("@radix-ui/") ||
    packageName.startsWith("@types/") ||
    packageName.startsWith("@testing-library/") ||
    packageName.startsWith("@storybook/") ||
    packageName.startsWith("eslint-")    ||
    packageName.startsWith("prettier-")  ||
    packageName.startsWith("babel-")     ||
    packageName.startsWith("@babel/")
  ) return "ui";

  // Check runtime set
  if (RUNTIME_INCLUSION_SET.has(packageName)) return "runtime";

  // Check prefix matches for scoped runtime packages
  if (
    packageName.startsWith("@aws-sdk/") ||
    packageName.startsWith("@tanstack/") ||
    packageName.startsWith("@sentry/")   ||
    packageName.startsWith("@clerk/")    ||
    packageName.startsWith("@auth/")     ||
    packageName.startsWith("@ai-sdk/")   ||
    packageName.startsWith("@nestjs/")
  ) return "runtime";

  // devDependencies that didn't match anything above
  if (isDev) return "devtool";

  return "unknown";
}

export function extractPackageName(importSpecifier: string): string {
  // Scoped package: @org/pkg/sub/path → @org/pkg
  if (importSpecifier.startsWith("@")) {
    const parts = importSpecifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  // Regular: axios/lib/core → axios
  return importSpecifier.split("/")[0];
}

export function buildThirdPartyNodes(
  repoPath: string,
  includedLibs: string[]
): CodeNode[] {
  if (!includedLibs.length) return [];

  const { dependencies, devDependencies } = readPackageDependencies(repoPath);
  const nodes: CodeNode[] = [];

  for (const name of includedLibs) {
    const version =
      dependencies[name] ?? devDependencies[name] ?? "unknown";
    const isDev = name in devDependencies && !(name in dependencies);

    nodes.push({
      id:        `[npm]/${name}`,
      name,
      type:      "THIRD_PARTY",
      filePath:  `[npm]/${name}`,
      startLine: 0,
      endLine:   0,
      rawCode:   undefined,
      codeHash:  undefined,
      metadata: {
        isThirdParty:   true,
        packageVersion: version,
        category:       categorizeLibrary(name, isDev),
      },
    });
  }

  return nodes;
}
