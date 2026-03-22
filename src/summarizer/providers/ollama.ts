import { OpenAIClient } from "./openai";
import { LLMClient, LLMRequest, NodeSummaryOutput } from "./types";

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

// ─── OllamaClient ─────────────────────────────────────────────────────────────
//
// Ollama exposes an OpenAI-compatible API at /v1 — wraps OpenAIClient.
// No API key needed for local usage — passes a placeholder to satisfy the SDK.
// baseURL is configurable for users running Ollama on a non-default port or host.
// /v1 is always appended — user-provided baseURL should not include it.

export class OllamaClient implements LLMClient {
  readonly provider = "ollama" as const;
  readonly model:     string;

  private inner: OpenAIClient;

  constructor(model: string, baseURL?: string) {
    this.model = model;
    const base = (baseURL ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.inner = new OpenAIClient(
      "ollama",       // placeholder — Ollama doesn't validate the key
      model,
      `${base}/v1`
    );
  }

  summarize(request: LLMRequest): Promise<NodeSummaryOutput> {
    return this.inner.summarize(request);
  }

  validateConnection(): Promise<void> {
    return this.inner.validateConnection();
  }
}