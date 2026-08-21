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
const CLI_VERSION = "0.5.4";

program
  .name("devlens")
  .description(
    "DevLens — codebase intelligence for TypeScript, JavaScript, Python, Go, Rust, and Java repos " +
      "(query a precomputed graph of nodes + typed edges instead of reading whole files)"
  )
  .version(CLI_VERSION);

// ════════════════════════════════════════════════════════════════════════════
//  Per-command help examples — appended to each command's `--help` output.
//  Keyed by command name (unique across the CLI). Group commands (e.g. `graphs`)
//  also get an example that shows their typical subcommand usage.
// ════════════════════════════════════════════════════════════════════════════
const EXAMPLES: Record<string, string> = {
  analyze: `Examples:
  devlens analyze                                  analyze the current directory
  devlens analyze ./src                            analyze a specific repo
  devlens analyze ./my-repo --summarize            analyze + generate AI summaries
  devlens analyze . --json                         machine-readable output`,
  summarize: `Examples:
  devlens summarize .                              analyze + summarize current repo
  devlens summarize ./my-repo --model gpt-4o-mini  pick a specific model
  devlens summarize <graphId>                      re-summarize an existing graph`,
  config: `Examples:
  devlens config                                   show current configuration
  devlens config --set                             interactively configure provider/key
  devlens config --provider openai --provider-name deepseek --model deepseek-v4-flash
  devlens config --active openai:deepseek          switch the active provider
  devlens config --remove openai:my-custom         remove a provider entry`,
  serve: `Examples:
  devlens serve                                 API only — backend for MCP / skills
  devlens serve -p 8080                         start the API on a specific port`,
  repos: `Examples:
  devlens repos                                   list all analyzed repositories
  devlens repos --json                            list as JSON for automation`,
  detect: `Examples:
  devlens detect                                  detect language of current dir
  devlens detect ./my-repo --deps                 also include the full dependency list`,
  overview: `Examples:
  devlens overview                                repo fingerprint + most-central nodes
  devlens overview --graph <id>                   stats for a specific stored graph`,
  "top-nodes": `Examples:
  devlens top-nodes                               top 25 most-central nodes
  devlens top-nodes --limit 50 --json             top 50 as JSON`,
  "find-nodes": `Examples:
  devlens find-nodes auth                          nodes whose name contains "auth"
  devlens find-nodes --type FUNCTION,HOOK          only functions + hooks
  devlens find-nodes --dir ./src/features           nodes under a folder
  devlens find-nodes --severity high               security-flagged nodes`,
  "nodes-in-path": `Examples:
  devlens nodes-in-path src/index.ts               all nodes in one file
  devlens nodes-in-path src/features --type ROUTE    routes under a folder`,
  "get-node": `Examples:
  devlens get-node <nodeId>                        full detail for one node
  devlens get-node <nodeId> --include callers,callees
  devlens get-node <nodeId> --include technical,security`,
  "get-summaries": `Examples:
  devlens get-summaries <id1> <id2> <id3>           summaries for several nodes
  devlens get-summaries <id1> --include security     security summaries only`,
  "node-code": `Examples:
  devlens node-code <nodeId>                        raw source for a node (expensive)`,
  "blast-radius": `Examples:
  devlens blast-radius <nodeId>                     what breaks if I change this node
  devlens blast-radius <nodeId> --radius 3          traverse up to 3 hops`,
  khop: `Examples:
  devlens khop <nodeId>                            downstream dependencies of a node
  devlens khop <nodeId> --radius 3                  deeper dependency traversal`,
  subgraph: `Examples:
  devlens subgraph <seedNodeId>                     cohesive cluster around a seed node`,
  cycles: `Examples:
  devlens cycles                                   cyclic dependency groups (code smell)`,
  security: `Examples:
  devlens security                                 security-flagged nodes
  devlens security --min-severity high              only high-severity findings`,
  diff: `Examples:
  devlens diff <oldCommit> <newCommit>              what changed + blast radius
  devlens diff HEAD~1 HEAD`,
  "check-freshness": `Examples:
  devlens check-freshness                           is the graph stale vs HEAD?`,
  coverage: `Examples:
  devlens coverage                                 graph health: summarized / total / by type`,
  architecture: `Examples:
  devlens architecture                               one-call architecture brief
  devlens architecture --budget 16000                larger token budget for big repos`,
  "security-brief": `Examples:
  devlens security-brief                             one-call security report
  devlens security-brief --min-severity high        only high findings`,
  "review-pr": `Examples:
  devlens review-pr <from> <to>                      one-call PR review
  devlens review-pr main...feature-branch`,
  "onboard-tour": `Examples:
  devlens onboard-tour                               onboarding skeleton: modules, routes, flows`,
  "get-context": `Examples:
  devlens get-context "auth token refresh"           keyword-seeded context packet
  devlens get-context "database connection" --focus ./src/db
  devlens get-context "payment flow" --intent impact`,
  graphs: `Examples:
  devlens graphs list                               list all analyzed graphs
  devlens graphs delete <graphId>                   delete a stored graph`,
  list: `Examples:
  devlens graphs list                               list all analyzed graphs`,
  delete: `Examples:
  devlens graphs delete <graphId>                   delete a stored graph`,
  mcp: `Examples:
  devlens mcp stdio                                 serve MCP over stdio (editor integration)
  devlens mcp http --port 7000                      serve MCP over Streamable HTTP`,
  stdio: `Examples:
  devlens mcp stdio                                 serve MCP over stdio (editor integration)`,
  http: `Examples:
  devlens mcp http --port 7000                      serve MCP over Streamable HTTP`,
  status: `Examples:
  devlens status                                   what has been analyzed / summarized`,
  doctor: `Examples:
  devlens doctor                                   check git, storage, LLM provider, extractors`,
  init: `Examples:
  devlens init                                     first-time LLM provider setup`,
};

