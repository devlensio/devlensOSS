// providers/index.ts has one job — given the config, return the right LLMClient instance. It's the factory that the batch loop calls so it never has to know which provider is being used.

import { SummarizationConfig } from "../../config/types";
import { AnthropicClient } from "./anthropic";
import { GeminiClient } from "./gemini";
import { OllamaClient } from "./ollama";
import { OpenAIClient } from "./openai";
import { OpenRouterClient } from "./openRouter";
import { LLMClient } from "./types";


// ─── Factory ──────────────────────────────────────────────────────────────────
//
// Single entry point for the batch loop — returns the right LLMClient
// based on config. Caller never imports individual provider classes.
//
// Throws clearly if:
//   - provider is unknown
//   - apiKey is missing for cloud providers (fail fast before the batch loop)


export function createLLMClient(config: SummarizationConfig) : LLMClient {
    const {provider, model, apiKey, baseUrl} = config;

    switch(provider) {
        case "anthropic":
            if (!apiKey) throw new Error("Anthropic provider requires an API key");
            return new AnthropicClient(apiKey, model);
        case "openai":
      if (!apiKey) throw new Error("OpenAI provider requires an API key");
      return new OpenAIClient(apiKey, model);

        case "openrouter":
        if (!apiKey) throw new Error("OpenRouter provider requires an API key");
        return new OpenRouterClient(apiKey, model);

        case "gemini":
        if (!apiKey) throw new Error("Gemini provider requires an API key");
        return new GeminiClient(apiKey, model);

        case "ollama":
        return new OllamaClient(model, baseUrl);

        case "managed":
            // Cloud SaaS only — platform injects the key via request headers.
            // Should never reach here in local mode.
            throw new Error("Managed provider is only available in cloud mode");

        default: 
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
}