"use client";

import { useEffect, useRef, useState } from "react";

interface FilterDropdownProps<T extends string> {
  label:    string;
  options:  T[];
  active:   T[];
  colors:   Record<string, string>;
  onChange: (selected: T[]) => void;
}

export default function FilterDropdown<T extends string>({
  label,
  options,
  active,
  colors,
  onChange,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(option: T) {
    if (active.includes(option))
      onChange(active.filter(o => o !== option));
    else
      onChange([...active, option]);
  }

  const allSelected = options.every(o => active.includes(o));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
        style={{
          background: open ? "#191c21" : "#14171d",
          color:      "#859490",
          border:     "1px solid rgba(255,255,255,0.06)",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#e1e2ea")}
        onMouseLeave={e => (e.currentTarget.style.color = open ? "#e1e2ea" : "#859490")}
      >
        {label}
        <span
          className="px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: "#2dd4bf18", color: "#2dd4bf" }}
        >
          {active.length}/{options.length}
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 rounded-lg py-1 min-w-40
                     shadow-xl z-50 overflow-hidden"
          style={{
            background: "#14171d",
            border:     "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Select all / none */}
          <button
            onClick={() => onChange(allSelected ? [] : [...options])}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs
                       transition-colors text-left"
            style={{ color: "#2dd4bf" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#191c21")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

          {/* Options */}
          {options.map(option => (
            <button
              key={option}
              onClick={() => toggle(option)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs
                         transition-colors text-left"
              style={{ color: active.includes(option) ? "#e1e2ea" : "#859490" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#191c21")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: active.includes(option)
                    ? (colors[option] ?? "#859490")
                    : "transparent",
                  border: `1px solid ${colors[option] ?? "#859490"}`,
                }}
              />
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
