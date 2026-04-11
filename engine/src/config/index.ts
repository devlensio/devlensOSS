import { type DevLensConfig, OLLAMA_DEFAULTS, ANTHROPIC_DEFAULTS } from "./types";
import { loadFileConfig } from "./providers/file";
import { applyRequestHeaders } from "./providers/request";

//  Ollama Detection 
//
// Pings Ollama's default endpoint at server startup.
// Used by resolveConfig() to choose which defaults to fall back to:
//   - Ollama running  → OLLAMA_DEFAULTS (free, private, zero API cost)
//   - Ollama absent   → ANTHROPIC_DEFAULTS (user must set apiKey)
//
// Uses a short timeout — we don't want server startup to hang for 30 seconds
// if Ollama is not installed. 2 seconds is enough for a local HTTP ping.
//
// Called ONCE at startup and the result is cached — see `cachedDefaults` below.

const OLLAMA_PING_URL    = "http://localhost:11434";
const OLLAMA_PING_TIMEOUT_MS = 2000;

export async function detectOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(
      () => controller.abort(),
      OLLAMA_PING_TIMEOUT_MS
    );

    const res = await fetch(OLLAMA_PING_URL, {
      signal: controller.signal,
      method: "GET",
    });

    clearTimeout(timeout);
    return res.ok;
  } catch {
    // Ollama not running, not installed, or timed out — all treated the same
    return false;
  }
}

//  Startup Initialization 
//
// detectOllama() is called once when the server starts (in server/index.ts).
// The result is stored here so resolveConfig() doesn't ping Ollama on
// every single request — that would be slow and noisy.
//
// initConfig() must be called before any request is handled.
// Until it is called, resolveConfig() falls back to ANTHROPIC_DEFAULTS safely.

let cachedDefaults: DevLensConfig = ANTHROPIC_DEFAULTS;
let initialized = false;

export async function initConfig(): Promise<void> {
  if (initialized) return;

  const ollamaRunning = await detectOllama();

  if (ollamaRunning) {
    cachedDefaults = OLLAMA_DEFAULTS;
    console.log("⚡ Ollama detected — using local LLM defaults");
    console.log(`   Summarization: ${OLLAMA_DEFAULTS.summarization.model}`);
    console.log(`   Embedding:     ${OLLAMA_DEFAULTS.embedding.model}`);
  } else {
    cachedDefaults = ANTHROPIC_DEFAULTS;
    console.log("☁️  Ollama not detected — using Anthropic defaults");
    console.log("   Add an apiKey to ~/.devlens/config.json to enable summarization");
    console.log(`   Or set ${(await import("./providers/file")).ENV.LLM_KEY}=your-key`);
  }

  initialized = true;
}

// This function reads config.json fresh on every call —
// so if the user edits settings in the UI, the next job picks up the change
// without requiring a server restart.

export function resolveConfig(req?: Request): DevLensConfig {
  // Step 1 — load file config merged with detected defaults + env vars
  const fileConfig = loadFileConfig(cachedDefaults);

 
  if (!req) return fileConfig;

  
  // In local mode, ignore headers even if present
  if (fileConfig.deploymentMode !== "cloud") return fileConfig;

  // Step 4 — apply header overrides for cloud users
  return applyRequestHeaders(fileConfig, req);
}

// Re-export everything consumers might need from one place
// so they only need to import from "config" not "config/types" etc.
export type { DevLensConfig } from "./types";
export type { SafeConfig }     from "./writer";
export { maskConfig, writeConfig } from "./writer";
export { CONFIG_FILE, CONFIG_DIR, ENV } from "./providers/file";
export { sanitizeHeaders, CONFIG_HEADERS } from "./types";
export { OLLAMA_DEFAULTS, ANTHROPIC_DEFAULTS } from "./types";