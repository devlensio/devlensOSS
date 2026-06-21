import type { Command } from "commander";
import { withGlobalFlags } from "../options.js";
import { info } from "../output.js";
import { configInteractive } from "./config.js";

// `devlens init` — first-time setup: configure the LLM provider.
export function registerInitCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("init")
      .description("First-time setup: configure your LLM provider for summarization")
      .action(async () => {
        info("Welcome to DevLens. Let's configure summarization.");
        info("(Using Ollama? Provider 'ollama' needs no API key.)");
        await configInteractive();
      })
  );
}