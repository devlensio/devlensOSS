import { randomUUIDv7 } from "bun";
import { isTerminal, Job, JobInput, JobSummary, ProgressEvent, toJobSummary } from "../types";
import { JobQueue } from "./interface";


const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS ?? "3", 10);

interface Subscriber {
    onEvent: (event: ProgressEvent) => void;
    onCompleted: () => void;
}

export class InMemoryQueue implements JobQueue {
    private jobs = new Map<string, Job>();
    private subscribers = new Map<string, Set<Subscriber>>();   //Active Subscribers per job
    private waitingQueue: string[] = [];   //job Ids waiting for their turn

    enqueue(input: JobInput): Job {
        const existing = this.findActiveJob(input.repoPath);
        if (existing) {
            console.log(`Job is already active for ${input.repoPath} - returning ${existing.jobId}`);
            return existing;
        }
        const jobId = randomUUIDv7();
        const now = new Date().toISOString();

        const job: Job = {
            jobId,
            status: "queued",
            phase: null,
            repoPath: input.repoPath,
            isGithubRepo: input.isGithubRepo ?? false,
            thresholds: input.thresholds,
            config: input.config,
            skipSummarization:  input.skipSummarization ?? false,
            forceSummarize: input.forceSummarize ?? false,
            graphId: undefined,
            events: [],
            pauseRequested: false,
            cancelRequested: false,
            createdAt: now,
        }
        this.jobs.set(jobId, job);

        const position = this.waitingQueue.length + 1;
        this.emitEvent(jobId, { event: "queued", jobId, position });

        // If we have capacity, start immediately — no need to wait
        const runningCount = this.getRunningCount();
        if (runningCount < MAX_CONCURRENT) {
            // Start async — does not block enqueue()
            // The runner import is deferred to avoid circular dependency
            // jobs/index.ts wires the runner in after both are initialized
            setImmediate(() => this.startJob(jobId));
        } else {
            console.log(`⏳ Job ${jobId} queued at position ${position} (${runningCount}/${MAX_CONCURRENT} slots used)`);
            this.waitingQueue.push(jobId);
        }

        return job;
    }

    getJob(jobId: string): Job | undefined {
        return this.jobs.get(jobId);
    }

    listJobs(): JobSummary[] {
        return Array.from(this.jobs.values())
            .map(toJobSummary)
            .sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
    }


    findActiveJob(repoPath: string): Job | undefined {
        for (const job of this.jobs.values()) {
            if (
                job.repoPath === repoPath &&
                (job.status === "queued" ||
                    job.status === "running" ||
                    job.status === "paused")
            ) {
                return job;
            }
        }
        return undefined;
    }


    // Only valid during summarization phase.
    // Analysis phase cannot be paused — it's too fast and atomic.
    // Sets the pauseRequested signal — runner checks between batches.

    pauseJob(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job) return false;

        // Can only pause a running job that is in summarization phase
        if (job.status !== "running" || job.phase !== "summarization") {
            return false;
        }

