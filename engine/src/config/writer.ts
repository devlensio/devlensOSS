//! The concept of local config file should only exist in open Source, and in case of deployment the apis for writing this cofig file should never be exposed. 

import fs   from "fs";
import { CONFIG_FILE, CONFIG_DIR } from "./providers/file";
import type { DevLensConfig } from "./types";


// What the user can send from the settings UI.
// Every field is optional — user only sends what they changed.
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type PartialConfig = DeepPartial<DevLensConfig>;

// What GET /api/config safely returns to the frontend.
// apiKeys are masked — the browser never sees the full key.
export interface SafeConfig {
  deploymentMode: DevLensConfig["deploymentMode"];
  summarization: {
    provider:  string;
    model:     string;
    baseUrl?:  string;
    batchSize: number;
    apiKeyHint?: string;  // e.g. "sk-ant-...3Kp" — last 3 chars only
  };
  embedding: {
    provider:  string;
    model:     string;
    baseUrl?:  string;
    apiKeyHint?: string;
  };
  neo4j?: {
    url:      string;
    username: string;
    storeRawCode: boolean;
    // password never returned — not even a hint
  };
}



function readRawFile(): PartialConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as PartialConfig;
  } catch {
    console.warn(`DevLens: config file is malformed, resetting to empty.`);
    return {};
  }
}

//  atomicWrite 
// Writes to a temp file first, then renames to the real path.
// If the server crashes mid-write, the old config survives intact.

function atomicWrite(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}

//  writeConfig ─
//
// Public — called by PATCH /api/config handler.
//
// Takes only what the user changed from the UI settings form.
// Merges it on top of whatever is currently in config.json.
// Writes the result back atomically.
//
// Does NOT merge with defaults or env vars — that is file.ts's job at read time.
// The file only ever contains what the user explicitly set.

export function writeConfig(partial: PartialConfig): void {
  // Ensure ~/.devlens/ exists — creates it on first save
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const existing = readRawFile();
  const updated: PartialConfig = {
    ...existing,

    // Only merge blocks that the user actually touched
    ...(partial.deploymentMode && {
      deploymentMode: partial.deploymentMode,
    }),

    ...(partial.summarization && {
      summarization: {
        ...existing.summarization,
        ...partial.summarization,
      },
    }),

    ...(partial.embedding && {
      embedding: {
        ...existing.embedding,
        ...partial.embedding,
      },
    }),

    // neo4j: if user sent it, merge. If user sent null explicitly, delete it.
    // undefined means "don't touch it"
    ...(partial.neo4j !== undefined && {
      neo4j: partial.neo4j === null
        ? undefined            // user explicitly removed Neo4j config
        : {
            ...existing.neo4j,
            ...partial.neo4j,
          },
    }),
  };

  atomicWrite(CONFIG_FILE, JSON.stringify(updated, null, 2));
}

function maskKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  // Show last 3 characters only — enough to identify which key is set
  return `...${key.slice(-3)}`;
}

//  maskConfig 
// Public — called by GET /api/config handler.
export function maskConfig(config: DevLensConfig): SafeConfig {
  return {
    deploymentMode: config.deploymentMode,

    summarization: {
      provider:    config.summarization.provider,
      model:       config.summarization.model,
      baseUrl:     config.summarization.baseUrl,
      batchSize:   config.summarization.batchSize,
      apiKeyHint:  maskKey(config.summarization.apiKey),
    },

    embedding: {
      provider:   config.embedding.provider,
      model:      config.embedding.model,
      baseUrl:    config.embedding.baseUrl,
      apiKeyHint: maskKey(config.embedding.apiKey),
    },

    // neo4j: return url, storeCode, and username only — password never sent to browser
    ...(config.neo4j && {
      neo4j: {
        url:      config.neo4j.url,
        username: config.neo4j.username,
        storeRawCode: config.neo4j.storeRawCode,
      },
    }),
  };
}