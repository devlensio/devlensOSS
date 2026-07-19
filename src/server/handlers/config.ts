import { resolveConfig, maskConfig, writeConfig, resolveAllProviders, setActiveProvider, removeProviderConfig, loadCatalog, findProvider, listModels } from "devlensio";

// ── Simple in-memory cache for model listings ────────────────────────────────
const modelCache = new Map<string, { models: string[]; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(name: string, baseUrl: string): string {
  return `${name}|${baseUrl}`;
}

function getCachedModels(key: string): string[] | null {
  const entry = modelCache.get(key);
  if (!entry || Date.now() > entry.expires) {
    modelCache.delete(key);
    return null;
  }
  return entry.models;
}

function setCachedModels(key: string, models: string[]): void {
  modelCache.set(key, { models, expires: Date.now() + CACHE_TTL_MS });
}

// ── Existing endpoints ───────────────────────────────────────────────────────

export function handleGetConfig(req: Request): Response {
  try {
    const config = resolveConfig(req);
    const safe   = maskConfig(config);
    // Attach all configured providers for the multi-provider UI
    try {
      const allProviders = resolveAllProviders();
      safe.allProviders = allProviders;
    } catch {
      // best-effort — frontend falls back to flat summarization
    }
    return Response.json({ success: true, data: safe });
  } catch {
    return Response.json({ success: true, data: {} });
  }
}

export async function handlePatchConfig(req: Request): Promise<Response> {
  let deploymentMode = "local";
  try {
    const current = resolveConfig(req);
    deploymentMode = current.deploymentMode;
  } catch {
    // No valid config yet — allow PATCH through so user can set one up
  }

  if (deploymentMode === "cloud") {
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
  const VALID_LLM_PROVIDERS       = new Set(["openai", "anthropic"]);
  const VALID_EMBEDDING_PROVIDERS = new Set(["openai", "anthropic", "openrouter", "gemini", "ollama"]);

  const partial = body as Record<string, unknown>;
  if (partial.summarization) {
    const s = partial.summarization as Record<string, unknown>;
    if (s.provider && !VALID_LLM_PROVIDERS.has(s.provider as string)) {
      return Response.json(
        {
          success: false,
          error:   `Invalid summarization provider protocol: "${s.provider}". Must be "openai" or "anthropic".`,
          valid:   [...VALID_LLM_PROVIDERS],
        },
        { status: 400 }
      );
    }
    if (s.providerName !== undefined && (typeof s.providerName !== "string" || !s.providerName.trim())) {
      return Response.json(
        {
          success: false,
          error:   "providerName must be a non-empty string when provided",
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
  try {
    const updated = resolveConfig(req);
    const safe    = maskConfig(updated);
    return Response.json({
      success: true,
      data:    safe,
      message: "Config saved successfully.",
    });
  } catch {
    return Response.json({
      success: true,
      data:    {},
      message: "Config saved. Complete your setup to enable summarization.",
    });
  }
}

// ── New provider endpoints ───────────────────────────────────────────────────

/** GET /api/providers — return the provider catalog */
export function handleGetProviders(): Response {
  try {
    const providers = loadCatalog();
    return Response.json({ success: true, data: providers });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load provider catalog",
      },
      { status: 500 }
    );
  }
}

/** GET /api/providers/:name/models — fetch live model list for a known provider */
export async function handleGetProviderModels(params: Record<string, string>): Promise<Response> {
  const name = params.name;
  if (!name) {
    return Response.json(
      { success: false, error: "Provider name is required" },
      { status: 400 }
    );
  }

  const entry = findProvider(name);
  if (!entry) {
    return Response.json(
      { success: false, error: `Unknown provider: "${name}"` },
      { status: 404 }
    );
  }

  // Resolve stored config for API key / baseUrl overrides.
  // Look up the correct provider entry in the multi-provider map so we don't
  // leak a stale baseUrl from a different provider (Bug #2 fix).
  let storedKey = "";
  let storedBaseUrl = "";
  try {
    const allProviders = resolveAllProviders();
    const providerEntry = allProviders.providers.find(
      p => p.providerName === name
    );
    if (providerEntry) {
      storedKey = providerEntry.apiKey ?? "";
      storedBaseUrl = providerEntry.baseUrl ?? "";
    }
  } catch {
    // No config yet — use catalog defaults
  }

  // Only use stored baseUrl when it was saved for THIS specific provider;
  // otherwise it's stale from a previous provider and would break the request.
  const effectiveBase = storedBaseUrl || entry.baseUrl;
  const cKey = cacheKey(name, effectiveBase);

  // Check cache
  const cached = getCachedModels(cKey);
  if (cached) {
    return Response.json({ success: true, data: { models: cached } });
  }

  try {
    const models = await listModels({
      protocol: entry.protocol,
      baseUrl: effectiveBase,
      apiKey: entry.requiresKey ? (storedKey || undefined) : undefined,
    });
    setCachedModels(cKey, models);
    return Response.json({ success: true, data: { models } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return Response.json({
      success: true,
      data: { models: [], error: message, fallback: true },
    });
  }
}

/** POST /api/providers/models — fetch model list for a custom/unconfigured endpoint */
export async function handlePostProviderModels(req: Request): Promise<Response> {
  let body: { protocol?: string; baseUrl?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.protocol || !body.baseUrl) {
    return Response.json(
      { success: false, error: "protocol and baseUrl are required" },
      { status: 400 }
    );
  }

  if (body.protocol !== "openai" && body.protocol !== "anthropic") {
    return Response.json(
      { success: false, error: 'protocol must be "openai" or "anthropic"' },
      { status: 400 }
    );
  }

  const cKey = cacheKey("custom", `${body.protocol}|${body.baseUrl}`);
  const cached = getCachedModels(cKey);
  if (cached) {
    return Response.json({ success: true, data: { models: cached } });
  }

  try {
    const models = await listModels({
      protocol: body.protocol,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey || undefined,
    });
    setCachedModels(cKey, models);
    return Response.json({ success: true, data: { models } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return Response.json({
      success: true,
      data: { models: [], error: message, fallback: true },
    });
  }
}

// ── Multi-provider management endpoints ───────────────────────────────────

/** PUT /api/config/active — switch the active provider. */
export async function handleSetActiveProvider(req: Request): Promise<Response> {
  let body: { active?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.active || typeof body.active !== "string") {
    return Response.json(
      { success: false, error: "active (provider key) is required" },
      { status: 400 }
    );
  }

  try {
    setActiveProvider(body.active);
    return Response.json({
      success: true,
      data: { active: body.active },
      message: `Active provider set to "${body.active}"`,
    });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to set active provider" },
      { status: 400 }
    );
  }
}

/** DELETE /api/config/provider — remove a provider entry. */
export async function handleRemoveProvider(req: Request): Promise<Response> {
  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.key || typeof body.key !== "string") {
    return Response.json(
      { success: false, error: "key (provider key) is required" },
      { status: 400 }
    );
  }

  try {
    removeProviderConfig(body.key);
    return Response.json({
      success: true,
      data: { removed: body.key },
      message: `Provider "${body.key}" removed`,
    });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to remove provider" },
      { status: 400 }
    );
  }
}
