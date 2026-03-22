export function handleQuery(_req: Request): Response {
    return Response.json(
        { success: false, error: "Query endpoint not yet implemented" },
        { status: 501 }
    );
}
