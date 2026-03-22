import fs from "fs";
import path from "path";
import { ProjectFingerprint } from "../types";
import {
  detectLanguage,
  detectFramework,
  detectRouter,
  detectStateManagement,
  detectDataFetching,
  detectDatabases,
  detectProjectType,
} from "./detectors";

export function analyzeFingerprint(repoPath: string): ProjectFingerprint {
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }

  const packageJsonPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found at: ${packageJsonPath}`);
  }

  const raw = fs.readFileSync(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(raw);

  const deps: Record<string, string> = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  const language = detectLanguage(repoPath);
  const framework = detectFramework(deps);
  const router = detectRouter(deps, framework, repoPath);
  const projectType = detectProjectType(framework, deps, repoPath);
  const databases = detectDatabases(deps);

  // Backend projects have no React state or frontend data fetching
  const isFrontendRelevant =
    projectType === "frontend" || projectType === "fullstack";

  const stateManagement = isFrontendRelevant
    ? detectStateManagement(deps)
    : [];

  const dataFetching = isFrontendRelevant
    ? detectDataFetching(deps)
    : [];

  return {
    language,
    projectType,
    framework,
    router,
    stateManagement,
    dataFetching,
    databases,
    rawDependencies: deps,
  };
}