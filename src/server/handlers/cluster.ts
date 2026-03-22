import { ClusterResult, computeClusters } from "../../clustering";
import { storage } from "../../storage";

export function getClusters(graphId: string, commitHash?: string): Response {

    const result = storage.getGraph(graphId, commitHash);
    if(!result) {
        return Response.json({ success: false, error: "Graph not found" }, { status: 404 });
    }

    const {nodes, edges, nodeScores} = result;
    const clusterResult: ClusterResult = computeClusters(nodes, edges, nodeScores);
    return Response.json({ success: true, data: clusterResult });
}