// Attach the example block to a command (and, recursively, its subcommands).
function attachExamples(cmd: Command): void {
  const text = EXAMPLES[cmd.name()];
  if (text) cmd.addHelpText("after", "\n" + text + "\n");
  for (const sub of cmd.commands) attachExamples(sub);
}

// `devlens -h <cmd>` / `devlens --help <cmd>` should show THAT command's help,
// not the root help. commander processes `-h` on the root immediately and exits,
// so we intercept the pattern before parsing and print the subcommand's help.
function interceptHelpWithCommand(): void {
  const argv = process.argv.slice(2);
  let seenPositional = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("-")) {
      if (tok === "-h" || tok === "--help") {
        if (seenPositional) return; // help belongs to a subcommand; commander handles it
        if (maybeShowHelp(program, argv.slice(i + 1))) process.exit(0);
        return; // no matching command — fall through to normal root-help handling
      }
      // skip options that consume a value so the value isn't mistaken for a command
      continue;
    }
    seenPositional = true;
  }
}

// Try to resolve the deepest command named by the tokens after `-h`/`--help`
// (handles both `devlens -h analyze` and `devlens -h graphs list`). Returns
// true if it found one and printed its help.
function maybeShowHelp(root: Command, tokens: string[]): boolean {
  const names = tokens.filter((t) => !t.startsWith("-"));
  for (let len = names.length; len >= 1; len--) {
    const target = findCommandPath(root, names.slice(0, len));
    if (target) {
      target.outputHelp();
      return true;
    }
  }
  return false;
}

// Resolve a command by path of names, e.g. ["graphs", "list"] -> graphs.list.
function findCommandPath(root: Command, names: string[]): Command | undefined {
  let current: Command | undefined = root;
  for (const name of names) {
    current = current.commands.find((c) => c.name() === name || c.aliases().includes(name));
    if (!current) return undefined;
  }
  return current;
}

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

// Append per-command usage examples to every command's help.
attachExamples(program);

// `devlens -h <cmd>` / `--help <cmd>` -> show that command's help instead of root help.
interceptHelpWithCommand();

// Bare `devlens` → launch the interactive TUI (Part H). For now, show help.
program.action(() => {
  program.help();
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});