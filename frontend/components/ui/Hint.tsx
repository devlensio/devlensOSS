"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UI } from "@/lib/theme";

/**
 * Portal-based tooltip. Used on every badge and relation chip in the graph
 * details page.
 *
 * Why a portal: the panels scroll, and a CSS `position: absolute` tooltip is
 * clipped by the nearest `overflow: auto` ancestor. Rendering into <body> at a
 * fixed position keeps the hint visible no matter where the trigger sits, and
 * one hovered element at a time is cheap enough that a shared context would be
 * extra machinery for nothing.
 */
export function Hint({
  label,
  children,
  maxWidth = 260,
}: {
  label: ReactNode;
  children: ReactNode;
  maxWidth?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function show() {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <span
      ref={anchor}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: Math.min(Math.max(pos.x, 16), window.innerWidth - 16),
              top: pos.y - 9,
              transform: "translate(-50%, -100%)",
              maxWidth,
              padding: "7px 10px",
              borderRadius: 8,
              background: "#1c1917",
              color: "#f8f8f2",
              fontSize: 12,
              lineHeight: 1.5,
              fontWeight: 400,
              letterSpacing: 0,
              textTransform: "none",
              boxShadow: "0 8px 24px rgba(28,25,23,0.28)",
              zIndex: 10000,
              pointerEvents: "none",
              whiteSpace: "normal",
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Small chip with a hint, used for markers and relation badges. */
export function Badge({
  label,
  hint,
  text,
  bg,
  border,
}: {
  label: string;
  hint: string;
  text: string;
  bg: string;
  border: string;
}) {
  return (
    <Hint label={hint}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "1px 6px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          fontFamily: "'Fira Code', ui-monospace, monospace",
          color: text,
          background: bg,
          border: `1px solid ${border}`,
          cursor: "help",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </Hint>
  );
}

/** One-line explanatory note used under section titles. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.55, color: UI.textDim }}>{children}</p>
  );
}