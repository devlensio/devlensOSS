// Live job progress for the CLI: the analysis spinner, the summarization
// progress bar with pause/resume/cancel keys, and graceful-cancel wiring.
//
// Mirrors the webUI JobsPanel state machine on the same engine events:
//   analysis_started/progress/complete → spinner (live step text) + summary
//   summarization_started/progress     → bar with total/summarized/percent
//                                         + current node, one-time key hint
//   paused/resumed                     → status line, keys stay armed
//   cancelled/failed/completed         → line cleared, keys detached
//
// Rendering rules:
//   - TTY: single \\r-redrawn line, throttled to `throttleMs` (default 120ms);
//     paused renders a fixed status line with [r]/[c] hints.
//   - non-TTY: a plain `summarizing X/Y (N%)` line every `nonTtyStepPct`
//     percent, never one per event.
//   - json mode: absolutely no output (stdout stays machine-parseable), and
//     noteInterrupt/clearLine respect it too.
//
// Keys (TTY, non-JSON, armed only while summarizing → raw mode toggled on/off
// around the job): p = pause, r = resume, c = cancel, each dispatched to the
// engine queue control; 0x03 (Ctrl+C in raw mode, where no SIGINT fires)
// routes to onInterrupt(), which the caller wires to a graceful cancelJob —
// first press warns and waits for the terminal event (exit 130), a second
// force-quits. Never a stack trace.
//
// Everything goes through the injectable `io` + `input` deps so unit tests
// drive it with fake streams and a fake queue.
import { info as cliInfo, success as cliSuccess, warn as cliWarn } from "./output.js";

export interface ProgressEventLike {
  event: string;
  jobId?: string;
  step?: string;
  nodeCount?: number;
  edgeCount?: number;
  totalNodes?: number;
  completed?: number;
  total?: number;
  nodeName?: string;
  completedNodes?: number;
  error?: string;
  cleanedUp?: boolean;
  graphId?: string;
  position?: number;
}

export interface ProgressIO {
  out(s: string): void;
  info(s: string): void;
  success(s: string): void;
  warn(s: string): void;
}

export interface QueueControl {
  pauseJob(jobId: string): boolean;
  resumeJob(jobId: string): boolean;
  cancelJob(jobId: string): boolean;
}

export interface JobProgressOpts {
  jobId: string;
  queue: QueueControl;
  io: ProgressIO;
  input?: Partial<NodeJS.ReadStream> | null;
  json?: boolean;
  onInterrupt?: () => void;
  throttleMs?: number;
  nonTtyStepPct?: number;
}

export function clampPct(completed: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((completed / total) * 100)));
}