        job.pauseRequested = true;
        console.log(`⏸️  Pause requested for job ${jobId}`);
        return true;
    }



    resumeJob(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || job.status !== "paused") return false;

        job.pauseRequested = false;
        job.cancelRequested = false;
        job.status = "running";
        job.pausedAt = undefined;

        this.emitEvent(jobId, {
            event: "resumed",
            jobId,
            completedNodes: job.summarizationCompleted ?? 0,
            totalNodes: job.summarizationTotal ?? 0,
        });

        // Re-start the job from checkpoint
        setImmediate(() => this.startJob(jobId));
        return true;
    }

    // ── cancelJob ───────────────────────────────────────────────────────────────
    //
    // Works from any non-terminal state.
    // Queued jobs are cancelled immediately.
    // Running/paused jobs set cancelRequested — runner handles cleanup.

    cancelJob(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || isTerminal(job.status)) return false;

        if (job.status === "queued") {
            // Remove from waiting queue immediately
            this.waitingQueue = this.waitingQueue.filter(id => id !== jobId);
            this._markCancelled(jobId, true);
            return true;
        }

        // Running or paused — signal the runner
        job.cancelRequested = true;
        job.pauseRequested = false; // clear pause signal if both were set
        console.log(`🚫 Cancel requested for job ${jobId}`);
        return true;
    }


    // ── subscribe ───────────────────────────────────────────────────────────────
    //
    // Attaches an SSE subscriber to a job.
    // Replays all past events immediately, then streams live.
    // Returns unsubscribe function — call when SSE connection closes.

    subscribe(
        jobId: string,
        onEvent: (event: ProgressEvent) => void,
        onCompleted: () => void
    ): () => void {
        const job = this.jobs.get(jobId);

        if (!job) {
            // Job not found — call onCompleted immediately so handler closes stream
            onCompleted();
            return () => { };
        }

        // Replay all past events for catch-up
        for (const event of job.events) {
            try { onEvent(event); } catch { /* ignore replay errors */ }
        }

        // If job is already terminal, close immediately after replay
        if (isTerminal(job.status)) {
            onCompleted();
            return () => { };
        }

        // Register subscriber for live events
        const sub: Subscriber = { onEvent, onCompleted };

        if (!this.subscribers.has(jobId)) {
            this.subscribers.set(jobId, new Set());
        }
        this.subscribers.get(jobId)!.add(sub);

        // Return unsubscribe function
        return () => {
            const subs = this.subscribers.get(jobId);
            if (subs) {
                subs.delete(sub);
                if (subs.size === 0) this.subscribers.delete(jobId);
            }
        };
    }

    // ── updateJob ───────────────────────────────────────────────────────────────
    //
    // Direct field updates — only called by runner.
    // Uses Object.assign for a clean partial update.

    updateJob(jobId: string, updates: Partial<Job>): void {
        const job = this.jobs.get(jobId);
        if (!job) return;
        Object.assign(job, updates);
    }




    //broadcasts event to every subscribers
    emitEvent(jobId: string, event: ProgressEvent): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        // Store in history — enables SSE replay on reconnect
        job.events.push(event);

        // Broadcast to all active subscribers
        const subs = this.subscribers.get(jobId);
        if (!subs || subs.size === 0) return;

        for (const sub of subs) {
            try {
                sub.onEvent(event);
            } catch (err) {
                // Subscriber errored (e.g. connection dropped) — remove it
                console.warn(`SSE subscriber error for job ${jobId}:`, err);
                subs.delete(sub);
            }
        }
    }

    //private helpers
    private getRunningCount(): number {
        let count = 0;
        for (const job of this.jobs.values()) {
            if (job.status === "running") count++;
        }
        return count;
    }


    _markFailed(jobId: string, error: string): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = "failed";
        job.error = error;
        job.failedAt = new Date().toISOString();

        this.emitEvent(jobId, { event: "failed", jobId, error });
        this.onJobTerminated(jobId);
        console.error(`❌ Job ${jobId} failed: ${error}`);
    }

    // Called when a job reaches a terminal state.
    // Notifies all subscribers to close their SSE streams.
    // Then promotes the next waiting job if a slot opened up.
    private onJobTerminated(jobId: string): void {
        const subs = this.subscribers.get(jobId);
        if (subs) {
            for (const sub of subs) {
                try { sub.onCompleted(); } catch { /* ignore */ }
            }
            this.subscribers.delete(jobId);
        }

        // Promote next waiting job if capacity available
        if (this.waitingQueue.length > 0) {
            const nextJobId = this.waitingQueue.shift()!;
            console.log(`▶️  Promoting queued job ${nextJobId}`);
            setImmediate(() => this.startJob(nextJobId));
        }
    }

    // Marks a job as completed and notifies subscribers + queue.
    _markPaused(jobId: string): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = "paused";
        job.pausedAt = new Date().toISOString();

        this.emitEvent(jobId, { event: "paused", jobId, completedNodes: job.summarizationCompleted ?? 0, totalNodes: job.summarizationTotal ?? 0 });
        console.log(`⏸️  Job ${jobId} paused at ${job.summarizationCompleted}/${job.summarizationTotal} nodes`);

    }


    // Marks a job as cancelled and notifies subscribers + queue.
    // cleanedUp = whether checkpoint file was deleted from disk.
    // Called directly for queued jobs, called by runner for running/paused jobs.
    _markCancelled(jobId: string, cleanedUp: boolean): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = "cancelled";
        job.cancelledAt = new Date().toISOString();

        this.emitEvent(jobId, { event: "cancelled", jobId, cleanedUp });
        this.onJobTerminated(jobId);
        console.log(`🚫 Job ${jobId} cancelled (cleanedUp: ${cleanedUp})`);
    }

    // Marks a job as completed and notifies subscribers + queue.
    _markCompleted(jobId: string, graphId: string): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = "completed";
        job.graphId = graphId;
        job.completedAt = new Date().toISOString();

        this.emitEvent(jobId, { event: "completed", jobId, graphId });
        this.onJobTerminated(jobId);
        console.log(`✅ Job ${jobId} completed — graph ${graphId}`);
    }





    private async startJob(jobId: string): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) return;

        // Job may have been cancelled while waiting in queue
        if (job.status === "cancelled") return;

        try {
            // Dynamic import breaks circular dependency:
            // queue → runner → queue (for emitEvent/updateJob)
            const { runJob } = await import("../runner");
            await runJob(job, this);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            this._markFailed(jobId, message);
        }
    }
}