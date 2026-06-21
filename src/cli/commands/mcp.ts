import type { Command } from "commander";
import { startMcpStdio, startMcpHttp } from "../../mcp/index.js";

// `devlens mcp`        → stdio (what an editor / MCP client spawns)
// `devlens mcp http`   → Streamable HTTP (foreground; background it yourself)
export function registerMcpCommand(program: Command): void {
  const mcp = program.command("mcp").description("Run the DevLens MCP server");

  mcp
    .command("stdio", { isDefault: true })
    .description("Run the MCP server over stdio (for editor / MCP-client integration)")
    .action(async () => {
      await startMcpStdio(); // long-running; owns stdout for JSON-RPC
    });

  mcp
    .command("http")
    .description("Run the MCP server over Streamable HTTP (foreground; background with pm2/systemd/&)")
    .option("-p, --port <port>", "port to listen on", "7000")
    .action(async (o) => {
      await startMcpHttp({ port: parseInt(o.port, 10) }); // long-running
    });
}