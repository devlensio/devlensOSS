// Central CLI output.
//   --json  → machine-readable JSON on stdout (for agents / scripts)
//   default → human-friendly text on stdout
// Diagnostics, progress, and errors ALWAYS go to stderr so stdout stays pipeable.

let jsonMode = false;
let quietMode = false;
let verboseMode = false;

export function setJsonMode(on: boolean): void {
  jsonMode = on;
  if (on) {
    console.log = (...args: unknown[]) => console.error(...args);
    console.info = (...args: unknown[]) => console.error(...args);
    console.debug = (...args: unknown[]) => console.error(...args);
  }
}
export function isJsonMode(): boolean {
  return jsonMode;
}

export function setQuietMode(on: boolean): void {
  quietMode = on;
}
export function isQuietMode(): boolean {
  return quietMode;
}

export function setVerboseMode(on: boolean): void {
  verboseMode = on;
}
export function isVerboseMode(): boolean {
  return verboseMode;
}

const isTTY = process.stdout.isTTY;

// ANSI helpers — drop colors when piped
const wrap = (code: string) => (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const colors = {
  dim:     wrap("2"),
  red:     wrap("31"),
  green:   wrap("32"),
  yellow:  wrap("33"),
  blue:    wrap("34"),
  magenta: wrap("35"),
  cyan:    wrap("36"),
  bold:    wrap("1"),
};

// ── Primary output ───────────────────────────────────────────────────────────

export function emit(data: unknown): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(humanFormat(data) + "\n");
  }
}

// ── Diagnostics (stderr) ─────────────────────────────────────────────────────

export function info(msg: string): void {
  if (!jsonMode && !quietMode) process.stderr.write(colors.dim(msg) + "\n");
}
export function success(msg: string): void {
  if (!jsonMode && !quietMode) process.stderr.write(colors.green("✔ ") + msg + "\n");
}
export function warn(msg: string): void {
  if (!quietMode) process.stderr.write(colors.yellow("! ") + msg + "\n");
}
export function verbose(msg: string): void {
  if (verboseMode && !quietMode) process.stderr.write(colors.dim(`[verbose] ${msg}`) + "\n");
}

// Terminal error: print and exit non-zero.
export function die(message: string, code = 1): never {
  if (jsonMode) process.stdout.write(JSON.stringify({ error: message }) + "\n");
  else process.stderr.write(colors.red("✖ ") + message + "\n");
  process.exit(code);
}

// ── Spinner / step helpers ───────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];
let spinnerTimer: ReturnType<typeof setInterval> | null = null;

export function startSpinner(text: string): void {
  if (!isTTY || quietMode) {
    process.stderr.write(text + "...\n");
    return;
  }
  let i = 0;
  process.stderr.write(colors.cyan(SPINNER_FRAMES[i]) + " " + text);
  spinnerTimer = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length;
    process.stderr.write("\r" + colors.cyan(SPINNER_FRAMES[i]) + " " + text);
  }, 80);
}

export function stopSpinner(successText?: string): void {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
  }
  if (isTTY) {
    process.stderr.write("\r\x1b[K");
  }
  if (successText) {
    process.stderr.write(colors.green("✔ ") + successText + "\n");
  }
}

/** Run an async operation with a spinner indicator. */
export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  startSpinner(label);
  try {
    const result = await fn();
    stopSpinner(label);
    return result;
  } catch (err) {
    stopSpinner();
    process.stderr.write(colors.red("✖ ") + label + "\n");
    throw err;
  }
}

// ── Banner ───────────────────────────────────────────────────────────────────

export function banner(cliVersion?: string): void {
  if (jsonMode || quietMode) return;
  const line = colors.dim("─".repeat(40));
  const ver = cliVersion ? ` v${cliVersion}` : "";
  process.stderr.write(
    `\n${colors.bold("DevLens")}${colors.dim(ver)}\n` +
    `${line}\n`
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

function humanFormat(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    // If it's a config object with summarization, pretty-print it
    if (obj.summarization || obj.deploymentMode) {
      return formatConfig(obj);
    }
    // If it has an ok/checks structure (doctor output), pretty-print
    if ("ok" in obj && "checks" in obj) {
      return formatDoctorResult(obj as any);
    }
    // If it has total/graphs structure (status output), pretty-print
    if ("total" in obj && "graphs" in obj) {
      return formatStatusResult(obj as any);
    }
  }
  return JSON.stringify(data, null, 2);
}

function formatConfig(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(colors.bold("Configuration"));
  lines.push(colors.dim("~/.devlens/config.json"));
  lines.push("");

  const s = obj.summarization as Record<string, unknown> | undefined;
  if (s) {
    lines.push(`  ${colors.bold("Summarization")}`);
    for (const [key, val] of Object.entries(s)) {
      if (val == null || val === "") continue;
      const display = key === "apiKey" ? `****${String(val).slice(-4)}` : String(val);
      lines.push(`    ${key}: ${colors.cyan(display)}`);
    }
    lines.push("");
  }
  const e = obj.embedding as Record<string, unknown> | undefined;
  if (e) {
    lines.push(`  ${colors.bold("Embedding")}`);
    for (const [key, val] of Object.entries(e)) {
      if (val == null || val === "") continue;
      const display = key === "apiKey" ? `****${String(val).slice(-4)}` : String(val);
      lines.push(`    ${key}: ${colors.cyan(display)}`);
    }
  }
  return lines.join("\n");
}

function formatDoctorResult(obj: { ok: boolean; checks: Record<string, { ok: boolean; detail: string }> }): string {
  const lines: string[] = [];
  lines.push(colors.bold("Environment Health"));
  lines.push("");
  for (const [name, check] of Object.entries(obj.checks)) {
    const icon = check.ok ? colors.green("✓") : colors.red("✗");
    lines.push(`  ${icon} ${name}: ${colors.dim(check.detail)}`);
  }
  lines.push("");
  lines.push(obj.ok ? colors.green("All checks passed") : colors.yellow("Some checks failed"));
  return lines.join("\n");
}

function formatStatusResult(obj: { total: number; graphs: Array<Record<string, unknown>> }): string {
  if (obj.total === 0) return "No graphs analyzed yet.";
  const lines: string[] = [];
  lines.push(colors.bold(`Graphs (${obj.total})`));
  lines.push("");
  for (const g of obj.graphs) {
    const hasSummary = (g.summarizedCommits as number) > 0 ? colors.green("✓") : colors.dim("○");
    lines.push(`  ${hasSummary} ${colors.cyan(String(g.repoPath))}`);
    lines.push(`      ${colors.dim(`graph: ${g.graphId}`)}`);
    lines.push(`      ${colors.dim(`${g.commits} commits, ${g.summarizedCommits} summarized`)}`);
  }
  return lines.join("\n");
}
