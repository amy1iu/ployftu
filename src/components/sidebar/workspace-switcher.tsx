"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { startFresh, switchWorkspace } from "@/app/actions";
import { useClickOutside } from "../use-click-outside";
import { useWorkspace } from "../workspace/workspace-provider";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Each workspace is one onboarding run. "Start fresh" begins a new run; old
// runs stay intact and can be reopened here.
export function WorkspaceSwitcher() {
  const { workspace, workspaces } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const run = (action: () => Promise<void>) => {
    setOpen(false);
    startTransition(action);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-[38px] w-full items-center gap-2.5 rounded-lg border border-[#f0f0f0] bg-surface pr-3 pl-[5px] text-left"
      >
        {workspace.favicon_url ? (
          // The favicon from their site; external, so a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={workspace.favicon_url} alt="" className="size-6 rounded-[5px] object-contain" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-[5px] bg-[#0f0f0f] text-[13px] font-medium text-white">
            {workspace.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex-1 truncate text-[14px]">{pending ? "Switching…" : workspace.name}</span>
        <ChevronDown size={18} strokeWidth={2} className="text-[#3a3a3a]" />
      </button>

      {open && (
        <div className="absolute top-10 right-0 left-0 z-30 rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <div className="max-h-64 overflow-y-auto">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => w.id !== workspace.id && run(() => switchWorkspace(w.id))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{w.name}</span>
                  <span className="block text-[11px] text-subtle">{dateFormat.format(new Date(w.created_at))}</span>
                </span>
                {w.id === workspace.id && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => run(startFresh)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-hover"
          >
            <Plus size={14} /> Start fresh
          </button>
        </div>
      )}
    </div>
  );
}
