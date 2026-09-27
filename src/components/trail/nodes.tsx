"use client";

import { ArrowRight, ArrowUp, Check, ChevronDown, Globe, LoaderCircle, Map as MapIcon, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { contextItems } from "@/lib/catalog/context";
import type { Ploy } from "@/lib/db/types";
import { essence, type AnsweredSlot, type Chip, type QuestionData } from "@/lib/onboarding/trail";
import type { SiteCrawl } from "@/lib/site/types";
import { Markdown } from "../markdown";
import { PloyAvatar } from "../ploy-avatar";

// The pieces of the Getting Started trail's spine: question cards, answered
// pills, and the nodes for work running in the background.

export type Answer = { text: string; slot: AnsweredSlot; value?: string };
type Card = Pick<QuestionData, "question" | "hint" | "chips">;

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** One question: chips to tap, or type anything. */
export function QuestionCard({
  card,
  slot,
  lead,
  disabled,
  onAnswer,
  unlocks,
  width = "w-[300px]",
}: {
  card: Card;
  slot: AnsweredSlot;
  /** The first deliverable answering this starts (e.g. "a 3-step outreach sequence"), said before they answer. */
  unlocks?: string | null;
  /** A line from Ploy before the question (a greeting, or a reply to what they said). */
  lead?: string | null;
  disabled: boolean;
  onAnswer: (answer: Answer) => void;
  width?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pick = (chip: Chip) => onAnswer({ text: chip.label, slot, value: chip.value });
  const send = () => {
    if (!draft.trim()) return setError("Pick a suggestion or type an answer first");
    onAnswer({ text: draft.trim(), slot });
    setDraft("");
  };

  return (
    <div className={`${width} animate-[level-pop_400ms_ease-out] rounded-2xl border border-ink/25 bg-white p-3.5 text-left`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted">
        <PloyAvatar size={18} />
        Ploy
      </div>
      {lead && <p className="mb-1.5 text-[13px] leading-snug text-muted">{lead}</p>}
      <p className="text-[14.5px] leading-snug font-medium text-ink">{card.question}</p>
      {card.hint && <p className="mt-1 text-[12px] leading-snug text-muted">{card.hint}</p>}
      {unlocks && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-accent-soft px-2.5 py-2 text-[12px] leading-snug text-accent">
          <Zap size={13} className="mt-px shrink-0" aria-hidden />
          <span>
            This will give me enough information to build {unlocks}. I&apos;ll kick that off in a new ploy with your answer.
          </span>
        </p>
      )}
      {card.chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {card.chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              disabled={disabled}
              onClick={() => pick(chip)}
              className="rounded-full border border-ink/15 bg-white px-2.5 py-1 text-[12px] text-ink hover:bg-canvas disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-2 flex gap-1.5"
      >
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
            setError(null);
          }}
          placeholder={card.chips.length ? "Or type your own" : "Type your answer"}
          aria-label="Your answer"
          className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-ink/40"
        />
        <button
          type="submit"
          disabled={disabled}
          aria-label="Send"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-50"
        >
          <ArrowUp size={15} />
        </button>
      </form>
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

/** The fork: a quick win now, or the main question (usually their goal). */
export function ForkCards({
  question,
  disabled,
  onAnswer,
}: {
  question: QuestionData;
  disabled: boolean;
  onAnswer: (answer: Answer) => void;
}) {
  const alt = question.alt!;
  return (
    <div className="relative flex flex-col items-center gap-3 pt-3 md:flex-row md:items-start md:justify-center">
      <span className="absolute top-0 right-1/4 left-1/4 hidden border-t border-dashed border-ink/20 md:block" aria-hidden />
      <div className="flex flex-col items-center gap-1.5">
        <span className="flex items-center gap-1 text-[12px] text-muted">
          <Zap size={12} /> Quick win · ready in minutes
        </span>
        <QuestionCard card={alt} slot={alt.slot} disabled={disabled} onAnswer={onAnswer} width="w-[280px]" />
        {question.unlocks && (
          <span className="max-w-[260px] text-center text-[11.5px] leading-snug text-muted">Or answer the other card, and I&apos;ll build {question.unlocks}.</span>
        )}
      </div>
      <span className="self-center bg-background px-1 text-[12px] text-subtle">or</span>
      <div className="flex flex-col items-center gap-1.5">
        <span className="flex items-center gap-1 text-[12px] text-muted">
          <MapIcon size={12} /> {question.slot === "goal_detail" ? "Bigger goal" : contextItems[question.slot].label} · fills your map
        </span>
        <QuestionCard card={question} slot={question.slot} unlocks={question.unlocks} disabled={disabled} onAnswer={onAnswer} width="w-[280px]" />
      </div>
    </div>
  );
}

/**
 * An answered question: the core of what was asked, and what the answer meant
 * (with how many tasks it put on the map). Click it to expand in place: the
 * whole question, their whole answer, and a way to change it.
 */
export function AnsweredNode({
  slot,
  summary,
  asked,
  said,
  tasks,
  pending,
  onHover,
}: {
  slot: AnsweredSlot;
  summary: string;
  /** The card that asked for it. */
  asked: Card | null;
  /** What they typed (null for a tapped chip). */
  said: string | null;
  tasks: number;
  pending?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const question = asked && essence(asked.question);

  const expanded = open && !pending;
  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`rounded-2xl border bg-white text-[13px] transition ${
        expanded ? "w-[300px] border-ink/25" : "max-w-[300px] border-border hover:border-ink/25"
      }`}
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
        className={`group flex w-full cursor-pointer flex-col px-3.5 py-1.5 disabled:cursor-default ${expanded ? "items-start pt-2.5 text-left" : "items-center"}`}
      >
        {question && (
          <span className={expanded ? "text-[12.5px] leading-snug text-muted" : "max-w-full truncate text-[11px] text-subtle"}>
            {question}
          </span>
        )}
        <span className={`flex max-w-full gap-2 ${expanded ? "mt-1 items-start" : "items-center"}`}>
          <span className="shrink-0 text-[12px] leading-[19px] text-subtle">{contextItems[slot]?.label ?? slot}</span>
          <span className={expanded ? "leading-snug text-ink" : `truncate ${pending ? "text-muted" : "text-ink"}`}>
            {expanded ? (said ?? summary) : summary}
          </span>
          {pending ? (
            <LoaderCircle size={13} className="mt-[3px] shrink-0 animate-spin text-subtle" />
          ) : (
            <Check size={13} strokeWidth={3} className={`shrink-0 text-avatar ${expanded ? "mt-[3px]" : ""}`} />
          )}
          {!pending && !expanded && tasks > 0 && (
            <span className="shrink-0 text-[12px] text-subtle">
              → {tasks} task{tasks === 1 ? "" : "s"}
            </span>
          )}
          {!pending && (
            <ChevronDown
              size={12}
              className={`shrink-0 text-subtle transition group-hover:text-ink ${expanded ? "mt-[4px] ml-auto rotate-180" : ""}`}
            />
          )}
        </span>
      </button>
      {expanded && tasks > 0 && (
        <p className="px-3.5 pb-2.5 text-[12px] text-subtle">
          Put {tasks} task{tasks === 1 ? "" : "s"} on your map
        </p>
      )}
    </div>
  );
}

/** Reading their site: pages tick in, then the profile we drafted from it. */
export function SiteReadNode({
  crawl,
  logo,
  profile,
  onConfirm,
  onFix,
}: {
  crawl: SiteCrawl;
  logo: string | null;
  /** What they do, once they've corrected it; otherwise the site's one-liner shows. */
  profile: string | null;
  onConfirm: () => void;
  onFix: (correction: string) => Promise<void>;
}) {
  const host = hostOf(crawl.url);
  const [fixing, setFixing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, startSaving] = useTransition();
  // Dashed means "not there yet" across the trail: only while the site is being read.
  const box = "w-[300px] rounded-2xl border border-ink/25 bg-white p-3 text-[13px]";

  if (crawl.status === "failed")
    return (
      <div className={`${box} flex items-center gap-2 text-muted`}>
        <X size={14} /> Couldn&apos;t read {host}
      </div>
    );
  if (crawl.status !== "done" || !crawl.summary)
    return (
      <div className={`${box} border-dashed`}>
        <p className="flex items-center gap-2 text-ink">
          <LoaderCircle size={14} className="animate-spin text-subtle" />
          {crawl.status === "summarizing" ? `Drafting your profile from ${host}` : `Reading ${host}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {crawl.pages.map((page) => (
            <span
              key={page.url}
              className={`animate-[level-pop_300ms_ease-out] rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                page.status === "reading" ? "bg-canvas text-subtle" : "bg-canvas text-muted"
              }`}
            >
              {page.path}
            </span>
          ))}
        </div>
      </div>
    );

  return (
    <div className={`${box} animate-[level-pop_400ms_ease-out]`}>
      <p className="flex items-center gap-2 text-muted">
        <Globe size={14} /> Read {crawl.pages.filter((p) => p.status === "done").length} pages from {host}
      </p>
      <div className="mt-2 flex gap-2 rounded-xl bg-canvas p-2 text-[12.5px] leading-snug">
        {logo && (
          // Their own logo, from their site; external, so a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-7 shrink-0 rounded-md bg-white object-contain p-0.5" />
        )}
        <span>{profile ?? crawl.summary.oneLiner}</span>
      </div>
      {fixing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            startSaving(async () => {
              await onFix(draft.trim());
              setFixing(false);
              setDraft("");
            });
          }}
          className="mt-2 space-y-1.5"
        >
          <textarea
            autoFocus
            rows={2}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder="What should I change? e.g. We mostly sell wholesale to cafés"
            aria-label="What to fix in your profile"
            className="w-full resize-none rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink/40"
          />
          <div className="flex items-center gap-3 text-[12px]">
            <button type="submit" disabled={saving || !draft.trim()} className="rounded-full bg-ink px-3 py-1 text-white disabled:opacity-50">
              {saving ? "Updating…" : "Update profile"}
            </button>
            <button type="button" onClick={() => setFixing(false)} className="text-muted underline">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex gap-3 text-[12px]">
          {crawl.confirmedAt ? (
            <span className="flex items-center gap-1 text-muted">
              <Check size={12} strokeWidth={3} className="text-avatar" /> {profile ? "Profile updated" : "Profile confirmed"}
            </span>
          ) : (
            <button type="button" onClick={onConfirm} className="text-ink underline">
              Looks right
            </button>
          )}
          <button type="button" onClick={() => setFixing(true)} className="text-muted underline">
            Fix something
          </button>
        </div>
      )}
    </div>
  );
}

/** The first deliverable: building while they keep answering, then ready to open. */
export function BuildNode({ ploy }: { ploy: Ploy }) {
  if (ploy.status === "done" || ploy.status === "live")
    return (
      <Link
        href={`/ploys/${ploy.id}`}
        className="flex max-w-[300px] animate-[level-pop_400ms_ease-out] items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-[13px] text-ink hover:border-ink/15"
        style={{ background: "var(--color-region-campaigns)" }}
      >
        <Sparkles size={13} className="shrink-0" />
        <span className="truncate">First win ready: {ploy.title}</span>
        <span className="shrink-0 underline">Open</span>
      </Link>
    );
  return (
    <div className="w-[300px] rounded-2xl border border-dashed border-ink/25 bg-white p-3 text-[13px]">
      <p className="flex items-center gap-2 text-ink">
        <LoaderCircle size={14} className="animate-spin text-subtle" /> Building your first win
      </p>
      <p className="mt-1 text-[12px] text-muted">
        {ploy.title}. Keep going, it runs on its own.{" "}
        <Link href={`/ploys/${ploy.id}`} className="inline-flex items-center gap-0.5 underline">
          Watch <ArrowRight size={11} />
        </Link>
      </p>
    </div>
  );
}

/** Ploy replying to something they said that the question wasn't about. */
export function ReplyNode({ said, text }: { said: string | null; text: string }) {
  return (
    <div className="w-[300px] space-y-1.5 rounded-2xl border border-border bg-white p-3 text-[13px]">
      {said && <p className="text-[12px] text-subtle">You: “{said}”</p>}
      <Markdown>{text}</Markdown>
    </div>
  );
}

/**
 * Where the next card will land, while Ploy picks it (a model call, ~1-2s).
 * A faint outline of a card, not a spinner: the trail keeps its shape, and the
 * card pops in over it.
 */
export function NextCardPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Choosing your next question"
      className="w-[300px] animate-[toast-in_300ms_ease-out] rounded-2xl border border-dashed border-ink/20 bg-white/60 p-3.5"
    >
      <div className="space-y-2 motion-safe:animate-pulse">
        <div className="h-2.5 w-3/4 rounded-full bg-ink/10" />
        <div className="h-2.5 w-1/2 rounded-full bg-ink/10" />
        <div className="flex gap-1.5 pt-1">
          {["w-16", "w-20", "w-14"].map((w) => (
            <div key={w} className={`h-5 ${w} rounded-full bg-ink/[0.06]`} />
          ))}
        </div>
      </div>
    </div>
  );
}
