import React from "react";

export function Section({
  title, description, children,
}: {
  title:       string;
  description: string;
  children:    React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <label className="text-xs text-muted w-24 pt-2.5 shrink-0 text-right">
        {label}
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Input({
  value, onChange, placeholder, type = "text", mono = false,
}: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  type?:        string;
  mono?:        boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-elevated border border-border rounded-lg px-3 py-2
                  text-sm text-primary placeholder:text-dim
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20
                  transition-all ${mono ? "font-mono" : ""}`}
    />
  );
}

export function Select({
  value, onChange, options,
}: {
  value:    string;
  onChange: (v: string) => void;
  options:  string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-elevated border border-border rounded-lg px-3 py-2
                 text-sm text-primary font-mono
                 focus:outline-none focus:border-accent
                 transition-colors"
    >
      {options.map(o => (
        <option key={o} value={o} className="bg-elevated">
          {o}
        </option>
      ))}
    </select>
  );
}

export function ModelSelect({
  value, onChange, options, placeholder, loading, error, disabled,
}: {
  value:       string;
  onChange:    (v: string) => void;
  options:     string[];
  placeholder?: string;
  loading?:     boolean;
  error?:       string | null;
  disabled?:    boolean;
}) {
  const id = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [highlightedIdx, setHighlightedIdx] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Sync external value changes
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter options based on input (client-side linear search)
  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return options;
    const q = inputValue.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [inputValue, options]);

  // Determine if the current input represents a custom model
  const isCustom = inputValue.trim() !== "" && !options.includes(inputValue);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        inputRef.current && !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightedIdx >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIdx] as HTMLElement;
      if (item) item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIdx]);

  function openDropdown() {
    if (!disabled && !loading) setIsOpen(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInputValue(v);
    onChange(v);
    if (!isOpen) setIsOpen(true);
    setHighlightedIdx(-1);
  }

  function handleSelectOption(option: string) {
    setInputValue(option);
    onChange(option);
    setIsOpen(false);
    setHighlightedIdx(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        openDropdown();
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIdx(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIdx(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIdx >= 0 && highlightedIdx < filteredOptions.length) {
          handleSelectOption(filteredOptions[highlightedIdx]);
        } else {
          setIsOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIdx(-1);
        break;
    }
  }

  return (
    <div className="relative">
      {/* Input + chevron */}
      <div
        className={`flex items-center w-full bg-elevated border rounded-lg
          transition-all cursor-text
          ${isOpen ? "border-accent ring-1 ring-accent/20" : "border-border"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-accent/40"}`}
        onClick={() => { inputRef.current?.focus(); openDropdown(); }}
      >
        <input
          ref={inputRef}
          id={`model-select-${id}`}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={openDropdown}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Type or select a model"}
          disabled={disabled}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-primary
                     placeholder:text-dim font-mono
                     focus:outline-none min-w-0"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />

        {/* Custom badge */}
        {isCustom && (
          <span className="shrink-0 text-[10px] font-medium text-accent/70
                           mr-0.5 pointer-events-none select-none">
            custom
          </span>
        )}

        {/* Chevron button */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); if (loading) return; setIsOpen(!isOpen); }}
          tabIndex={-1}
          disabled={disabled}
          className={`shrink-0 flex items-center justify-center w-7 h-7 mr-1 rounded-md
            text-muted hover:text-primary hover:bg-base/40 transition-colors
            ${disabled ? "opacity-40" : ""}`}
          aria-label={isOpen ? "Close dropdown" : "Open dropdown"}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1.5 bg-elevated border border-border
                     rounded-xl shadow-xl shadow-black/20 overflow-hidden
                     animate-in fade-in slide-in-from-top-1 duration-150"
          role="listbox"
        >
          {loading && options.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"/>
              </svg>
              Loading models...
            </div>
          ) : filteredOptions.length > 0 ? (
            <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
              {filteredOptions.map((option, idx) => {
                const isSelected = option === value;
                const isHighlighted = idx === highlightedIdx;
                return (
                  <div
                    key={option}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectOption(option)}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer
                      transition-colors
                      ${isHighlighted && !isSelected
                        ? "bg-accent/8 text-primary"
                        : ""
                      }
                      ${isSelected
                        ? "bg-accent/12 text-accent font-medium"
                        : "text-primary hover:bg-accent/5"
                      }`}
                  >
                    {/* Checkmark for selected item */}
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                        <path d="M20 6 9 17l-5-5"/>
                      </svg>
                    )}
                    <span className={`truncate ${isSelected ? "" : "pl-5"}`}>
                      {option}
                    </span>
                    {/* Highlight matching text */}
                    {inputValue && !isSelected && (
                      <span className="ml-auto text-[10px] text-muted shrink-0 font-mono">
                        {option.toLowerCase().includes(inputValue.toLowerCase())
                          ? "match"
                          : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-muted">
              {loading ? "Loading models..." : "No matching models found"}
            </div>
          )}

          {/* Error message in dropdown */}
          {error && (
            <div className="px-4 py-2 text-xs text-error border-t border-border bg-error/5">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

