"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace/workspace-provider";

type Toast = { ployId: string; title: string };

/**
 * Announces finished tasks at the side of the screen (top right, under the
 * header) instead of in the chat.
 * Only tasks that finish while the app is open; each stays until viewed or
 * dismissed (it's a reward, so it doesn't vanish on its own).
 */
export function TaskToasts() {
  const { ploys } = useWorkspace();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastStatus = useRef(new Map(ploys.map((p) => [p.id, p.status])));

  useEffect(() => {
    const finished = ploys.filter(
      (p) => p.kind === "task" && p.status === "done" && p.unread && lastStatus.current.get(p.id) !== "done",
    );
    lastStatus.current = new Map(ploys.map((p) => [p.id, p.status]));
    if (finished.length)
      setToasts((current) => [...current, ...finished.map((p) => ({ ployId: p.id, title: p.title }))].slice(-3));
  }, [ploys]);

  // Seeing the ploy (or reading it elsewhere) retires its pop-up.
  const visible = toasts.filter(
    (t) => pathname !== `/ploys/${t.ployId}` && ploys.find((p) => p.id === t.ployId)?.unread,
  );
  const dismiss = (ployId: string) => setToasts((current) => current.filter((t) => t.ployId !== ployId));

  if (!visible.length) return null;
  return (
    <div className="pointer-events-none fixed top-[84px] right-8 z-40 flex w-80 flex-col gap-2">
      {visible.map((toast) => (
        <div
          key={toast.ployId}
          role="status"
          className="pointer-events-auto flex animate-[toast-in_300ms_ease-out] items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-avatar text-white">
            <Check size={12} strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{toast.title} is ready</p>
            <Link
              href={`/ploys/${toast.ployId}`}
              onClick={() => dismiss(toast.ployId)}
              className="text-[13px] text-accent underline-offset-2 hover:underline"
            >
              View
            </Link>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.ployId)} className="text-subtle">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
