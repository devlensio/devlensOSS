import { OpenAIClient } from "./openai";
import type { LLMClient, LLMRequest, NodeSummaryOutput } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// ─── OpenRouterClient ─────────────────────────────────────────────────────────
//
// OpenRouter exposes an OpenAI-compatible API — no new logic needed.
// Just wraps OpenAIClient with the correct baseURL and overrides provider. (OpenAI actually set the industry standard for the response of the LLMs through API.Everyone follows the OpenAI standard,  Aside of course Anthropic, because its anthropic, who even go against pentagon.)

export class OpenRouterClient implements LLMClient {
  readonly provider = "openrouter" as const;
  readonly model:     string;

  private inner: OpenAIClient;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.inner = new OpenAIClient(apiKey, model, OPENROUTER_BASE_URL);
  }

  summarize(request: LLMRequest): Promise<NodeSummaryOutput> {
    return this.inner.summarize(request);
  }

  validateConnection(): Promise<void> {
    return this.inner.validateConnection();
  }
}