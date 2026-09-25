import { Check, Circle, LoaderCircle } from "lucide-react";
import type { PlanData } from "@/lib/quick-wins/types";

/** A Ploybook's steps ticking through. Ploy primitives are solid chips; the agent's own research tools are outlined. */
export function PlanCard({ steps }: PlanData) {
  return (
    <ol className="space-y-2 rounded-xl border border-border bg-surface p-4">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-2.5 text-[13px]">
          {step.status === "done" ? (
            <Check size={15} className="shrink-0 text-avatar" />
          ) : step.status === "running" ? (
            <LoaderCircle size={15} className="shrink-0 animate-spin text-subtle" />
          ) : (
            <Circle size={15} className="shrink-0 text-border" />
          )}
          <span className={step.status === "pending" ? "text-subtle" : ""}>{step.label}</span>
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
              step.kind === "primitive" ? "bg-accent-soft text-accent" : "border border-border text-muted"
            }`}
          >
            {step.name}
          </span>
        </li>
      ))}
    </ol>
  );
}
