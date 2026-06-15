"use client";

import { useState } from "react";
import type { PreScanResult, ThirdPartyLibEntry } from "@/lib/types";

interface LibrarySelectionStepProps {
  result:      PreScanResult;
  savedPrefs?: string[];
  onConfirm:   (includedLibs: string[]) => void;
  onSkip:      () => void;
  onCancel:    () => void;
}

const C = {
  bg:        "#0d1117",
  surface:   "#161b22",
  elevated:  "#21262d",
  border:    "#30363d",
  borderSub: "#21262d",
  text:      "#e6edf3",
  textSub:   "#8b949e",
  textDim:   "#6e7681",
  textGhost: "#484f58",
  teal:      "#2dd4bf",
};

const CAT_COLORS: Record<string, string> = {
  runtime: "#3fb950",
  ui:      "#818cf8",
  devtool: "#94a3b8",
  unknown: "#6b7280",
};

function LibRow({
  entry,
  selected,
  onClick,
}: {
  entry:    ThirdPartyLibEntry;
  selected: boolean;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
      style={{
        background:  selected ? `${C.teal}12` : "transparent",
        border:      `1px solid ${selected ? C.teal + "40" : C.borderSub}`,
        marginBottom: 4,
      }}
      onMouseEnter={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = `${C.elevated}`;
      }}
      onMouseLeave={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: CAT_COLORS[entry.category] ?? C.textDim }}
      />
      <span className="flex-1 font-mono text-sm truncate" style={{ color: selected ? C.teal : C.text }}>
        {entry.name}
      </span>
      <span className="font-mono text-xs shrink-0" style={{ color: C.textGhost }}>
        {entry.version.replace(/^[\^~]/, "")}
      </span>
    </button>
  );
}

