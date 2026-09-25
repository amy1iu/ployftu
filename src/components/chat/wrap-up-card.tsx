"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { updateOnboardingStatus } from "@/app/actions";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { nodeState } from "@/lib/map/state";
import { tutorialProgress } from "@/lib/onboarding/tutorial";
import { useWorkspace } from "../workspace/workspace-provider";

/**
 * The end of the tutorial: what they've done, what's ready next, and what
 * unlocks by connecting tools, with a button to finish onboarding. Shown once
 * every tutorial step is done, until they finish (or skip) onboarding.
 */
export function WrapUpCard() {
  const state = useWorkspace();
  const { workspace, ploys, integrations, mapNodes } = state;
  const [finishing, startTransition] = useTransition();
  const progress = tutorialProgress(state);
  if (workspace.onboarding_status !== "active" || progress.done < progress.total) return null;

  const states = mapNodes.map((node) => ({ node, ...nodeState(node, { ploys, integrations, mapNodes }) }));
  const done = states.filter((s) => s.state === "done" || s.state === "live");
  const ready = states.filter((s) => s.state === "available");
  const needs = [...new Set(states.flatMap((s) => s.missing))] as IntegrationCategory[];

  return (
    <div className="mx-2 space-y-4 rounded-2xl p-5" style={{ background: "color-mix(in srgb, var(--color-ploy-pink) 55%, white)" }}>
      <p className="font-display text-[30px] leading-none tracking-wide text-ink uppercase">You&apos;re set up.</p>
      <ul className="space-y-1.5 text-[13px] text-ink">
        {progress.steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2">
            <span className="flex size-4 items-center justify-center rounded-full bg-ink text-white">
              <Check size={10} strokeWidth={3.5} />
            </span>
            {step.label}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: done.length, label: "tasks done" },
          { value: ready.length, label: "ready to start" },
          { value: states.length - done.length - ready.length, label: "more to unlock" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white p-3">
            <p className="font-display text-[26px] leading-none text-ink">{stat.value}</p>
            <p className="text-[11px] text-muted">{stat.label}</p>
          </div>
        ))}
      </div>
      {(ready.length > 0 || needs.length > 0) && (
        <p className="text-[13px] text-ink">
          {ready.length > 0 && (
            <>
              Next up on your map: <strong>{ready[0].node.title}</strong>.{" "}
            </>
          )}
          {needs.length > 0 &&
            `Connect ${needs.map((c) => integrationCategories[c].need).join(", ")} to unlock more.`}
        </p>
      )}
      <button
        type="button"
        disabled={finishing}
        onClick={() => startTransition(() => updateOnboardingStatus(workspace.id, "completed"))}
        className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {finishing ? "Finishing…" : "Finish onboarding"}
      </button>
    </div>
  );
}
