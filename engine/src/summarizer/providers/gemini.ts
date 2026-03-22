import { GoogleGenAI } from "@google/genai";
import { LLMClient, LLMRequest, NodeSummaryOutput } from "./types";

// ─── Response Parser ──────────────────────────────────────────────────────────
//
// Same XML format as all other providers — consistent across the board.

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



export class GeminiClient implements LLMClient {
  readonly provider = "gemini" as const;
  readonly model:     string;

  private ai: GoogleGenAI;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.ai    = new GoogleGenAI({ apiKey });
  }

  async summarize(request: LLMRequest): Promise<NodeSummaryOutput> {
    const systemMessage = request.messages.find(m => m.role === "system");
    const userMessages  = request.messages.filter(m => m.role !== "system");

    const contents = userMessages.map(m => ({
      role:  "user" as const,
      parts: [{ text: m.content }],
    }));

    const response = await this.ai.models.generateContent({
      model:    this.model,
      contents,
      config: {
        systemInstruction: systemMessage?.content,
        temperature:       request.temperature ?? 0,
        maxOutputTokens:   request.maxTokens   ?? 1024,
      },
    });

    const raw    = response.text ?? "";
    const result = parseResponse(raw);
    result.tokensUsed =
      (response.usageMetadata?.promptTokenCount     ?? 0) +
      (response.usageMetadata?.candidatesTokenCount ?? 0);

    return result;
  }

  async validateConnection(): Promise<void> {
    try {
      await this.ai.models.generateContent({
        model:    this.model,
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        config:   { maxOutputTokens: 10 },
      });
    } catch (err: any) {
      const status  = err?.status ?? err?.statusCode ?? err?.code;
      const message = err?.message ?? "";

      if (status === 400 || message.includes("API_KEY_INVALID") || message.includes("invalid api key"))
        throw new Error(`Gemini API key is invalid or missing. Check your key in config.`);
      if (status === 403 || message.includes("PERMISSION_DENIED"))
        throw new Error(`Gemini API key does not have permission to use model "${this.model}".`);
      if (status === 404 || message.includes("models/") || message.includes("not found"))
        throw new Error(`Gemini model "${this.model}" not found. Check model name in config.`);
      if (status === 429 || message.includes("RESOURCE_EXHAUSTED"))
        throw new Error(`Gemini rate limit hit during connection check. Try again shortly.`);
      throw new Error(`Gemini connection failed: ${message || "unknown error"}`);
    }
  }
}