export default function LibrarySelectionStep({
  result,
  savedPrefs,
  onConfirm,
  onSkip,
  onCancel,
}: LibrarySelectionStepProps) {
  const initialIncluded = new Set<string>(
    savedPrefs && savedPrefs.length > 0 ? savedPrefs : result.included.map(e => e.name)
  );

  const [included, setIncluded] = useState<Set<string>>(initialIncluded);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const allEntries = new Map<string, ThirdPartyLibEntry>(
    [...result.included, ...result.excluded].map(e => [e.name, e])
  );

  const includedList = [...included]
    .map(n => allEntries.get(n)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const excludedList = [...allEntries.values()]
    .filter(e => !included.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  function moveToIncluded() {
    if (!selectedName || included.has(selectedName)) return;
    setIncluded(prev => new Set([...prev, selectedName]));
  }

  function moveToExcluded() {
    if (!selectedName || !included.has(selectedName)) return;
    setIncluded(prev => {
      const next = new Set(prev);
      next.delete(selectedName);
      return next;
    });
  }

  function handleConfirm() {
    const libs = [...included];
    try { localStorage.setItem("devlens:includedLibs", JSON.stringify(libs)); } catch {}
    onConfirm(libs);
  }

  const selectedInIncluded = selectedName !== null && included.has(selectedName);
  const selectedInExcluded = selectedName !== null && !included.has(selectedName);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: C.surface,
        border:     `1px solid ${C.border}`,
        maxWidth:   680,
        width:      "100%",
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between relative"
        style={{ borderBottom: `1px solid ${C.borderSub}` }}
      >
        <div>
          <h2 className="font-semibold text-base" style={{ color: C.text }}>
            Third-Party Libraries
          </h2>
          <p className="text-sm mt-0.5" style={{ color: C.textSub }}>
            Found {allEntries.size} packages — choose which appear as nodes in the graph
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="text-sm font-mono px-2.5 py-1 rounded-lg border"
            style={{ background: `${C.teal}12`, color: C.teal, borderColor: `${C.teal}30` }}
          >
            {includedList.length} selected
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{ background: "transparent", color: C.textDim }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = C.elevated;
              el.style.color = C.text;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "transparent";
              el.style.color = C.textDim;
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="13" y2="13" />
              <line x1="13" y1="1" x2="1" y2="13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-0" style={{ minHeight: 300, maxHeight: 400 }}>
        {/* Included column */}
        <div className="flex-1 flex flex-col" style={{ borderRight: `1px solid ${C.borderSub}` }}>
          <div
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: C.teal, borderBottom: `1px solid ${C.borderSub}`, background: `${C.teal}08` }}
          >
            Included ({includedList.length})
          </div>
          <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
            {includedList.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: C.textGhost }}>
                No libraries included
              </p>
            ) : (
              includedList.map(e => (
                <LibRow
                  key={e.name}
                  entry={e}
                  selected={selectedName === e.name}
                  onClick={() => setSelectedName(prev => prev === e.name ? null : e.name)}
                />
              ))
            )}
          </div>
        </div>

        {/* Arrow controls */}
        <div
          className="flex flex-col items-center justify-center gap-2 px-2"
          style={{ background: C.bg, minWidth: 72 }}
        >
          <button
            onClick={moveToIncluded}
            disabled={!selectedInExcluded}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                       transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background:  selectedInExcluded ? `${C.teal}18` : C.elevated,
              color:       selectedInExcluded ? C.teal : C.textDim,
              border:      `1px solid ${selectedInExcluded ? C.teal + "40" : C.borderSub}`,
            }}
          >
            ← In
          </button>
          <button
            onClick={moveToExcluded}
            disabled={!selectedInIncluded}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                       transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background:  selectedInIncluded ? `${C.elevated}` : C.elevated,
              color:       selectedInIncluded ? C.textSub : C.textGhost,
              border:      `1px solid ${selectedInIncluded ? C.border : C.borderSub}`,
            }}
          >
            Ex →
          </button>
        </div>

        {/* Excluded column */}
        <div className="flex-1 flex flex-col" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
          <div
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: C.textDim, borderBottom: `1px solid ${C.borderSub}`, background: C.elevated }}
          >
            Excluded ({excludedList.length})
          </div>
          <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
            {excludedList.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: C.textGhost }}>
                All libraries included
              </p>
            ) : (
              excludedList.map(e => (
                <LibRow
                  key={e.name}
                  entry={e}
                  selected={selectedName === e.name}
                  onClick={() => setSelectedName(prev => prev === e.name ? null : e.name)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Category legend */}
      <div
        className="px-6 py-2 flex items-center gap-4"
        style={{ borderTop: `1px solid ${C.borderSub}`, background: C.bg }}
      >
        {Object.entries(CAT_COLORS).map(([cat, color]) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs" style={{ color: C.textGhost }}>
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {cat}
          </span>
        ))}
      </div>

      {/* Footer actions */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderTop: `1px solid ${C.borderSub}` }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="text-sm px-3 py-1.5 rounded-lg border transition-all"
            style={{ background: "transparent", color: C.textSub, borderColor: C.borderSub }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = C.text;
              el.style.borderColor = C.border;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = C.textSub;
              el.style.borderColor = C.borderSub;
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSkip}
            className="text-sm px-3 py-1.5 rounded-lg border transition-all"
            style={{ background: "transparent", color: C.textDim, borderColor: C.borderSub }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = C.text;
              el.style.borderColor = C.border;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = C.textDim;
              el.style.borderColor = C.borderSub;
            }}
          >
            Skip (no library nodes)
          </button>
        </div>
        <button
          onClick={handleConfirm}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg border transition-all"
          style={{
            background:  `${C.teal}18`,
            color:       C.teal,
            borderColor: `${C.teal}40`,
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background   = `${C.teal}28`;
            el.style.borderColor  = C.teal;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background   = `${C.teal}18`;
            el.style.borderColor  = `${C.teal}40`;
          }}
        >
          Analyze →
        </button>
      </div>
    </div>
  );
}
