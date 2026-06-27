#!/usr/bin/env bun
/// <reference types="bun" />
import { Command } from "commander";
import { registerReposCommand } from "./commands/repos.js";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerSummarizeCommand } from "./commands/summarize.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerQueryCommands } from "./commands/query.js";
import { registerGraphsCommand } from "./commands/graphs.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInitCommand } from "./commands/init.js";

const program = new Command();

program
  .name("devlens")
  .description("DevLens — codebase intelligence for TS/JS/React/Next.js/Node repositories")
  .version("0.2.7");

//  Command groups 
// Core lifecycle
registerAnalyzeCommand(program);
registerSummarizeCommand(program);
registerConfigCommand(program);
registerServeCommand(program);
// Discovery
registerReposCommand(program);
// Query (mirror the MCP tools)
registerQueryCommands(program);
registerGraphsCommand(program);
// MCP server
registerMcpCommand(program);
// Utilities
registerStatusCommand(program);
registerDoctorCommand(program);
registerInitCommand(program);
// TUI group mounts here in the next step.

// Bare `devlens` → launch the interactive TUI (Part H). For now, show help.
program.action(() => {
  program.help();
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});