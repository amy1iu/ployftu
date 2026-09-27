"use client";

import { ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { updateOnboardingStatus } from "@/app/actions";
import { useWorkspace } from "../workspace/workspace-provider";

/**
 * The end of the trail. Rather than a how-to, it leaves them with the idea of
 * Ploy as a teammate: it knows the business, remembers, keeps finding and doing
 * the work, and is worked with by just telling it things. (What they tell it
 * here updates their profile Docs, through profile notes.) Then a box to do
 * exactly that, and a button to finish onboarding.
 */
export function EndNode({ disabled, onAsk }: { disabled: boolean; onAsk: (text: string) => void }) {
  const { workspace } = useWorkspace();
  const [finishing, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const name = workspace.name === "New workspace" ? "your business" : workspace.name;

  return (
    <div className="w-[300px] animate-[level-pop_400ms_ease-out] space-y-2.5 rounded-2xl border border-ink/25 bg-white p-3.5 text-[13px]">
      <p className="text-[15px] font-medium text-ink">You&apos;re set up</p>
      <p className="leading-snug text-muted">
        I&apos;ve got a good sense of {name} now: what you do, who you&apos;re after, and where you want to grow. I&apos;ll remember all
        of it, and keep learning as we go.
      </p>
      <p className="leading-snug text-muted">
        Think of me as a teammate who&apos;s always on. I&apos;ll keep finding what&apos;s worth doing next and take care of the work.
        Whenever something changes, or you need a hand, just tell me.
      </p>
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
          placeholder="Message Ploy"
          aria-label="Message Ploy"
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
      {workspace.onboarding_status === "active" && (
        <button
          type="button"
          disabled={finishing}
          onClick={() => startTransition(() => updateOnboardingStatus(workspace.id, "completed"))}
          className="rounded-full border border-ink/20 px-3.5 py-1.5 text-[12.5px] text-ink hover:bg-canvas disabled:opacity-60"
        >
          {finishing ? "Finishing…" : "Finish onboarding"}
        </button>
      )}
    </div>
  );
}
