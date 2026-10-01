// Shared dummy config for structure-only analysis (Phase 1).
//
// Phase 1 — analysis — never reads the summarization/embedding config; only
// Phase 2 (summarization) does. When a job runs with skipSummarization=true
// we hand the engine this placeholder instead of resolving the user's config,
// so an incomplete/missing LLM config can NEVER block analysis
// (GitHub issue devlensio/devlensOSS#10). Used by BOTH the CLI jobRunner and
// the HTTP server's analyze handler.
import type { DevLensConfig } from "devlensio";

export const SKIP_SUMMARIZATION_CONFIG: DevLensConfig = {
  deploymentMode: "local",
  summarization: {
    provider: "openai",
    model: "none",
    batchSize: 50,
  },
  embedding: {
    provider: "openai",
    model: "none",
  },
};
