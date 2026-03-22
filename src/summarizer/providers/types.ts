import { LLMProvider } from "../../config/types";


// system — sets behavior/instructions ("you are a code analyzer...")
// user — the actual input (the code + context)
export interface LLMMessage {
    role: "user" | "assistant" | "system";  // The assistance role here will never be used for the summarization, it is generally used for the multi turn and previous model responses.
    content: string;
}

export interface LLMRequest {
    messages: LLMMessage[];
    temperature?: number;   // defaults to 0 — deterministic summaries
    maxTokens?: number;     // defaults to provider max
}


// I am keeping security summary for any vulnerabilities in the code. It does not validates the flow or any other node. Since it is derived only from the function and details of the current node being summarized, it will only check for issues in the current node. It is absolutely unaware of the nodes besides the current node. If as a contributor you can come up with better edge detection capability without making architecture more complex, please feel free to make changes and raise PR.
export interface SecuritySummary {
    severity :  "none" | "low" | "medium" | "high";
    summary: string;    
}

export interface NodeSummaryOutput {
    technicalSummary: string;
    businessSummary:  string;
    security: SecuritySummary;
    tokensUsed:       number;  // input + output combined — 0 if provider doesn't expose it

}

export interface LLMClient {
    readonly provider: LLMProvider;
    readonly model: string;
    summarize(request: LLMRequest): Promise<NodeSummaryOutput>;  // Summarize a single node — called once per node in the batch loop.
  // Internally builds the prompt, calls the LLM, parses the response.
  // Throws on non-retryable errors (bad key, model not found).
  // Throws on retryable errors too — caller handles retry logic.
    validateConnection(): Promise<void>;
}

export type LLMClientFactory = (config: {
    provider: LLMProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
}) => LLMClient;