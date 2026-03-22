import { CodeNode } from "../types";
import { LLMClient, LLMMessage, NodeSummaryOutput } from "./providers/types";
import { MAPREDUCE_TOKEN_THRESHOLD } from "./types";

// ─── Token Estimation ─────────────────────────────────────────────────────────
//
// 1 token ≈ 4 characters — standard rule of thumb, accurate enough for
// threshold checks. Avoids adding a full tokenizer dependency.

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function exceedsThreshold(node: CodeNode): boolean {
  if (!node.rawCode) return false;
  return estimateTokens(node.rawCode) > MAPREDUCE_TOKEN_THRESHOLD;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
//
// Splits rawCode into chunks by line — never cuts mid-line.
// Each chunk targets MAPREDUCE_TOKEN_THRESHOLD tokens.
// Overlap of 10 lines between chunks preserves context at boundaries.

const CHUNK_OVERLAP_LINES = 10;

function chunkCode(rawCode: string): string[] {
  const lines      = rawCode.split("\n");
  const chunks:      string[] = [];
  const targetLines = Math.floor(MAPREDUCE_TOKEN_THRESHOLD * 4 / 50); // ~50 chars avg per line

  let start = 0;
  while (start < lines.length) {
    const end   = Math.min(start + targetLines, lines.length);
    const chunk = lines.slice(start, end).join("\n");
    chunks.push(chunk);

    if (end === lines.length) break;
    start = end - CHUNK_OVERLAP_LINES; // overlap for context continuity
  }

  return chunks;
}

// ─── Map Phase ────────────────────────────────────────────────────────────────
//
// Summarizes each chunk individually.
// Chunk summaries are purely technical — no business/security analysis yet.
// That happens in the reduce phase where the full picture is available.

function buildChunkMessages(
  chunk:      string,
  chunkIndex: number,
  totalChunks: number,
  nodeName:   string,
  systemPrompt: string,
): LLMMessage[] {
  return [
    { role: "system", content: systemPrompt },
    {
      role: "user", content:
        `You are summarizing chunk ${chunkIndex + 1} of ${totalChunks} from a large code node named "${nodeName}".\n` +
        `Provide a concise technical summary of what this chunk does. No business or security analysis yet.\n\n` +
        `\`\`\`\n${chunk}\n\`\`\``
    },
  ];
}

// ─── Reduce Phase ─────────────────────────────────────────────────────────────
//
// Takes all chunk summaries and produces the final NodeSummaryOutput.
// Uses the same XML format as single-node summarization — consistent parsing.

function buildReduceMessages(
  chunkSummaries: string[],
  nodeName:       string,
  systemPrompt:   string,
): LLMMessage[] {
  const summaryList = chunkSummaries
    .map((s, i) => `Chunk ${i + 1}:\n${s}`)
    .join("\n\n");

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user", content:
        `The following are chunk summaries of a large code node named "${nodeName}".\n` +
        `Based on these summaries, produce the final complete summary in the required XML format.\n\n` +
        `${summaryList}`
    },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Summarizes a node that exceeds the token threshold via map-reduce.
// Called from the batch loop instead of buildPrompt when exceedsThreshold() is true.
export async function mapreduceSummarize(
  node:        CodeNode,
  client:      LLMClient,
  systemPrompt: string,
): Promise<NodeSummaryOutput> {
  const rawCode = node.rawCode ?? "";
  const chunks  = chunkCode(rawCode);

  // ── Map phase — summarize each chunk in parallel ──────────────
  const chunkResults = await Promise.all(
    chunks.map((chunk, i) => {
      const messages = buildChunkMessages(chunk, i, chunks.length, node.name, systemPrompt);
      return client.summarize({ messages, temperature: 0 });
    })
  );

  const chunkSummaries = chunkResults.map(r => r.technicalSummary);
  const totalTokensUsed = chunkResults.reduce((sum, r) => sum + r.tokensUsed, 0);

  // ── Reduce phase — combine chunk summaries into final output ──
  const reduceMessages = buildReduceMessages(chunkSummaries, node.name, systemPrompt);
  const finalResult    = await client.summarize({ messages: reduceMessages, temperature: 0 });

  return {
    ...finalResult,
    tokensUsed: totalTokensUsed + finalResult.tokensUsed,
  };
}