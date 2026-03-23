import {
    handleAnalyze,
    handleListJobs,
    handleGetJob,
    handleJobStream,
    handlePauseJob,
    handleResumeJob,
    handleCancelJob,
    handleSummarize,
} from "./handlers/jobs";
import {
    handleListGraphs,
    handleGetGraph,
    handleGetGraphMeta,
    handleDeleteGraph,
    handleDeleteCommit,
    handleGetCodeNode,
} from "./handlers/graph";
import { handleFilter } from "./handlers/filter";
import { handleDiff } from "./handlers/diff";
import { handleQuery }  from "./handlers/query";
import { handleGetConfig, handlePatchConfig } from "./handlers/config";
import { getClusters } from "./handlers/cluster";

type Handler = (params: Record<string, string>, req: Request) => Promise<Response> | Response;

interface Route {
    method: string;
    pattern: string;
    handler: Handler;
}

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
    const patParts = pattern.split("/");
    const urlParts = pathname.split("/");

    if (patParts.length !== urlParts.length) return null;

    const params: Record<string, string> = {};

    for (let i = 0; i < patParts.length; i++) {
        const pat = patParts[i];
        const url = urlParts[i];

        if (pat.startsWith(":")) {
            params[pat.slice(1)] = url;
        } else if (pat !== url) {
            return null;
        }
    }

    return params;
}

// Order matters: literal segments must come before :param wildcards of the same depth
const ROUTES: Route[] = [
    {
        method: "GET",
        pattern: "/",
        handler: () => Response.json({
            success: true, message: "Welcome to DevLens. Made by Shivang by the glory of God. Thanks for using this Project."
        })
    },
    {
        method: "GET",
        pattern: "/api/health",
        handler: () => Response.json({ success: true, data: { status: "ok" } }),
    },
    {
        method: "GET",
        pattern: "/api/config",
        handler: (_params, req) => handleGetConfig(req),
    },
    {
        method: "PATCH",
        pattern: "/api/config",
        handler: (_params, req) => handlePatchConfig(req),
    },
    {
        method: "GET",
        pattern: "/api/graphs",
        handler: () => handleListGraphs(),
    },
    {
        method: "POST",
        pattern: "/api/analyze",
        handler: (_params, req) => handleAnalyze(req),
    },
    {
        method: "GET",
        pattern: "/api/jobs",
        handler: () => handleListJobs(),
    },
    {
        method: "GET",
        pattern: "/api/job/:jobId",
        handler: (params) => handleGetJob(params.jobId),
    },
    {
        method: "GET",
        pattern: "/api/job/:jobId/stream",
        handler: (params) => handleJobStream(params.jobId),
    },
    {
        method: "POST",
        pattern: "/api/job/:jobId/pause",
        handler: (params) => handlePauseJob(params.jobId),
    },
    {
        method: "POST",
        pattern: "/api/job/:jobId/resume",
        handler: (params) => handleResumeJob(params.jobId),
    },
    {
        method: "POST",
        pattern: "/api/job/:jobId/cancel",
        handler: (params) => handleCancelJob(params.jobId),
    },
    {
        method: "POST",
        pattern: "/api/query",
        handler: (_params, req) => handleQuery(req),
    },
    // Literal third segments must come before :commitHash at the same depth
    {
        method: "GET",
        pattern: "/api/graph/:graphId/commits",
        handler: (params) => handleGetGraphMeta(params.graphId),
    },
    {
        method: "GET",
        pattern: "/api/graph/:graphId/diff",
        handler: (params, req) => handleDiff(params.graphId, req),
    },
    {
        method: "POST",
        pattern: "/api/graph/:graphId/filter",
        handler: (params, req) => handleFilter(params.graphId, undefined, req),
    },
    // Four-segment routes with :commitHash
    {
        method: "POST",
        pattern: "/api/graph/:graphId/:commitHash/filter",
        handler: (params, req) => handleFilter(params.graphId, params.commitHash, req),
    },
    {
        method: "POST",
        pattern: "/api/graph/:graphId/:commitHash/summarize",
        handler: (params, req) => handleSummarize(params.graphId, params.commitHash, req),  //the req is only used for the resolveConfig in case to read the cofigs from the headers
    },
    {
        method: "POST",
        pattern: "/api/graph/:graphId/:commitHash/node",
        handler: async (params, req) => {
            const body = await req.json().catch(() => null) as {nodeId?: string} | null;
            const nodeId = body?.nodeId as string;
            if (!nodeId) return Response.json({ success: false, error: "nodeId is required" }, { status: 400 });
            return handleGetCodeNode(params.graphId, params.commitHash, nodeId);
        }
    },
    //I am not using this clustering as of now...as algorithm is not that robust and it blurts out over 100 cluster for a 404 nodes APP
    // {
    //     method: "GET",
    //     pattern: "/api/graph/:graphId/clusters",
    //     handler: (params) => getClusters(params.graphId),
    // },
    // {
    //     method: "GET",
    //     pattern: "/api/graph/:graphId/:commitHash/clusters",
    //     handler: (params) => getClusters(params.graphId, params.commitHash),
    // },
    {
        method: "GET",
        pattern: "/api/graph/:graphId/:commitHash",
        handler: (params) => handleGetGraph(params.graphId, params.commitHash),
    },
    // Three-segment routes (most general GET — must come after all specific three-segment routes)
    {
        method: "GET",
        pattern: "/api/graph/:graphId",
        handler: (params) => handleGetGraph(params.graphId),
    },
    {
        method: "DELETE",
        pattern: "/api/graph/:graphId/commit/:hash",
        handler: (params) => handleDeleteCommit(params.graphId, params.hash),
    },
    {
        method: "DELETE",
        pattern: "/api/graph/:graphId",
        handler: (params) => handleDeleteGraph(params.graphId),
    },
];

export async function router(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
    }

    for (const route of ROUTES) {
        if (route.method !== req.method) continue;
        const params = matchRoute(route.pattern, pathname);
        if (params !== null) {
            try {
                return await route.handler(params, req);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Internal server error";
                return Response.json({ success: false, error: message }, { status: 500 });
            }
        }
    }

    return Response.json({ success: false, error: "Not found" }, { status: 404 });
}