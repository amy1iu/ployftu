"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchor } from "./floating";

/** A dark label that appears above (or below) its trigger on hover, floating over everything. */
export function Tooltip({ label, side = "top", children }: { label: string; side?: "top" | "bottom"; children: ReactNode }) {
  const { anchor, capture, clear } = useAnchor();
  return (
    <span className="inline-flex" onMouseEnter={(e) => capture(e.currentTarget)} onMouseLeave={clear}>
      {children}
      {anchor &&
        createPortal(
          <span
            role="tooltip"
            className={`pointer-events-none fixed z-[60] -translate-x-1/2 animate-[toast-in_150ms_ease-out] rounded-lg bg-[#0d0d0d] px-2.5 py-1 text-[12px] whitespace-nowrap text-white ${
              side === "top" ? "-translate-y-full" : ""
            }`}
            style={{ left: anchor.centerX, top: side === "top" ? anchor.top - 8 : anchor.bottom + 8 }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
