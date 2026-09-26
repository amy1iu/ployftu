"use client";

import { ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { updateOnboardingStatus } from "@/app/actions";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { nodeState } from "@/lib/map/state";
import { useWorkspace } from "../workspace/workspace-provider";

/** How Ploy works, in three steps: the mental model to leave them with. */
const howItWorks = [
  "Pick a task from your list. Each one is a Ploybook built from Ploy's building blocks.",
  "It runs in its own ploy. Watch it work, and chat there to steer it.",
  "What it makes lands in your Docs. Recurring ones keep running on their own.",
];

/**
 * The end of the trail: how Ploy works from here, what's next on the map, what
 * connecting tools would unlock, a button to finish onboarding, and a box to
 * keep chatting.
 */
export function EndNode({ disabled, onAsk }: { disabled: boolean; onAsk: (text: string) => void }) {
  const { workspace, ploys, integrations, mapNodes, docs } = useWorkspace();
  const [finishing, startTransition] = useTransition();
  const [draft, setDraft] = useState("");

  const states = mapNodes.map((node) => ({ node, ...nodeState(node, { ploys, integrations, mapNodes, docs }) }));
  const done = states.filter((s) => s.state === "done" || s.state === "live").length;
  const ready = states.filter((s) => s.state === "available");
  const needs = [...new Set(states.flatMap((s) => s.missing))] as IntegrationCategory[];
  // Name the tool they said they use, if they did.
  const connect = needs.map((c) => workspace.entry.tools?.[c] ?? integrationCategories[c].need);

  return (
    <div className="w-[300px] animate-[level-pop_400ms_ease-out] space-y-2.5 rounded-2xl border border-ink/25 bg-white p-3.5 text-[13px]">
      <p className="text-[15px] font-medium text-ink">You&apos;re set up</p>
      <ol className="space-y-1.5 leading-snug text-muted">
        {howItWorks.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-canvas text-[11px] text-ink">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <p className="leading-snug text-muted">
        {ready.length} task{ready.length === 1 ? "" : "s"} ready, {done} done.
        {ready.length > 0 && (
          <>
            {" "}
            Next up: <span className="text-ink">{ready[0].node.title}</span>.
          </>
        )}
        {connect.length > 0 && ` Connect ${new Intl.ListFormat("en", { type: "conjunction" }).format(connect)} to unlock more.`}
      </p>
      {workspace.onboarding_status === "active" && (
        <button
          type="button"
          disabled={finishing}
          onClick={() => startTransition(() => updateOnboardingStatus(workspace.id, "completed"))}
          className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {finishing ? "Finishing…" : "Finish onboarding"}
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onAsk(draft.trim());
          setDraft("");
        }}
        className="flex gap-1.5"
      >
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="Ask Ploy anything"
          aria-label="Ask Ploy"
          className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-ink/40"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          aria-label="Send"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-50"
        >
          <ArrowUp size={15} />
        </button>
      </form>
    </div>
  );
}
