"use client";

import { useEffect, useRef, useState } from "react";
import { UI } from "@/lib/theme";

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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
        style={{
          background: open ? UI.elevated : UI.surface,
          color:      open ? UI.text : UI.textSub,
          border:     `1px solid ${open ? UI.accentBorder : UI.border}`,
          fontSize:   12.5,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = UI.text)}
        onMouseLeave={e => (e.currentTarget.style.color = open ? UI.text : UI.textSub)}
      >
        {label}
        <span
          className="px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: UI.accentSoft, color: UI.accent }}
        >
          {active.length}/{options.length}
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 rounded-lg py-1 min-w-40
                     shadow-xl z-50 overflow-hidden"
          style={{
            background: UI.surface,
            border:     `1px solid ${UI.border}`,
            boxShadow:  "0 12px 30px rgba(28,25,23,0.14)",
          }}
        >
          {/* Select all / none */}
          <button
            onClick={() => onChange(allSelected ? [] : [...options])}
            className="w-full flex items-center gap-2 px-3 py-2
                       transition-colors text-left"
            style={{ color: UI.accent, fontSize: 12.5 }}
            onMouseEnter={e => (e.currentTarget.style.background = UI.elevated)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>

          <div style={{ height: 1, background: UI.borderSubtle, margin: "4px 0" }} />

          {/* Options */}
          {options.map(option => (
            <button
              key={option}
              onClick={() => toggle(option)}
              className="w-full flex items-center gap-2.5 px-3 py-2
                         transition-colors text-left"
              style={{ color: active.includes(option) ? UI.text : UI.textSub, fontSize: 12.5 }}
              onMouseEnter={e => (e.currentTarget.style.background = UI.elevated)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: active.includes(option)
                    ? (colors[option] ?? UI.textDim)
                    : "transparent",
                  border: `1px solid ${colors[option] ?? UI.textDim}`,
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