export function makeBar(completed: number, total: number, width = 24): string {
  const pct = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  const filled = Math.round(pct * width);
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}]`;
}

export function makeBarLine(
  completed: number,
  total: number,
  nodeName?: string,
  width = 24,
): string {
  const name = nodeName ? ` — ${nodeName}` : "";
  return `${makeBar(completed, total, width)} ${completed}/${total} (${clampPct(completed, total)}%)${name}`;
}

export function cliProgressIO(): ProgressIO {
  return {
    out: (s) => process.stderr.write(s),
    info: cliInfo,
    success: cliSuccess,
    warn: cliWarn,
  };
}

type Mode = "idle" | "analyzing" | "summarizing" | "paused" | "done";

export class JobProgress {
  private readonly opts: Required<Pick<JobProgressOpts, "jobId" | "throttleMs" | "nonTtyStepPct">> & JobProgressOpts;
  private mode: Mode = "idle";
  private total = 0;
  private completed = 0;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private spinnerText = "";
  private lastRender = 0;
  private lastNonTtyPct = -1;
  private keysAttached = false;
  private hintShown = false;
  private currentNodeName = "";

  constructor(opts: JobProgressOpts) {
    this.opts = { throttleMs: 120, nonTtyStepPct: 5, ...opts };
  }

  private get json(): boolean {
    return !!this.opts.json;
  }

  private get tty(): boolean {
    return !!this.opts.input?.isTTY;
  }

  onEvent(ev: ProgressEventLike): void {
    if (this.json) return;
    switch (ev.event) {
      case "analysis_started":
        this.mode = "analyzing";
        this.startSpinner("Analyzing repository…");
        break;
      case "analysis_progress":
        if (ev.step) this.startSpinner(`Analyzing: ${ev.step}`);
        break;
      case "analysis_complete":
        this.stopSpinner();
        this.opts.io.info(
          `  analysis complete — ${ev.nodeCount} nodes, ${ev.edgeCount} edges`,
        );
        break;
      case "summarization_started":
        this.stopSpinner();
        this.mode = "summarizing";
        this.total = ev.totalNodes ?? 0;
        this.completed = 0;
        this.attachKeys();
        this.showHint();
        this.render(true);
        break;
      case "summarization_progress":
        this.completed = ev.completed ?? this.completed;
        this.total = ev.total ?? this.total;
        if (ev.nodeName) this.currentNodeName = ev.nodeName;
        this.render();
        break;
      case "paused":
        this.mode = "paused";
        this.completed = ev.completedNodes ?? this.completed;
        this.total = ev.totalNodes ?? this.total;
        this.renderPaused();
        break;
      case "resumed":
        this.mode = "summarizing";
        this.lastNonTtyPct = -1;
        this.opts.io.info(`resumed — ${this.completed}/${this.total} nodes summarized`);
        this.render(true);
        break;
      case "summarization_complete":
        this.mode = "done";
        this.clearLine();
        this.opts.io.success("Summarization complete");
        break;
      case "cancelled":
        this.mode = "done";
        this.clearLine();
        if (this.total > 0) {
          this.opts.io.info(
            `cancelled at ${this.completed}/${this.total} — analysis kept; ` +
              `summaries resume on the next \`devlens summarize\` run`,
          );
        } else {
          this.opts.io.info("cancelled");
        }
        this.detachKeys();
        break;
      case "failed":
        this.mode = "done";
        this.clearLine();
        this.detachKeys();
        break;
      case "completed":
        this.mode = "done";
        this.clearLine();
        this.detachKeys();
        break;
    }
  }

  noteInterrupt(): void {
    if (this.json) return;
    this.stopSpinner();
    this.clearLine();
    this.opts.io.warn("Cancel requested — stopping at the next checkpoint (Ctrl+C again to force quit)");
  }

  stop(): void {
    this.stopSpinner();
    this.detachKeys();
    this.mode = "done";
  }

  private render(force = false): void {
    const now = Date.now();
    const pct = clampPct(this.completed, this.total);

    if (!this.tty) {
      if (force || pct >= this.lastNonTtyPct + this.opts.nonTtyStepPct || pct === 100) {
        this.lastNonTtyPct = pct;
        this.opts.io.info(`summarizing ${this.completed}/${this.total} (${pct}%)`);
      }
      return;
    }

    if (!force && now - this.lastRender < this.opts.throttleMs) return;
    this.lastRender = now;
    this.writeLine(
      `⠹ Summarizing ${makeBarLine(this.completed, this.total, this.currentNodeName)}`,
    );
  }

  private renderPaused(): void {
    this.clearLine();
    if (this.tty) {
      this.writeLine(
        `⏸ paused ${makeBar(this.completed, this.total)} ${this.completed}/${this.total} ` +
          `(${clampPct(this.completed, this.total)}%) — [r] resume  [c] cancel`,
      );
    } else {
      this.opts.io.info(
        `paused ${this.completed}/${this.total} (${clampPct(this.completed, this.total)}%)`,
      );
    }
  }

  private showHint(): void {
    if (this.hintShown) return;
    this.hintShown = true;
    if (this.tty) this.opts.io.info("  [p] pause  [r] resume  [c] cancel  ·  Ctrl+C cancels gracefully");
  }

  private writeLine(s: string): void {
    this.opts.io.out(`\r\x1b[K${s}`);
  }

  private clearLine(): void {
    if (this.json) return;
    if (this.tty) this.opts.io.out("\r\x1b[K");
  }

  private static FRAMES = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];

  private startSpinner(text: string): void {
    if (!this.tty) {
      this.opts.io.info(text);
      return;
    }
    this.spinnerText = text;
    if (this.spinnerTimer) return;
    this.writeLine(`${JobProgress.FRAMES[0]} ${text}`);
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % JobProgress.FRAMES.length;
      this.writeLine(`${JobProgress.FRAMES[this.spinnerFrame]} ${this.spinnerText}`);
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.clearLine();
  }

  private attachKeys(): void {
    if (this.keysAttached || !this.tty) return;
    const input = this.opts.input as NodeJS.ReadStream;
    try {
      input.setRawMode?.(true);
    } catch {}
    input.on?.("data", this.onData);
    this.keysAttached = true;
  }

  private detachKeys(): void {
    if (!this.keysAttached) return;
    const input = this.opts.input as NodeJS.ReadStream;
    input.removeListener?.("data", this.onData);
    try {
      input.setRawMode?.(false);
    } catch {}
    this.keysAttached = false;
  }

  private onData = (buf: Buffer): void => {
    if (!buf?.length) return;
    const b = buf[0];
    if (b === 0x03) {
      this.opts.onInterrupt?.();
      return;
    }
    const ch = String.fromCharCode(b).toLowerCase();
    if (ch === "p") {
      if (this.queueControl().pauseJob(this.opts.jobId)) {
        this.opts.io.info("\npause requested — stopping after the current batch…");
      } else {
        this.opts.io.info("\ncannot pause right now (only during summarization)");
      }
    } else if (ch === "r") {
      if (!this.queueControl().resumeJob(this.opts.jobId)) {
        this.opts.io.info("\ncannot resume — job is not paused");
      }
    } else if (ch === "c") {
      if (this.queueControl().cancelJob(this.opts.jobId)) {
        this.opts.io.info("\ncancel requested — stopping at the next checkpoint…");
      }
    }
  };

  private queueControl(): QueueControl {
    return this.opts.queue;
  }
}
