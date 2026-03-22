import OpenAI from "openai";
import { LLMClient, LLMRequest, NodeSummaryOutput } from "./types";

// ─── Response Parser ──────────────────────────────────────────────────────────
//
// Same XML format as anthropic.ts — consistent across all providers.
// Prompt in prompts.ts always requests this format regardless of provider.

const VALID_SEVERITIES = new Set(["none", "low", "medium", "high"]);

function parseXmlTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

function parseResponse(raw: string): NodeSummaryOutput {
  const technicalSummary = parseXmlTag(raw, "technical");
  const businessSummary  = parseXmlTag(raw, "business");
  const severityRaw      = parseXmlTag(raw, "security_severity").toLowerCase();
  const securitySummary  = parseXmlTag(raw, "security_summary");

  const severity = VALID_SEVERITIES.has(severityRaw)
    ? severityRaw as "none" | "low" | "medium" | "high"
    : "none";

  return {
    technicalSummary: technicalSummary || raw.trim(),
    businessSummary:  businessSummary  || "",
    security: {
      severity,
      summary: severity === "none" ? "" : securitySummary,
    },
    tokensUsed: 0,
  };
}

// Also used as the base for OpenRouter and Ollama —
// both expose OpenAI-compatible APIs, just with a different baseURL.

export class OpenAIClient implements LLMClient {
  readonly provider = "openai" as const;
  readonly model:     string;

  private client: OpenAI;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.model  = model;
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async summarize(request: LLMRequest): Promise<NodeSummaryOutput> {
    const response = await this.client.chat.completions.create({
      model:       this.model,
      temperature: request.temperature ?? 0,
      max_tokens:  request.maxTokens   ?? 1024,
      messages:    request.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const raw    = response.choices[0]?.message?.content ?? "";
    const result = parseResponse(raw);
    result.tokensUsed = response.usage
      ? (response.usage.prompt_tokens + response.usage.completion_tokens)
      : 0;

    return result;
  }

  async validateConnection(): Promise<void> {
    try {
      await this.client.chat.completions.create({
        model:      this.model,
        max_tokens: 10,
        messages:   [{ role: "user", content: "hi" }],
      });
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      if (status === 401) throw new Error(`API key is invalid or missing. Check your key in config.`);
      if (status === 403) throw new Error(`API key does not have permission to use model "${this.model}".`);
      if (status === 404) throw new Error(`Model "${this.model}" not found. Check model name in config.`);
      if (status === 429) throw new Error(`Rate limit hit during connection check. Try again shortly.`);
      throw new Error(`LLM connection failed: ${err?.message ?? "unknown error"}`);
    }
  }
}