import { resolveConfig, maskConfig, writeConfig } from "../../config";
import type { DevLensConfig } from "../../config";



export function handleGetConfig(req: Request): Response {
  const config = resolveConfig(req);
  const safe   = maskConfig(config);
  return Response.json({ success: true, data: safe });
}



// What can be sent (all optional — only send what changed):
// {
//   "summarization": {
//     "provider":  "anthropic",
//     "model":     "claude-haiku-4-5",
//     "apiKey":    "sk-ant-...",
//     "baseUrl":   "http://localhost:11434",
//     "batchSize": 50
//   },
//   "embedding": {
//     "provider": "openai",
//     "model":    "text-embedding-3-small",
//     "apiKey":   "sk-..."
//   },
//   "neo4j": {
//     "url":      "bolt://localhost:7687",
//     "username": "neo4j",
//     "password": "..."
//   }
// }
//
// To remove Neo4j config entirely, send: { "neo4j": null }

export async function handlePatchConfig(req: Request): Promise<Response> {

  const currentConfig = resolveConfig(req);

  if (currentConfig.deploymentMode === "cloud") {
    return Response.json(
      {
        success: false,
        error:   "Config cannot be modified in cloud deployment mode.",
        hint:    "Update settings via the cloud dashboard instead.",
      },
      { status: 403 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { success: false, error: "Body must be a JSON object" },
      { status: 400 }
    );
  }

  // ── Validate provider values if provided ──────────────────────────────────
  const VALID_LLM_PROVIDERS       = new Set(["anthropic","openai","openrouter","gemini","ollama","managed"]);
  const VALID_EMBEDDING_PROVIDERS = new Set(["anthropic","openai","openrouter","gemini","ollama","managed"]);

  const partial = body as Record<string, unknown>;
  if (partial.summarization) {
    const s = partial.summarization as Record<string, unknown>;
    if (s.provider && !VALID_LLM_PROVIDERS.has(s.provider as string)) {
      return Response.json(
        {
          success: false,
          error:   `Invalid summarization provider: "${s.provider}"`,
          valid:   [...VALID_LLM_PROVIDERS],
        },
        { status: 400 }
      );
    }
    if (s.batchSize !== undefined) {
      const size = Number(s.batchSize);
      if (!Number.isInteger(size) || size < 1 || size > 500) {
        return Response.json(
          {
            success: false,
            error:   "batchSize must be an integer between 1 and 500",
          },
          { status: 400 }
        );
      }
    }
  }

  if (partial.embedding) {
    const e = partial.embedding as Record<string, unknown>;
    if (e.provider && !VALID_EMBEDDING_PROVIDERS.has(e.provider as string)) {
      return Response.json(
        {
          success: false,
          error:   `Invalid embedding provider: "${e.provider}"`,
          valid:   [...VALID_EMBEDDING_PROVIDERS],
        },
        { status: 400 }
      );
    }
  }

  // ── Write to disk ─────────────────────────────────────────────────────────
  try {
    writeConfig(partial as Parameters<typeof writeConfig>[0]);
  } catch (err) {
    return Response.json(
      {
        success: false,
        error:   err instanceof Error ? err.message : "Failed to write config",
      },
      { status: 500 }
    );
  }

  // ── Return updated masked config ──────────────────────────────────────────
  // Re-resolve after write so response reflects the new saved state
  const updated = resolveConfig(req);
  const safe    = maskConfig(updated);

  return Response.json({
    success: true,
    data:    safe,
    message: "Config saved Successfully",
  });
}