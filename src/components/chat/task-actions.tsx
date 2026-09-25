"use client";

import { RotateCcw, Star } from "lucide-react";
import { useTransition } from "react";
import { retryQuickWin, setPloybookLive } from "@/app/actions";
import type { Ploy } from "@/lib/db/types";

const triggerCopy = { schedule: "on a schedule", event: "whenever its trigger happens" };

/**
 * What you can do with a task once it's finished (or stuck): turn a recurring
 * Ploybook on so it runs by itself, or retry a first deliverable that failed.
 */
export function TaskActions({ ploy }: { ploy: Ploy }) {
  const [pending, startTransition] = useTransition();
  const spec = ploy.spec;
  if (!spec) return null;

  if (ploy.status === "idle" && spec.source === "quick_win")
    return (
      <Bar text="This didn't finish.">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => retryQuickWin(ploy.id))}
          className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[13px] text-white disabled:opacity-60"
        >
          <RotateCcw size={13} /> Try again
        </button>
      </Bar>
    );

  if (spec.trigger !== "manual" && (ploy.status === "done" || ploy.status === "live")) {
    const live = ploy.status === "live";
    return (
      <Bar
        text={
          live ? (
            <span className="flex items-center gap-1.5">
              <Star size={13} fill="currentColor" /> Live: runs {triggerCopy[spec.trigger]}.
            </span>
          ) : (
            `This Ploybook can run by itself, ${triggerCopy[spec.trigger]}.`
          )
        }
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setPloybookLive(ploy.id, !live))}
          className={`rounded-full px-3.5 py-1.5 text-[13px] disabled:opacity-60 ${
            live ? "border border-ink/15 hover:bg-canvas" : "bg-ink text-white"
          }`}
        >
          {live ? "Turn off" : "Turn on"}
        </button>
      </Bar>
    );
  }
  return null;
}

function Bar({ text, children }: { text: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-[13px] text-ink">
      {text}
      {children}
    </div>
  );
}
