import fs   from "fs";
import path from "path";
import os   from "os";
import {
  type DevLensConfig,
  type Neo4jConfig,
  OLLAMA_DEFAULTS,
  ANTHROPIC_DEFAULTS,
} from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CONFIG_DIR  = path.join(os.homedir(), ".devlens");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ─── Environment Variable Names ───────────────────────────────────────────────
//
// For Docker users who prefer env vars over config files.
// A Docker user running Ollama in the same network would set:
//   DEVLENS_LLM_PROVIDER=ollama
//   DEVLENS_LLM_BASE_URL=http://ollama:11434
//
// Priority: config file wins over env vars.
// Env vars only fill fields that the config file left empty.

export const ENV = {
  // Summarization
  LLM_PROVIDER:  "DEVLENS_LLM_PROVIDER",    //here DEVLENS_LLM_PROVIDER is the actual env variable
  LLM_MODEL:     "DEVLENS_LLM_MODEL",
  LLM_KEY:       "DEVLENS_LLM_KEY",
  LLM_BASE_URL:  "DEVLENS_LLM_BASE_URL",
  BATCH_SIZE:    "DEVLENS_BATCH_SIZE",

  // Embedding
  EMBED_PROVIDER: "DEVLENS_EMBED_PROVIDER",
  EMBED_MODEL:    "DEVLENS_EMBED_MODEL",
  EMBED_KEY:      "DEVLENS_EMBED_KEY",
  EMBED_BASE_URL: "DEVLENS_EMBED_BASE_URL",

  // Neo4j
  NEO4J_URL:      "DEVLENS_NEO4J_URL",
  NEO4J_USER:     "DEVLENS_NEO4J_USER",
  NEO4J_PASSWORD: "DEVLENS_NEO4J_PASSWORD",
  NEO4J_STORECODE: "NEO4J_STORE_CODE"
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
//
// DeepPartial allows users to only specify what they want to override.
// Every field at every level is optional in config.json.

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type PartialConfig = DeepPartial<DevLensConfig>;

// ─── Deep Merge ───────────────────────────────────────────────────────────────
//
// Merges user's partial config on top of defaults.
// Does NOT mutate either argument — returns a new object.
//
// Example:
//   base:    { summarization: { provider: "anthropic", model: "haiku", batchSize: 50 } }
//   partial: { summarization: { apiKey: "sk-ant-..." } }
//   result:  { summarization: { provider: "anthropic", model: "haiku",
//                               batchSize: 50, apiKey: "sk-ant-..." } }

function deepMerge(base: DevLensConfig, partial: PartialConfig): DevLensConfig {
  return {
    deploymentMode: partial.deploymentMode ?? base.deploymentMode,

    summarization: {
      ...base.summarization,
      ...partial.summarization,
    },

    embedding: {
      ...base.embedding,
      ...partial.embedding,
    },

    // Neo4j: if user provides any neo4j fields, merge on top of base.
    // If user provides nothing, keep base (which may be undefined).
    neo4j: partial.neo4j
      ? { ...(base.neo4j ?? {} as Neo4jConfig), ...partial.neo4j }
      : base.neo4j,
  };
}

// ─── Env Var Application ──────────────────────────────────────────────────────
//
// Applies environment variables onto an already-merged config.
// Only fills fields that are still empty after the file merge.
// Config file always wins — env vars never override explicit file values.
//
// This runs AFTER deepMerge so the priority is:
//   config file > env vars > defaults

function applyEnvVars(config: DevLensConfig): DevLensConfig {
  const s = config.summarization;
  const e = config.embedding;
  return {
    ...config,
    summarization: {
      ...s,
      // Only inject env var if config file didn't already set this field
      provider:  s.provider  !== ANTHROPIC_DEFAULTS.summarization.provider
                   ? s.provider
                   : (process.env[ENV.LLM_PROVIDER]  as typeof s.provider) ?? s.provider,
      model:     s.model ?? process.env[ENV.LLM_MODEL],
      apiKey:    s.apiKey   ?? process.env[ENV.LLM_KEY],
      baseUrl:   s.baseUrl  ?? process.env[ENV.LLM_BASE_URL],
      batchSize: s.batchSize ?? (parseInt(process.env[ENV.BATCH_SIZE] ?? "", 10) ?? s.batchSize),
    },

    embedding: {
      ...e,
      provider:  e.provider !== ANTHROPIC_DEFAULTS.embedding.provider
                   ? e.provider
                   : (process.env[ENV.EMBED_PROVIDER] as typeof e.provider) ?? e.provider,
      model:     e.model ?? process.env[ENV.EMBED_MODEL],
      apiKey:    e.apiKey   ?? process.env[ENV.EMBED_KEY],
      baseUrl:   e.baseUrl  ?? process.env[ENV.EMBED_BASE_URL],
    },

    // Neo4j: only build from env vars if config file didn't set it
    // AND all three required env vars are present
    neo4j: config.neo4j ?? buildNeo4jFromEnv(),
  };
}

// Builds a Neo4jConfig purely from env vars.
// Returns undefined if any of the three required vars is missing —
// we never create a partial Neo4j config.
function buildNeo4jFromEnv(): Neo4jConfig | undefined {
  const url      = process.env[ENV.NEO4J_URL];
  const username = process.env[ENV.NEO4J_USER];
  const password = process.env[ENV.NEO4J_PASSWORD];
  const storeRawCode = process.env[ENV.NEO4J_STORECODE]=="true";

  if (!url || !username || !password) return undefined;

  return { url, username, password, storeRawCode };
}

// ─── Validation ───────────────────────────────────────────────────────────────
//
// Only validates what cannot have a sensible default.
// apiKey is required for all cloud providers (anthropic, openai, openrouter, gemini).
// ollama needs no apiKey — it uses baseUrl.
// managed never needs an apiKey — platform provides it via request headers.
//
// Error messages are actionable — they tell the user exactly how to fix the problem.

const PROVIDERS_NEEDING_KEY = new Set([
  "anthropic",
  "openai",
  "openrouter",
  "gemini",
]);

function validate(config: DevLensConfig): void {
  const { summarization, embedding } = config;
  // Summarization apiKey
  if (
    PROVIDERS_NEEDING_KEY.has(summarization.provider) &&
    !summarization.apiKey
  ) {
    throw new Error(
      `DevLens config error: summarization.apiKey is required when provider is "${summarization.provider}".\n` +
      `  Fix option 1 — add to ${CONFIG_FILE}:\n` +
      `    { "summarization": { "apiKey": "your-key-here" } }\n` +
      `  Fix option 2 — set environment variable:\n` +
      `    ${ENV.LLM_KEY}=your-key-here \n` +
      `Fix option 3 - Skip Summarization`
    );
  }

  // Embedding apiKey — only validate if the user explicitly configured embedding.
  // If the user only set summarization, embedding may still be at default (openai
  // with no key) which is fine — embedding is only needed for vector search (cloud).
  const rawFile = readFileConfig();
  const userSetEmbedding = !!rawFile.embedding?.provider;
  if (
    userSetEmbedding &&
    PROVIDERS_NEEDING_KEY.has(embedding.provider) &&
    !embedding.apiKey
  ) {
    throw new Error(
      `DevLens config error: embedding.apiKey is required when provider is "${embedding.provider}".\n` +
      `  Fix option 1 — add to ${CONFIG_FILE}:\n` +
      `    { "embedding": { "apiKey": "your-key-here" } }\n` +
      `  Fix option 2 — set environment variable:\n` +
      `    ${ENV.EMBED_KEY}=your-key-here`
    );
  }

  // Neo4j — if any field is provided, all three must be present
  if (config.neo4j) {
    const { url, username, password } = config.neo4j;
    if (!url || !username || !password) {
      throw new Error(
        `DevLens config error: neo4j config is incomplete.\n` +
        `  All three fields are required: url, username, password.\n` +
        `  Fix option 1 — update ${CONFIG_FILE}:\n` +
        `    { "neo4j": { "url": "bolt://localhost:7687", "username": "neo4j", "password": "..." } }\n` +
        `  Fix option 2 — set environment variables:\n` +
        `    ${ENV.NEO4J_URL}=bolt://localhost:7687\n` +
        `    ${ENV.NEO4J_USER}=neo4j\n` +
        `    ${ENV.NEO4J_PASSWORD}=your-password`
      );
    }
  }

  // Ollama baseUrl format
  if (summarization.provider === "ollama") {
    const base = summarization.baseUrl ?? "http://localhost:11434";
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      throw new Error(
        `DevLens config error: summarization.baseUrl must start with http:// or https://.\n` +
        `  Got: "${base}"`
      );
    }
  }
}

