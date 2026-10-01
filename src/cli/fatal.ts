// Top-level error presentation — shared by the CLI entry's catch and tests.
//
// Rules (plan issues 1 + 2):
//   - ExitPromptError (Ctrl+C inside an inquirer prompt) is a USER ACTION:
//     one clean "Cancelled." line, exit 130 — never a stack trace.
//   - Everything else: the message only (stack only with --verbose);
//     --json puts {"error": msg} on stdout.

export interface FatalDeps {
  argv?: string[];
  writeErr(s: string): void;
  writeOut(s: string): void;
  exit(code: number): void;
}

const defaultDeps: FatalDeps = {
  argv: process.argv,
  writeErr: (s) => process.stderr.write(s),
  writeOut: (s) => process.stdout.write(s),
  exit: (c) => process.exit(c),
};

export function isExitPromptError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return e.name === "ExitPromptError" || /User force closed the prompt/.test(e.message ?? "");
}

export function handleFatal(err: unknown, deps: FatalDeps = defaultDeps): void {
  const argv = deps.argv ?? [];

  if (isExitPromptError(err)) {
    deps.writeErr("\nCancelled.\n");
    deps.exit(130);
    return;
  }

  const msg = err instanceof Error ? err.message : String(err);
  const wantsJson = argv.includes("--json");
  const verbose = argv.includes("--verbose") || argv.includes("-v");

  if (wantsJson) deps.writeOut(JSON.stringify({ error: msg }) + "\n");
  else deps.writeErr(`✖ ${msg}\n`);

  if (verbose && err instanceof Error && err.stack) deps.writeErr(err.stack + "\n");
  deps.exit(1);
}
