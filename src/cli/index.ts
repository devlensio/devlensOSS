#!/usr/bin/env bun
/// <reference types="bun" />
// IMPORT ORDER MATTERS: preload.ts must be the FIRST import. It synchronously
// materialises the embedded extractors and sets DEVLENS_EXTRACTORS_DIR before
// any module below pulls in `devlensio` (which resolves extractor paths at
// module-load time).
import "./preload.js";
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
import { registerDetectCommand } from "./commands/detect.js";
import { banner } from "./output.js";

const program = new Command();

// Keep in sync with the `version` field in package.json.
const CLI_VERSION = "0.5.2";

program
  .name("devlens")
  .description(
    "DevLens — codebase intelligence for TypeScript, JavaScript, Python, Go, Rust, and Java repos " +
      "(query a precomputed graph of nodes + typed edges instead of reading whole files)"
  )
  .version(CLI_VERSION);

// Show banner on startup (unless piped or quiet)
banner(CLI_VERSION);

//  Command groups 
// Core lifecycle
registerAnalyzeCommand(program);
registerSummarizeCommand(program);
registerConfigCommand(program);
registerServeCommand(program);
// Discovery
registerReposCommand(program);
registerDetectCommand(program);
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