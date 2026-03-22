import { storage } from "../../storage";
import { refilterPipeline } from "../../pipeline";
import type { FilterThresholds } from "../../pipeline";
import { buildGraphResponse } from "./graph";

export async function handleFilter(
    graphId: string,
    commitHash: string | undefined,
    req: Request
): Promise<Response> {
    let body: { thresholds?: FilterThresholds };
    try {
        body = await req.json() as { thresholds?: FilterThresholds };
    } catch {
        return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { thresholds } = body;
    if (!thresholds || typeof thresholds !== "object") {
        return Response.json(
            { success: false, error: "'thresholds' is required and must be an object" },
            { status: 400 }
        );
    }

    const stored = storage.getGraph(graphId, commitHash);
    if (!stored) {
        return Response.json({ success: false, error: "Graph not found" }, { status: 404 });
    }

    const { nodes, edges, stats } = refilterPipeline(stored, thresholds);
    return Response.json({ success: true, data: buildGraphResponse(nodes, { edges, stats }) });
}
