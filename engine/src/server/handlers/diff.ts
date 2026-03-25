import { storage } from "../../storage";

export async function handleDiff(graphId: string, req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    console.log("difference from:", from, "to", to);

    if (!from || !to) {
        return Response.json(
            { success: false, error: "Query params 'from' and 'to' are required" },
            { status: 400 }
        );
    }
    if (from === to) {
        return Response.json(
            { success: false, error: "'from' and 'to' must be different commit hashes" },
            { status: 400 }
        );
    }

    const diff = storage.diffCommits(graphId, from, to);
    if (!diff) {
        return Response.json(
            { success: false, error: "One or both commits not found" },
            { status: 404 }
        );
    }

    return Response.json({ success: true, data: diff });
}
