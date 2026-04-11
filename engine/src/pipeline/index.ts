import path from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { analyzeFingerprint } from "../fingerprint";
import { analyzeFilesystem } from "../filesystem";
import { parseRepo } from "../parser";
import { detectEdges } from "../graph";
import { scoreAndFilter } from "../scoring";
import type { FilterThresholds } from "../scoring/noiseFilter";
import type {
  CodeNode,
  CodeEdge,
  ProjectFingerprint,
  RouteNode,
  BackendRouteNode,
} from "../types";

export type { FilterThresholds };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitInfo {
  commitHash: string;   // 8-char short hash, or timestamp string if no git
  branch: string;
  message: string;
  hasGit: boolean;
}

export interface PipelineOptions {
  thresholds?: FilterThresholds;
  onStep?: (step: "fingerprint" | "filesystem" | "parse" | "edges" | "scoring") => void;

}

export interface PipelineStats {
  totalNodesBeforeFilter: number;
  totalEdgesBeforeFilter: number;
  totalNodesAfterFilter: number;
  totalEdgesAfterFilter: number;
  removedNodeCount: number;
  removedEdgeCount: number;
  averageNodeScore: number;
  topScoringNodes: { name: string; score: number; type: string }[];
  topScoringFiles: { name: string; score: number; filePath: string }[];
}

export interface PipelineResult {
  graphId: string;       // stable hash of repoPath — same repo always same id
  repoPath: string;
  analyzedAt: string;
  fingerprint: ProjectFingerprint;
  routes: RouteNode[] | BackendRouteNode[];
  nodes: CodeNode[];   // filtered — what frontend renders
  edges: CodeEdge[];   // filtered
  allNodes: CodeNode[];   // unfiltered — needed for refiltering
  allEdges: CodeEdge[];   // unfiltered — needed for refiltering
  nodeScores: Record<string, number>;  // ALL scores including removed nodes
  stats: PipelineStats;
  isGithubRepo: boolean;
  gitInfo: GitInfo;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Deterministic graphId — same repo always produces same id
// This ensures multiple analyses of the same repo go into the same folder
function generateGraphId(repoPath: string, isGithubRepo: boolean): string {
  const normalized = isGithubRepo
    ? repoPath.toLowerCase().trim()         // normalize GitHub URL
    : path.resolve(repoPath).toLowerCase(); // normalize local path

  return createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
}

// Gets current git state of the repo
// Falls back gracefully if git is not initialized
function getGitInfo(repoPath: string): GitInfo {
  try {
    const commitHash = execSync("git rev-parse HEAD", { cwd: repoPath })
      .toString().trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath })
      .toString().trim();
    const message = execSync("git log -1 --pretty=%s", { cwd: repoPath })
      .toString().trim();

    return { commitHash, branch, message, hasGit: true };
  } catch {
    // No git, or no commits yet — use timestamp as version key
    return {
      commitHash: Date.now().toString(),
      branch: "unknown",
      message: "no git history",
      hasGit: false,
    };
  }
}

