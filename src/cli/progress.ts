// Live job progress for the CLI: analysis spinner, summarization progress
// BAR with pause/resume/cancel keys, and the graceful-cancel wiring.
//
// Mirrors the webUI JobsPanel state machine using the same engine events:
//   analysis_started/progress/complete → spinner + step lines
//   summarization_started/progress     → bar with total/summarized/remaining
//   paused/resumed                     → status line, keys stay armed
//   cancelled/failed/completed         → teardown
//
// Keys (TTY, non-JSON only):  p = pause   r = resume   c = cancel
// Ctrl+C: byte 0x03 in raw mode during summarization, SIGINT signal during
// analysis — BOTH route to onInterrupt() → engine cancelJob → the job ends
// terminal and the caller exits 130. Never a stack trace.
//
// Everything goes through the injectable `io` + `input` deps so unit tests
// can drive it with fake streams and a fake queue.

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
  /** Direct write (spinner/bar redraws) — stderr. */
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
  /** stdin for keys; null/undefined disables key handling. */
  input?: Partial<NodeJS.ReadStream> | null;
  /** Machine mode: suppress ALL human progress output. */
  json?: boolean;
  /** Called on Ctrl+C (SIGINT signal or raw 0x03 byte). */
  onInterrupt?: () => void;
  /** Bar redraw throttle in ms (tests use 0). */
  throttleMs?: number;
  /** Non-TTY: print a plain line every N% of progress. */
  nonTtyStepPct?: number;
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export function clampPct(completed: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((completed / total) * 100)));
}

/** `[████████░░░░░░░░]` style bar for the given completion. */
export function makeBar(completed: number, total: number, width = 24): string {
  const pct = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  const filled = Math.round(pct * width);
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}]`;
}

/** One status line: bar + counts + percent + current node. */
export function makeBarLine(
  completed: number,
  total: number,
  nodeName?: string,
  width = 24,
): string {
  const name = nodeName ? ` — ${nodeName}` : "";
  return `${makeBar(completed, total, width)} ${completed}/${total} (${clampPct(completed, total)}%)${name}`;
}

// ── JobProgress ──────────────────────────────────────────────────────────────

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

  constructor(opts: JobProgressOpts) {
    this.opts = { throttleMs: 120, nonTtyStepPct: 5, ...opts };
  }

  private get json(): boolean {
    return !!this.opts.json;
  }

  private get tty(): boolean {
    return !!this.opts.input?.isTTY;
  }

  // ── Event dispatch ───────────────────────────────────────────────────────

  onEvent(ev: ProgressEventLike): void {
    if (this.json) return; // machine mode: progress is noise
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
        break; // the command prints the error itself
      case "completed":
        this.mode = "done";
        this.clearLine();
        this.detachKeys();
        break;
    }
  }

  /** Ctrl+C path: stop the spinner so the warning prints cleanly. */
  noteInterrupt(): void {
    if (this.json) return;
    this.stopSpinner();
    this.clearLine();
    this.opts.io.warn("Cancel requested — stopping at the next checkpoint (Ctrl+C again to force quit)");
  }

  /** Final cleanup — safe to call multiple times. */
  stop(): void {
    this.stopSpinner();
    this.detachKeys();
    this.mode = "done";
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private render(force = false): void {
    const now = Date.now();
    const pct = clampPct(this.completed, this.total);

    if (!this.tty) {
      // Non-TTY: a plain line every nonTtyStepPct% (never spam per-event).
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

  private currentNodeName = "";

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

  // ── Spinner ──────────────────────────────────────────────────────────────

  private static FRAMES = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];

  private startSpinner(text: string): void {
    if (!this.tty) {
      this.opts.io.info(text); // non-TTY: one static line per step update
      return;
    }
    this.spinnerText = text;
    if (this.spinnerTimer) return; // already running — text updated above
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

  // ── Keys (p / r / c + Ctrl+C byte) ───────────────────────────────────────

  private attachKeys(): void {
    if (this.keysAttached || !this.tty) return;
    const input = this.opts.input as NodeJS.ReadStream;
    try {
      input.setRawMode?.(true);
    } catch { /* not a TTY after all */ }
    input.on?.("data", this.onData);
    this.keysAttached = true;
  }

  private detachKeys(): void {
    if (!this.keysAttached) return;
    const input = this.opts.input as NodeJS.ReadStream;
    input.removeListener?.("data", this.onData);
    try {
      input.setRawMode?.(false);
    } catch { /* ignore */ }
    this.keysAttached = false;
  }

  private onData = (buf: Buffer): void => {
    if (!buf?.length) return;
    const b = buf[0];
    if (b === 0x03) {
      // Ctrl+C in raw mode (no SIGINT signal fires while raw)
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
      if (this.queueControl().resumeJob(this.opts.jobId)) {
        /* resumed event renders the state */
      } else {
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
