import type { Command } from "commander";
import { setJsonMode } from "./output.js";

// Attach shared global flags to a command and wire --json into output mode.
// Adding them per-command (rather than only on root) lets `devlens <cmd> --json`
// work with the flag positioned after the subcommand.
export function withGlobalFlags(cmd: Command): Command {
  return cmd
    .option("--json", "output machine-readable JSON")
    .option("-v, --verbose", "verbose diagnostics")
    .hook("preAction", (_thisCmd, actionCmd) => {
      setJsonMode(!!actionCmd.opts().json);
    });
}