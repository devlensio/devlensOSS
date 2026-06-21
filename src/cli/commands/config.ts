import * as readline from "node:readline/promises";
import type { Command } from "commander";
import { resolveConfig, maskConfig, writeConfig } from "devlensio";
import type { LLMProvider } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, success, info } from "../output.js";

// `devlens config` — show config; with flags or --set, update it.
export function registerConfigCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("config")
      .description("Show or update DevLens configuration (~/.devlens/config.json)")
      .option("--set", "interactively set summarization configuration")
      .option("--provider <p>", "summarization provider (anthropic|openai|openrouter|gemini|ollama)")
      .option("--model <m>", "summarization model")
      .option("--api-key <k>", "summarization API key")
      .option("--base-url <u>", "base URL (e.g. http://localhost:11434 for Ollama)")
      .option("--batch-size <n>", "summarization batch size")
      .action(async (opts) => {
        const hasFlagUpdate = opts.provider || opts.model || opts.apiKey || opts.baseUrl || opts.batchSize;

        if (hasFlagUpdate) {
          writeConfig({
            summarization: {
              ...(opts.provider && { provider: opts.provider as LLMProvider }),
              ...(opts.model && { model: opts.model }),
              ...(opts.apiKey && { apiKey: opts.apiKey }),
              ...(opts.baseUrl && { baseUrl: opts.baseUrl }),
              ...(opts.batchSize && { batchSize: parseInt(opts.batchSize, 10) }),
            },
          });
          success("Config updated.");
        } else if (opts.set) {
          await configInteractive();
        }

        // Always show the (masked) current config.
        emit(maskConfig(resolveConfig()));
      })
  );
}

export async function configInteractive(): Promise<void> {
  // Prompts go to stderr so stdout stays clean / pipeable.
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const cur = resolveConfig().summarization;
    info("Configure summarization (press Enter to keep current value):");

    const provider = (await rl.question(`  provider [${cur.provider}]: `)).trim() || cur.provider;
    const model = (await rl.question(`  model [${cur.model}]: `)).trim() || cur.model;
    const apiKey = (await rl.question(`  API key [keep existing]: `)).trim();
    const baseUrl = (await rl.question(`  base URL [${cur.baseUrl ?? "none"}]: `)).trim();

    writeConfig({
      summarization: {
        provider: provider as LLMProvider,
        model,
        ...(apiKey && { apiKey }),
        ...(baseUrl && { baseUrl }),
      },
    });
    success("Config saved.");
  } finally {
    rl.close();
  }
}