function buildStats(
  scoringResult: ReturnType<typeof scoreAndFilter>,
  allNodes: CodeNode[]
): PipelineStats {
  const topScoringFiles = allNodes
    .filter((n) => n.type === "FILE")
    .map((n) => ({
      name: n.name,
      score: scoringResult.nodeScores.get(n.id) ?? 0,
      filePath: n.filePath,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    ...scoringResult.stats,
    topScoringFiles,
  };
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const [k, v] of map) record[k] = v;
  return record;
}


//  routesToCodeNodes 
//
// Converts RouteNode[] / BackendRouteNode[] into ROUTE CodeNodes so they
// participate in the graph as first-class nodes.
//
// Route-specific fields go into metadata — CodeNode schema stays clean.
// IDs follow the same filePath::name convention as all other nodes so
// the lookup maps in buildLookupMaps() work without any changes.
//
// Naming convention:
//   Next.js page/layout/API:  "GET /api/users"  → id = "app/api/users/route.ts::GET /api/users"
//   Backend (Express etc.):   "POST /users"      → id = "src/routes/users.ts::POST /users"

function routesToCodeNodes(
  routes: (RouteNode | BackendRouteNode)[],
  repoPath: string,
): CodeNode[] {
  const nodes: CodeNode[] = [];

  for (const route of routes) {
    // Make filePath relative — same as parser does for all other nodes
    const relativeFilePath = path.relative(repoPath, route.filePath).replace(/\\/g, "/");

    if (route.type === "BACKEND_ROUTE") {
      // Each backend route = one node per HTTP method + path combination
      const name = `${route.httpMethod} ${route.urlPath}`;
      const id   = `${relativeFilePath}::${name}`;

      nodes.push({
        id,
        name,
        type:      "ROUTE",
        filePath:  relativeFilePath,
        startLine: 1,
        endLine:   1,
        parentFile: `file::${relativeFilePath}`,
        metadata: {
          urlPath:      route.urlPath,
          httpMethod:   route.httpMethod,
          isDynamic:    route.isDynamic,
          params:       route.params ?? [],
          framework:    route.framework,
          handlerName:  route.handlerName,  // used by routeEdges to resolve handler
          routeKind:    "backend",
        },
      });

    } else {
      // Next.js RouteNode — one node per HTTP method for API routes,
      // one node for page/layout/etc.
      const httpMethods = route.httpMethods && route.httpMethods.length > 0
        ? route.httpMethods
        : route.type === "API_ROUTE"
          ? ["GET", "POST"]   // fallback — we'll refine via routeEdges handler lookup
          : [null];           // non-API routes (PAGE, LAYOUT etc.) have no method

      for (const method of httpMethods) {
        const name = method
          ? `${method} ${route.urlPath}`
          : route.urlPath;
        const id = `${relativeFilePath}::${name}`;

        nodes.push({
          id,
          name,
          type:      "ROUTE",
          filePath:  relativeFilePath,
          startLine: 1,
          endLine:   1,
          parentFile: `file::${relativeFilePath}`,
          metadata: {
            urlPath:      route.urlPath,
            httpMethod:   method ?? null,
            isDynamic:    route.isDynamic,
            isCatchAll:   route.isCatchAll,
            isGroupRoute: route.isGroupRoute,
            params:       route.params ?? [],
            routeNodeType: route.type,        // PAGE | LAYOUT | API_ROUTE | etc.
            layoutPath:   route.layoutPath,
            framework:    "nextjs",
            routeKind:    "nextjs",
          },
        });
      }
    }
  }

  return nodes;
}


// ─── analyzePipeline ──────────────────────────────────────────────────────────

export async function analyzePipeline(
  repoPath: string,
  isGithubRepo: boolean,
  options?: PipelineOptions
): Promise<PipelineResult> {

  const absoluteRepoPath = path.resolve(repoPath);


  const graphId = generateGraphId(repoPath, isGithubRepo);// stable, deterministic ID based on repo path
  const gitInfo = getGitInfo(absoluteRepoPath);
  const analyzedAt = new Date().toISOString();

  console.log(`\n🔍 devlens — analyzing ${absoluteRepoPath}`);
  console.log(`   Graph ID:   ${graphId}`);
  console.log(`   Commit:     ${gitInfo.commitHash} (${gitInfo.branch})`);
  console.log(`   Message:    ${gitInfo.message}`);

  // ── Step 1: Fingerprint ───────────────────────────────────────
  console.log("\n[1/5] Fingerprinting project...");
  const fingerprint = analyzeFingerprint(absoluteRepoPath);
  console.log(
    `  Framework: ${fingerprint.framework}  |  Language: ${fingerprint.language}  |  Type: ${fingerprint.projectType}`
  );

  // ── Step 2: Filesystem / routes ───────────────────────────────
  console.log("\n[2/5] Analyzing filesystem routes...");
  const routes = analyzeFilesystem(absoluteRepoPath, fingerprint);
  console.log(`  Routes found: ${routes.length}`);

  // Convert routes -> CodeNodes so they join the graph as nodes as well
  // It is important to add here before the detection of the edges
  const routeNodes = routesToCodeNodes(routes, absoluteRepoPath);
  console.log(`  Route nodes created: ${routeNodes.length}`);

  // ── Step 3: Parse source files into nodes ─────────────────────
  console.log("\n[3/5] Parsing source files...");
  const parserResult = parseRepo(absoluteRepoPath);
  console.log(
    `  Files: ${parserResult.stats.totalFiles}  |  Nodes: ${parserResult.stats.totalNodes}  |  Skipped: ${parserResult.stats.skippedFiles}`
  );

  // ── Step 4: Detect edges ──────────────────────────────────────
  console.log("\n[4/5] Detecting edges...");
  const edgeResult = detectEdges(
    [...parserResult.nodes, ...routeNodes],
    routes,
    absoluteRepoPath,
    fingerprint
  );

  const allNodes: CodeNode[] = [...parserResult.nodes, ...routeNodes, ...edgeResult.ghostNodes];
  const allEdges: CodeEdge[] = edgeResult.edges;

  // ── Step 5: Score and filter ──────────────────────────────────
  console.log("\n[5/5] Scoring and filtering...");
  const scoringResult = scoreAndFilter(allNodes, allEdges, options?.thresholds);

  const nodeScores = mapToRecord(scoringResult.nodeScores);
  const stats = buildStats(scoringResult, allNodes);
  
  // Embed score directly onto every node — allNodes and filteredNodes both.
  // nodeScores map stays for diffCommits and refilterPipeline which need it,
  // but consumers (frontend, Neo4j, summarizer) get score on the node itself.
  for(const node of allNodes) {
    node.score = nodeScores[node.id] ?? 0;
  }

  console.log(`\n✅ Analysis complete — graph ${graphId} @ commit ${gitInfo.commitHash}`);

  return {
    graphId,
    repoPath: absoluteRepoPath,
    analyzedAt,
    fingerprint,
    routes,
    nodes: scoringResult.filteredNodes,
    edges: scoringResult.filteredEdges,
    allNodes,
    allEdges,
    nodeScores,
    stats,
    isGithubRepo,
    gitInfo,
  };
}

// ─── refilterPipeline ─────────────────────────────────────────────────────────

export function refilterPipeline(
  stored: PipelineResult,
  thresholds: FilterThresholds
): Pick<PipelineResult, "nodes" | "edges" | "stats"> {
  const existingScores = new Map<string, number>(
    Object.entries(stored.nodeScores)
  );

  const scoringResult = scoreAndFilter(
    stored.allNodes,
    stored.allEdges,
    thresholds,
    existingScores
  );

  const stats = buildStats(scoringResult, stored.allNodes);

  return {
    nodes: scoringResult.filteredNodes,
    edges: scoringResult.filteredEdges,
    stats,
  };
}

