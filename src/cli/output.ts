// Central CLI output.
//   --json  → machine-readable JSON on stdout (for agents / scripts)
//   default → human-friendly text on stdout
// Diagnostics, progress, and errors ALWAYS go to stderr so stdout stays pipeable.

let jsonMode = false;

export function setJsonMode(on: boolean): void {
  jsonMode = on;
  if (on) {
    // Keep stdout clean for machine output: route stray engine/pipeline logging
    // (console.log/info/debug) to stderr. emit() uses process.stdout.write directly,
    // so structured results still reach stdout.
    console.log = (...args: unknown[]) => console.error(...args);
    console.info = (...args: unknown[]) => console.error(...args);
    console.debug = (...args: unknown[]) => console.error(...args);
  }
}
export function isJsonMode(): boolean {
  return jsonMode;
}

const wrap = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
export const colors = {
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  bold: wrap("1"),
};

// Primary command result.
export function emit(data: unknown): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(humanFormat(data) + "\n");
  }
}

// Diagnostics — never on stdout (would corrupt --json / pipes).
export function info(msg: string): void {
  if (!jsonMode) process.stderr.write(colors.dim(msg) + "\n");
}
export function success(msg: string): void {
  if (!jsonMode) process.stderr.write(colors.green("✔ ") + msg + "\n");
}
export function warn(msg: string): void {
  process.stderr.write(colors.yellow("! ") + msg + "\n");
}

// Terminal error: print and exit non-zero.
export function die(message: string, code = 1): never {
  if (jsonMode) process.stdout.write(JSON.stringify({ error: message }) + "\n");
  else process.stderr.write(colors.red("✖ ") + message + "\n");
  process.exit(code);
}

// Minimal readable formatter for human mode. Per-command tables come in Part G.
function humanFormat(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}
