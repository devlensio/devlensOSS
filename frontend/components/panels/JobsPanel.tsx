"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobList, usePauseJob, useResumeJob, useCancelJob } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { JobSummary, JobStatus, JobPhase, ProgressEvent } from "@/lib/types";
import { toast } from "react-toastify";

const TERMINAL = new Set<JobStatus>(["completed", "failed", "cancelled"]);

const STATUS_DOT: Record<JobStatus, string> = {
  queued:    "bg-warning",
  running:   "bg-accent animate-pulse",
  paused:    "bg-warning",
  completed: "bg-success",
  failed:    "bg-error",
  cancelled: "bg-dim",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued:    "Queued",
  running:   "Running",
  paused:    "Paused",
  completed: "Completed",
  failed:    "Failed",
  cancelled: "Cancelled",
};

interface LiveState {
  status:    JobStatus;
  phase:     JobPhase | null;
  completed: number;
  total:     number;
  error?:    string;
  graphId?:  string;
}

function applyEvent(prev: LiveState, event: ProgressEvent): LiveState {
  switch (event.event) {
    case "queued":                return { ...prev, status: "queued", phase: null };
    case "analysis_started":      return { ...prev, status: "running", phase: "analysis" };
    case "analysis_complete":     return { ...prev, graphId: event.graphId };
    case "summarization_started": return { ...prev, phase: "summarization", total: event.totalNodes, completed: prev.completed > 0 ? prev.completed : 0 };
    case "summarization_progress":return { ...prev, completed: event.completed, total: event.total };
    case "paused":                return { ...prev, status: "paused", completed: event.completedNodes, total: event.totalNodes };
    case "resumed":               return { ...prev, status: "running" };
    case "completed":             return { ...prev, status: "completed", graphId: event.graphId };
    case "cancelled":             return { ...prev, status: "cancelled" };
    case "failed":                return { ...prev, status: "failed", error: event.error };
    default:                      return prev;
  }
}

interface JobsPanelProps {
  open:    boolean;
  onClose: () => void;
}

export function JobsPanel({ open, onClose }: JobsPanelProps) {
  const router = useRouter();
  const { data: jobs } = useJobList();

  const pauseJob  = usePauseJob();
  const resumeJob = useResumeJob();
  const cancelJob = useCancelJob();

  const [liveStates, setLiveStates] = useState<Record<string, LiveState>>({});
  const esRef = useRef<Record<string, EventSource>>({});

  useEffect(() => {
    if (!jobs) return;

    jobs.forEach((jb) => {
      if (TERMINAL.has(jb.status)) return;
      if (esRef.current[jb.jobId])  return;

      const es = api.streamJob(jb.jobId);

      es.onmessage = (msg) => {
        const eventData = JSON.parse(msg.data) as ProgressEvent;

        setLiveStates(prev => ({
          ...prev,
          [jb.jobId]: applyEvent(
            prev[jb.jobId] ?? {
              status:    jb.status,
              phase:     jb.phase,
              completed: jb.summarizationCompleted ?? 0,
              total:     jb.summarizationTotal     ?? 0,
              graphId:   jb.graphId,
            },
            eventData
          ),
        }));

        if (TERMINAL.has(eventData.event as JobStatus)) {
          es.close();
          delete esRef.current[jb.jobId];
        }
      };

      es.onerror = () => {
        es.close();
        delete esRef.current[jb.jobId];
      };

      esRef.current[jb.jobId] = es;
    });

    return () => {
      Object.values(esRef.current).forEach(es => es.close());
      esRef.current = {};
    };
  }, [jobs]);

  const sortedJobs = jobs
    ? [...jobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      )}

      <div className={`fixed top-0 right-0 h-full w-105 z-50 bg-surface border-l border-border
                       flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
                       ${open ? "translate-x-0" : "translate-x-full"}`}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-primary">Jobs</span>
            {sortedJobs.length > 0 && (
              <span className="text-xs text-dim bg-elevated border border-border px-2 py-0.5 rounded-full">
                {sortedJobs.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md
                       text-muted hover:text-primary hover:bg-elevated transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sortedJobs.length === 0 && (
            <p className="text-center text-sm text-muted py-16">
              No jobs yet. Analyze a repo to get started.
            </p>
          )}

          {sortedJobs.map(job => {
            const live = liveStates[job.jobId];
            const status  = live?.status  ?? job.status;
            const phase   = live?.phase   ?? job.phase;
            const graphId = live?.graphId ?? job.graphId;
            const error   = live?.error   ?? job.error;
            const completed = live?.completed ?? job.summarizationCompleted ?? 0;
            const total     = live?.total     ?? job.summarizationTotal     ?? 0;

            return (
              <JobCard
                key={job.jobId}
                job={job}
                status={status}
                phase={phase}
                graphId={graphId}
                error={error}
                completed={completed}
                total={total}
                onPause={() =>{
                  pauseJob.mutate(job.jobId);
                  toast.warn("Job will be Paused after summarizing current batch of Nodes.");
                } }
                onResume={() => {
                  resumeJob.mutate(job.jobId);
                }}
                onCancel={() => cancelJob.mutate(job.jobId)}
                onOpen={() => {
                  if (graphId) { onClose(); router.push(`/graph/${graphId}`); }
                }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function JobCard({ job, status, phase, graphId, error, completed, total, onPause, onResume, onCancel, onOpen }: {
  job:       JobSummary;
  status:    JobStatus;
  phase:     JobPhase | null;
  graphId?:  string;
  error?:    string;
  completed: number;
  total:     number;
  onPause:   () => void;
  onResume:  () => void;
  onCancel:  () => void;
  onOpen:    () => void;
}) {
  const isActive     = !TERMINAL.has(status);
  const repoName     = job.repoPath.split(/[\\/]/).pop() ?? job.repoPath;
  const showProgress = total > 0 && (phase === "summarization" || completed > 0);
  const pct          = showProgress ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={`rounded-xl border p-4 transition-colors
                     ${isActive ? "border-accent/30 bg-elevated" : "border-border bg-surface"}`}>

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
          <span className="font-medium text-sm text-primary truncate">{repoName}</span>
        </div>
        <span className="text-xs text-dim shrink-0">
          {new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3 text-xs text-muted">
        <span>{STATUS_LABEL[status]}</span>
        {phase && isActive && (
          <>
            <span className="text-dim">·</span>
            <span className="text-accent capitalize">{phase}</span>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-error bg-error/10 border border-error/20
                      rounded-lg px-3 py-2 mb-3 font-mono">
          {error}
        </p>
      )}

      {showProgress && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-dim mb-1">
            <span>{completed} / {total} nodes</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-base rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {status === "running" && phase === "summarization" && (
          <Btn onClick={onPause} label="Pause" />
        )}
        {status === "paused" && (
          <Btn onClick={onResume} label="Resume" accent />
        )}
        {isActive && (
          <Btn onClick={onCancel} label="Cancel" danger />
        )}
        {graphId && (
          <Btn onClick={onOpen} label="Open Graph" accent={status === "completed"} />
        )}
      </div>
    </div>
  );
}

function Btn({ onClick, label, accent, danger }: {
  onClick: () => void;
  label:   string;
  accent?: boolean;
  danger?: boolean;
}) {
  const cls = danger ? "text-error border-error/30 hover:bg-error/10"
            : accent ? "text-accent border-accent/30 hover:bg-accent/10"
            :          "text-muted border-border hover:bg-border/50";

  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${cls}`}>
      {label}
    </button>
  );
}