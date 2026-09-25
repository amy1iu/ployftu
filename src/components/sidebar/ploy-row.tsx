"use client";

import { Archive, Ellipsis, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Ploy } from "@/lib/db/types";
import { useAnchor } from "../floating";
import { Tooltip } from "../tooltip";

/** Running → spinner; finished but unopened → green dot; otherwise the hollow "Idle" circle. */
export function PloyStatus({ ploy }: { ploy: Ploy }) {
  if (ploy.status === "running")
    return (
      <Tooltip label="Running">
        <span className="flex size-4 items-center justify-center">
          <span className="size-[9px] animate-spin rounded-full border-[1.5px] border-subtle border-t-transparent" />
        </span>
      </Tooltip>
    );
  if (ploy.unread)
    return (
      <Tooltip label="Unread">
        <span className="flex size-4 items-center justify-center">
          <span className="size-[7px] rounded-full bg-avatar" />
        </span>
      </Tooltip>
    );
  return (
    <Tooltip label="Idle">
      <span className="flex size-4 items-center justify-center">
        <span className="size-[7px] rounded-full border border-subtle" />
      </span>
    </Tooltip>
  );
}

// Mocked: they close the menu but don't do anything yet.
const menuItems = [
  { label: "Rename", icon: Pencil },
  { label: "Archive", icon: Archive },
  { label: "Delete", icon: Trash2, danger: true },
];

/** A ploy in the sidebar: its name, a "•••" menu on hover, and its status. */
export function PloyRow({
  href,
  active,
  className = "",
  status,
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  status: ReactNode;
  children: ReactNode;
}) {
  // The menu floats over the page (the sidebar scrolls, so it would clip it).
  const { anchor, capture, clear } = useAnchor();
  const menuOpen = !!anchor;
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) clear();
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && clear();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen, clear]);
  const opensUp = anchor && anchor.bottom + 120 > window.innerHeight;

  return (
    <div
      className={`group relative flex h-[34px] items-center gap-1 rounded-lg pr-1.5 pl-2 text-[14px] ${
        active || menuOpen ? "bg-active" : "hover:bg-hover"
      }`}
    >
      <Link href={href} className={`min-w-0 flex-1 truncate ${className}`}>
        {children}
      </Link>
      <button
        ref={button}
        type="button"
        aria-label="Ploy options"
        onClick={(e) => (menuOpen ? clear() : capture(e.currentTarget))}
        className={`size-6 items-center justify-center rounded-md text-muted hover:bg-active ${
          menuOpen ? "flex" : "hidden group-hover:flex"
        }`}
      >
        <Ellipsis size={16} />
      </button>
      {status}
      {anchor &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className={`fixed z-[60] w-40 rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)] ${
              opensUp ? "-translate-y-full" : ""
            }`}
            style={{ left: Math.max(8, anchor.right - 160), top: opensUp ? anchor.top - 4 : anchor.bottom + 4 }}
          >
            {menuItems.map(({ label, icon: Icon, danger }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={clear}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-hover ${
                  danger ? "text-red-600" : ""
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