// ─── readFileConfig ───────────────────────────────────────────────────────────
//
// Reads ~/.devlens/config.json and returns a PartialConfig.
// Returns empty object if file doesn't exist — first run, caller uses defaults.
// Throws a clear parse error if file exists but contains invalid JSON.

function readFileConfig(): PartialConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {}; // first run — no config file yet
  }

  const raw = fs.readFileSync(CONFIG_FILE, "utf-8");

  try {
    return JSON.parse(raw) as PartialConfig;
  } catch {
    throw new Error(
      `DevLens config error: ${CONFIG_FILE} contains invalid JSON.\n` +
      `  Fix the syntax and restart DevLens.\n` +
      `  Tip: use a JSON validator at https://jsonlint.com`
    );
  }
}

// ─── loadFileConfig ───────────────────────────────────────────────────────────
//
// Public entry point — called by resolveConfig() in config/index.ts.
//
// Takes the active defaults (chosen by detectOllama() in index.ts):
//   - OLLAMA_DEFAULTS    if Ollama is running at startup
//   - ANTHROPIC_DEFAULTS if Ollama is not detected
//
// Steps:
//   1. Read ~/.devlens/config.json  (partial — only what user set)
//   2. Deep merge onto provided defaults
//   3. Apply env vars for any still-missing fields
//   4. Validate — throw clear errors for anything missing or invalid
//   5. Return fully resolved DevLensConfig — never partial, never undefined fields

export function loadFileConfig(
  defaults: DevLensConfig = ANTHROPIC_DEFAULTS
): DevLensConfig {
  const partial = readFileConfig();
  const merged  = deepMerge(defaults, partial);
  const withEnv = applyEnvVars(merged);

  validate(withEnv);

  return withEnv;
}