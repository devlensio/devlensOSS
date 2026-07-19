import type { Command } from "commander";
import { setJsonMode, setQuietMode, setVerboseMode } from "./output.js";

// Attach shared global flags to a command and wire them into output modes.
// Adding them per-command (rather than only on root) lets `devlens <cmd> --json`
// work with the flag positioned after the subcommand.
export function withGlobalFlags(cmd: Command): Command {
  return cmd
    .option("--json", "output machine-readable JSON")
    .option("-v, --verbose", "verbose diagnostics")
    .option("--quiet", "suppress all non-error output")
    .hook("preAction", (_thisCmd, actionCmd) => {
      const opts = actionCmd.opts();
      setJsonMode(!!opts.json);
      setQuietMode(!!opts.quiet);
      setVerboseMode(!!opts.verbose);
    });
}
