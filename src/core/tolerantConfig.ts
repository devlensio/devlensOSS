// Tolerant config access — version-adaptive bridge over devlensio's config API.
//
// The engine-side fixes (resolveConfig(req, {validate:false}), the native
// hasSummarizationConfigured export) exist in devlensio >= 1.0.4. The CLI is
// written to run correctly on BOTH: importing a symbol an older engine does
// not export would SyntaxError the whole module graph, and the 1-arg
// resolveConfig of older engines validates eagerly.
//
// Contract of both helpers (identical on old and new engines):
//   resolveTolerant()      → NEVER throws for an incomplete summarization
//                            config; throws ONLY when config.json itself is
//                            unreadable (invalid JSON), so corrupt-file errors
//                            still surface to the user.
//   summarizationConfigured() → never throws; true only when the active
//                            provider can actually run (has a key, or needs
//                            none). Used by the server to auto-skip
//                            summarization for keyless machines.
//
// On the old engine the fallback reconstructs a display config by reading
// ~/.devlens/config.json directly (flat and multi-provider shapes) — that
// read is ONLY used on the old-engine error path; the new engine never
// reaches it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveConfig,
  findProvider,
  type DevLensConfig,
  type ProviderConfigEntry,
} from "devlensio";

type MaybeOptsResolve = (
  req?: Request,
  opts?: { validate?: boolean },
) => DevLensConfig;

const resolve = resolveConfig as unknown as MaybeOptsResolve;

function rawActiveEntry(): ProviderConfigEntry | undefined {
  try {
    const file = path.join(os.homedir(), ".devlens", "config.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      summarization?: Record<string, unknown>;
    };
    const s = raw.summarization;
    if (!s || typeof s !== "object") return undefined;
    if (typeof s.active === "string" && s.providers && typeof s.providers === "object") {
      const providers = s.providers as Record<string, ProviderConfigEntry>;
      return providers[s.active] ?? Object.values(providers)[0];
    }
    if (typeof s.provider === "string") {
      return s as unknown as ProviderConfigEntry;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function resolveTolerant(req?: Request): DevLensConfig {
  try {
    return resolve(req, { validate: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid JSON")) throw err;

    const entry = rawActiveEntry();
    return {
      deploymentMode: "local",
      summarization: {
        provider: (entry?.provider === "anthropic" ? "anthropic" : "openai") as "openai" | "anthropic",
        providerName: entry?.providerName ?? entry?.provider,
        model: entry?.model ?? "",
        apiKey: entry?.apiKey,
        baseUrl: entry?.baseUrl,
        batchSize: entry?.batchSize ?? 50,
      },
      embedding: { provider: "openai", model: "text-embedding-3-small" },
    };
  }
}

export function summarizationConfigured(req?: Request): boolean {
  try {
    const cfg = resolveTolerant(req);
    const name = cfg.summarization.providerName ?? cfg.summarization.provider;
    if (name === "ollama") return false;
    const entry = findProvider(name);
    const needsKey = entry?.requiresKey ?? true;
    return !needsKey || !!cfg.summarization.apiKey;
  } catch {
    return false;
  }
}
