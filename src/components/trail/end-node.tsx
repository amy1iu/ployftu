"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startPloy, updateOnboardingStatus } from "@/app/actions";
import { Confetti } from "../confetti";
import { useWorkspace } from "../workspace/workspace-provider";

/** How long the confetti plays before Overview opens. */
const CELEBRATE_MS = 1600;

/**
 * The end of the trail. Rather than a how-to, it leaves them with the idea of
 * Ploy as a teammate: it knows the business, remembers, keeps finding and doing
 * the work, and is worked with by just telling it things. Then a box to do
 * exactly that (it starts a new ploy; what they say about the business there
 * updates their profile), and a button to finish onboarding: confetti, then
 * Overview.
 */
export function EndNode({ disabled }: { disabled: boolean }) {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const [finishing, startFinishing] = useTransition();
  const [starting, startStarting] = useTransition();
  const [celebrating, setCelebrating] = useState(false);
  const [draft, setDraft] = useState("");

  const finish = () => {
    setCelebrating(true);
    startFinishing(async () => {
      await Promise.all([
        updateOnboardingStatus(workspace.id, "completed"),
        new Promise((r) => setTimeout(r, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : CELEBRATE_MS)),
      ]);
      router.push("/overview");
    });
  };
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
          const text = draft.trim();
          if (!text) return;
          startStarting(async () => {
            const id = await startPloy(workspace.id, text);
            router.push(`/ploys/${id}`);
          });
        }}
        className="flex gap-1.5"
      >
        <input
          value={draft}
          disabled={disabled || starting}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="Start a new ploy"
          aria-label="Start a new ploy"
          className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-ink/40"
        />
        <button
          type="submit"
          disabled={disabled || starting || !draft.trim()}
          aria-label="Start ploy"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-50"
        >
          <ArrowUp size={15} />
        </button>
      </form>
      {workspace.onboarding_status === "active" && (
        <button
          type="button"
          disabled={finishing}
          onClick={finish}
          className="rounded-full border border-ink/20 px-3.5 py-1.5 text-[12.5px] text-ink hover:bg-canvas disabled:opacity-60"
        >
          {finishing ? "Finishing…" : "Finish onboarding"}
        </button>
      )}
      {celebrating && <Confetti />}
    </div>
  );
}
