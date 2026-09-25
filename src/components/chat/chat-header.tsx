"use client";

import { Ellipsis } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { currentUser } from "@/lib/mock-data";
import { useClickOutside } from "../use-click-outside";

export function ChatHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between pr-[26px] pl-10">
      <h1 className="text-[17px]">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-full border border-border bg-surface pr-3 pl-2 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-avatar text-[11px] text-white">
            {currentUser.initial}
          </span>
          Share
        </button>
      </div>
    </header>
  );
}

export function HeaderMenu({ items }: { items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More"
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover"
      >
        <Ellipsis size={18} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-20 min-w-40 rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-hover"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
