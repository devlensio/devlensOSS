"use client";

import { useState } from "react";
import { useGraphList, useAnalyze } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import type { GraphListItem } from "@/lib/types";
import { RepoCard } from "@/components/RepoCard";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { toast } from "react-toastify";

export default function HomePage() {
  const router = useRouter();
  const { data: graphs, isLoading } = useGraphList();
  const analyze = useAnalyze();
  const [repoPath, setRepoPath] = useState("");
  const [skipSummarization, setSkipSummarization] = useState(false);

  function handleAnalyze() {
    if (!repoPath.trim()) return;
    analyze.mutate(
      { repoPath: repoPath.trim(), skipSummarization },
      {
        onSuccess: (job) => {
          toast.success(`Job with Id: ${job.jobId} submitted successfully!`);
          // router.push(`/graph/${job.graphId ?? job.jobId}?jobId=${job.jobId}`);
        },
      }
    );
  }

  return (
    <main className="min-h-screen bg-base text-primary">     
      <div className="px-8 py-8">

        {/* Analyze form — full width */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-8">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Repository Path
              </label>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder="C:\Projects\my-app (should contain package.json)"
                className="w-full bg-elevated border border-border rounded-lg px-4 py-3
                           text-sm font-mono text-primary placeholder:text-dim
                           focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20
                           transition-all"
              />
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={handleAnalyze}
                disabled={analyze.isPending || !repoPath.trim()}
                className="px-8 py-3 bg-accent hover:bg-accent-dim disabled:opacity-40
                           disabled:cursor-not-allowed text-white text-sm font-semibold
                           rounded-lg transition-colors whitespace-nowrap"
              >
                {analyze.isPending ? "Analyzing..." : "Analyze →"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={skipSummarization}
                onChange={(e) => setSkipSummarization(e.target.checked)}
                className="w-4 h-4 rounded accent-accent"
              />
              <span className="text-sm text-muted group-hover:text-secondary transition-colors">
                Skip summarization
              </span>
            </label>
            <span className="text-xs text-dim">
              Analysis only — no LLM calls, faster results
            </span>
          </div>

          {analyze.isError && (
            <p className="mt-4 text-sm text-error bg-error/10 border border-error/20
                          rounded-lg px-4 py-2.5">
              {analyze.error?.message ?? "Something went wrong"}
            </p>
          )}
        </div>

        {/* Repo list header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-primary">
            Analyzed Repositories
          </h2>
          {graphs && graphs.length > 0 && (
            <span className="text-sm text-muted">
              {graphs.length} repo{graphs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-44 rounded-xl bg-surface border border-border animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!graphs || graphs.length === 0) && (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-elevated border border-border 
                            flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" 
                   stroke="currentColor" strokeWidth="1.5" className="text-muted">
                <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
              </svg>
            </div>
            <p className="text-primary font-medium mb-1">No repositories yet</p>
            <p className="text-muted text-sm">Enter a path above to analyze your first repo.</p>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
          {graphs?.map((graph: GraphListItem) => (
            <RepoCard
              key={graph.graphId}
              graph={graph}
            />
          ))}
        </div>
      </div>
    </main>
  );
}