"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDeleteGraph, useAnalyze, useGraphMeta } from "@/lib/hooks";
import type { GraphListItem } from "@/lib/types";
import { HiOutlineArrowPath, HiOutlineEllipsisHorizontal, HiOutlineSparkles, HiOutlineTableCells, HiOutlineTrash } from "react-icons/hi2";

// ─── Props ────────────────────────────────────────────────────────────────────

interface RepoCardProps {
  graph: GraphListItem;
}

// ─── Color maps ───────────────────────────────────────────────────────────────

const frameworkColor: Record<string, string> = {
  nextjs: "text-white border-white/20 bg-white/10",
  react: "text-[#61dafb] border-[#61dafb]/20 bg-[#61dafb]/10",
  express: "text-[#68d391] border-[#68d391]/20 bg-[#68d391]/10",
  fastify: "text-[#a78bfa] border-[#a78bfa]/20 bg-[#a78bfa]/10",
  unknown: "text-muted border-border bg-elevated",
};

const langColor: Record<string, string> = {
  typescript: "text-[#3b82f6] border-[#3b82f6]/20 bg-[#3b82f6]/10",
  javascript: "text-[#f59e0b] border-[#f59e0b]/20 bg-[#f59e0b]/10",
  unknown: "text-muted border-border bg-elevated",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RepoCard({ graph }: RepoCardProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const {data: meta, isLoading: metaLoading} = useGraphMeta(expanded ? graph.graphId: ""); 

  // ── Click outside to close dropdown ──────────────────────────────────────
  // Attaches a mousedown listener to document — if click is outside the menu
  // ref, closes the dropdown. Cleaned up on unmount.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const deleteGraph = useDeleteGraph();
  const analyze = useAnalyze();

  // Navigate to graph view
  function handleOpen() {
    router.push(`/graph/${graph.graphId}`);
  }

  function handleSummarize() {
    setMenuOpen(false);
    analyze.mutate(
      {
        repoPath: graph.repoPath,
        skipSummarization: false,
        forceSummarize: false,
      },
      {
        onSuccess: (job) => {
          router.push(`/graph/${graph.graphId}?jobId=${job.jobId}`);
        },
      },
    );
  }

  // Force re-summarize — clears checkpoint + summarizedCommits, restarts
  function handleForceSummarize() {
    setMenuOpen(false);
    analyze.mutate(
      {
        repoPath: graph.repoPath,
        skipSummarization: false,
        forceSummarize: true,
      },
      {
        onSuccess: (job) => {
          router.push(`/graph/${graph.graphId}?jobId=${job.jobId}`);
        },
      },
    );
  }

  // Delete graph — shows confirmation first
  function handleDelete() {
    setMenuOpen(false);
    if (!confirm(`Delete "${repoName}"? This cannot be undone.`)) return;
    deleteGraph.mutate(graph.graphId);
  }

  const repoName = graph.repoPath.split(/[\\/]/).pop() ?? graph.repoPath;
  const isLoading = analyze.isPending || deleteGraph.isPending;

  return (
    <div
      className={`relative bg-surface border rounded-xl p-5 transition-all group
                     hover:shadow-[0_0_20px_rgba(45,212,191,0.06)]
                     ${
                       isLoading
                         ? "border-accent/40 opacity-70 pointer-events-none"
                         : "border-border hover:border-accent/60 hover:bg-elevated"
                     }`}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-base/40 z-10">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Top row — icon + date + menu */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div
          className="w-9 h-9 cursor-pointer rounded-lg bg-elevated border border-border
                        group-hover:border-accent/30 flex items-center justify-center
                        shrink-0 transition-colors"
        onClick={handleOpen}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-accent"
          >
            <path d="M3 3h18v18H3zM3 9h18M9 21V9" />
          </svg>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-dim">
            {new Date(graph.latestAnalyzedAt).toLocaleDateString()}
          </span>

          {/* ⋯ menu button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md
                         text-dim hover:text-primary hover:bg-elevated
                         transition-colors ml-1"
            >
              <HiOutlineEllipsisHorizontal size={16} />
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <div
                className="absolute right-0 top-8 w-52 bg-elevated border border-border
                              rounded-xl shadow-xl z-20 py-1 overflow-hidden"
              >
                <MenuItem
                  icon={<HiOutlineTableCells />}
                  label="Open Graph"
                  onClick={handleOpen}
                />
                <MenuItem
                  icon={<HiOutlineSparkles />}
                  label="Run Summarization"
                  description="Resumes from last checkpoint if available"
                  onClick={handleSummarize}
                />
                <MenuItem
                  icon={<HiOutlineArrowPath />}
                  label="Force Re-summarize"
                  description="Full Re-analyze of the latest commit"
                  onClick={handleForceSummarize}
                />
                <div className="h-px bg-border mx-2 my-1" />
                <MenuItem
                  icon={<HiOutlineTrash />}
                  label="Delete"
                  onClick={handleDelete}
                  danger
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Repo name — clickable */}
      <button onClick={handleOpen} className="w-full cursor-pointer text-left mb-1">
        <h3
          className="font-semibold text-base text-primary group-hover:text-accent
                       transition-colors truncate"
        >
          {repoName}
        </h3>
      </button>

      {/* Path */}
      <p
        className="text-xs text-muted font-mono mb-4 truncate"
        title={graph.repoPath}
      >
        {graph.repoPath}
      </p>

      {/* Footer — badges */}
      <div className="flex items-center gap-2 flex-wrap">
  <span className={`text-xs font-mono px-2 py-0.5 rounded-full border
    ${frameworkColor[graph.framework] ?? frameworkColor.unknown}`}>
    {graph.framework}
  </span>
  <span className={`text-xs font-mono px-2 py-0.5 rounded-full border
    ${langColor[graph.language] ?? langColor.unknown}`}>
    {graph.language}
  </span>
  <button
    onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
    className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
  >
    {graph.commitCount} commit{graph.commitCount !== 1 ? "s" : ""}
    <svg
      width="10" height="10" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`transition-transform ${expanded ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6"/>
    </svg>
  </button>
</div>

{/* Expandable commit list */}
{expanded && (
  <div className="mt-3 pt-3 border-t border-border space-y-1 max-h-64 overflow-y-scroll">
    {metaLoading && (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted">Loading commits...</span>
      </div>
    )}
    {meta?.commits.map(commit => (
      <button
        key={commit.commitHash}
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/graph/${graph.graphId}?commit=${commit.commitHash}`);
        }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                   hover:bg-border/50 text-left transition-colors group/commit"
      >
        <span className="font-mono text-xs text-accent shrink-0">
          {commit.commitHash.slice(0, 7)}
        </span>
        <span className="text-xs text-secondary truncate flex-1">
          {commit.message || "No message"}
        </span>
        {commit.isSummarized && (
          <span className="text-xs text-success shrink-0">✦</span>
        )}
        <span className="text-xs text-dim shrink-0">
          {new Date(commit.analyzedAt).toLocaleDateString()}
        </span>
      </button>
    ))}
  </div>
)}
    </div>
  );
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  description,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors
                  ${
                    danger
                      ? "text-error hover:bg-error/10"
                      : "text-primary hover:bg-border/50"
                  }`}
    >
      <span className="mt-0.5 shrink-0 opacity-70">{icon}</span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted mt-0.5">{description}</div>
        )}
      </div>
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

