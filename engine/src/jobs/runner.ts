import { Job }              from "./types";
import { JobQueue }         from "./queue/interface";
import { InMemoryQueue }    from "./queue/memory";
import { analyzePipeline }  from "../pipeline";
import { storage }          from "../storage";

// ─── runJob ───────────────────────────────────────────────────────────────────
//
// Entry point — called by InMemoryQueue.startJob().
// Orchestrates Phase 1 (analysis) and Phase 2 (summarization) for one job.
//
// The runner is stateless — all state lives on the Job object in the queue.
// This is what makes resume work: runner re-reads job state on every call.

export async function runJob(job: Job, queue: JobQueue): Promise<void> {
  const q = queue as InMemoryQueue; // safe — only InMemoryQueue used locally

  queue.updateJob(job.jobId, {
    status:    "running",
    startedAt: new Date().toISOString(),
  });

  // ── Phase 1 — Analysis ────────────────────────────────────────────────────
  let graphId:    string;
  let commitHash: string;

  try {
    queue.updateJob(job.jobId, { phase: "analysis" });
    queue.emitEvent(job.jobId, { event: "analysis_started", jobId: job.jobId });

    const result = await analyzePipeline(
      job.repoPath,
      job.isGithubRepo,
      {
        thresholds: job.thresholds,
        onStep: (step) => {
          queue.emitEvent(job.jobId, {
            event: "analysis_progress",
            jobId: job.jobId,
            step,
          });
        },
      }
    );

    storage.saveGraph(result, { force: job.forceSummarize });
    graphId    = result.graphId;
    commitHash = result.gitInfo.commitHash;

    queue.updateJob(job.jobId, { graphId });

    queue.emitEvent(job.jobId, {
      event:     "analysis_complete",
      jobId:     job.jobId,
      graphId,
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
    });

    console.log(`\n📊 Phase 1 complete for job ${job.jobId} — graph ${graphId}`);
    console.log(`   Nodes: ${result.nodes.length} | Edges: ${result.edges.length}`);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    q._markFailed(job.jobId, message);
    return;
  }

  // ── Cancel check after Phase 1 ────────────────────────────────────────────
  const jobAfterPhase1 = queue.getJob(job.jobId)!;
  if (jobAfterPhase1.cancelRequested) {
    q._markCancelled(job.jobId, true);
    return;
  }


  // ── skipSummarization — stop here, mark completed ─────────────────────────
  // User chose analysis-only mode. Summaries can be triggered later via
  // POST /api/graph/:graphId/:commitHash/summarize
  if (job.skipSummarization) {
    console.log(`⏭️  Job ${job.jobId} — skipSummarization=true, stopping after Phase 1`);
    q._markCompleted(job.jobId, graphId);
    return;
  }

  //if force summarization then remove the commit entirely from the meta 
  console.log("Force Summarized ? : ", job.forceSummarize ?? "false");
  if(job.forceSummarize){
    console.log("Removing Summarized Commits!");
      storage.removeFromSummarizedCommits(graphId, commitHash);
  }

  

  // ── Phase 2 — Summarization ───────────────────────────────────────────────
  try {
    queue.updateJob(job.jobId, { phase: "summarization" });

    const { runSummarization } = await import("../summarizer/index");

    // Find previous summarized commit for smart reuse
    const previousCommitHash = await storage.findLastSummarizedAncestor(
      graphId,
      commitHash,
      job.repoPath
    );

    // Fetch routes and fingerprint from saved graph for summarizer context
    const savedResult = storage.getGraph(graphId, commitHash)!;

    await runSummarization({
      job,
      queue,
      graphId,
      commitHash,
      repoPath:           job.repoPath,
      previousCommitHash,
      routes:             savedResult.routes,
      callbacks: {
        onStarted: (totalNodes) => {
          queue.updateJob(job.jobId, {
            summarizationTotal:     totalNodes,
            summarizationCompleted: 0,
          });
          queue.emitEvent(job.jobId, {
            event: "summarization_started",
            jobId: job.jobId,
            totalNodes,
          });
        },
        onProgress: (completed, total, nodeName) => {
          queue.updateJob(job.jobId, {
            summarizationCompleted: completed,
            summarizationTotal:     total,
          });
          queue.emitEvent(job.jobId, {
            event: "summarization_progress",
            jobId: job.jobId,
            completed,
            total,
            nodeName,
          });
        },
        onPause: () => {
          q._markPaused(job.jobId);
        },
        onCancel: (cleanedUp: boolean) => {
          q._markCancelled(job.jobId, cleanedUp);
        },
        onComplete: () => {
          queue.emitEvent(job.jobId, {
            event: "summarization_complete",
            jobId: job.jobId,
          });
          q._markCompleted(job.jobId, graphId);
        },
        onError: (error: string) => {
          q._markFailed(job.jobId, error);
        },
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed";
    q._markFailed(job.jobId, message);
  }
}