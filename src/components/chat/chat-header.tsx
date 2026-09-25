"use client";

import { Ellipsis, PanelRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { currentUser } from "@/lib/mock-data";
import { useMapPanel } from "../map/map-panel-state";
import { Tooltip } from "../tooltip";
import { useClickOutside } from "../use-click-outside";

export function ChatHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const map = useMapPanel();
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 pr-4 pl-10 sm:pr-[26px]">
      <h1 className="min-w-0 truncate text-[17px]">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          className="hidden h-8 items-center gap-2 rounded-full border border-border bg-surface pr-3 pl-2 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-avatar text-[11px] text-white">
            {currentUser.initial}
          </span>
          Share
        </button>
        {map.available && (
          <Tooltip label={map.visible ? "Hide map" : "Show map"} side="bottom">
            <button
              type="button"
              aria-label="Toggle map"
              onClick={map.toggle}
              className="flex size-8 items-center justify-center rounded-lg text-[#3a3a3a] hover:bg-hover"
            >
              <PanelRight size={20} strokeWidth={1.5} className={map.visible ? "fill-[#3a3a3a]/15" : ""} />
            </button>
          </Tooltip>
        )}
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
