import { getIntent, quickWins, type IntentId, type QuickWinId } from "@/lib/catalog";
import type { IntegrationCategory } from "@/lib/catalog/integrations";

// The two entry questions. Every later step (playback, quick win, map
// emphasis) branches on these answers.
export type WebsiteStatus = "unknown" | "has" | "none" | "not_live" | "unreadable";
export type GoalsStatus = "unknown" | "has" | "unsure";

export type Entry = {
  website: { status: WebsiteStatus; url: string | null };
  goals: {
    status: GoalsStatus;
    intents: { id: IntentId; weight: number }[];
    inUserWords: string | null;
    unmatched: string | null;
  };
  /** The user turn on which both answers were in; the first deliverable starts after it. */
  resolvedAtTurn?: number | null;
  /** Tools they told us they use, by capability (e.g. email: "Gmail"). Named, not connected: connecting needs their approval. */
  tools?: Partial<Record<IntegrationCategory, string>>;
};

export const emptyEntry: Entry = {
  website: { status: "unknown", url: null },
  goals: { status: "unknown", intents: [], inUserWords: null, unmatched: null },
  resolvedAtTurn: null,
};

/**
 * A · Targeted (site + goal), B · Diagnose (site, no goal),
 * C · Build (goal, no site), D · Starter (neither). Null until both are answered.
 */
export type EntryBranch = "A" | "B" | "C" | "D";

export function entryBranch(entry: Entry): EntryBranch | null {
  const site = entry.website.status;
  const goals = entry.goals.status;
  if (site === "unknown" || goals === "unknown") return null;
  const hasSite = site === "has";
  const hasGoal = goals === "has";
  if (hasSite) return hasGoal ? "A" : "B";
  return hasGoal ? "C" : "D";
}

export const branchNames: Record<EntryBranch, string> = {
  A: "Targeted",
  B: "Diagnose",
  C: "Build",
  D: "Starter",
};

export function topIntent(entry: Entry): IntentId | null {
  const [top] = [...entry.goals.intents].sort((a, b) => b.weight - a.weight);
  return top?.id ?? null;
}

export function defaultQuickWin(entry: Entry): QuickWinId | null {
  const branch = entryBranch(entry);
  if (!branch) return null;
  if (branch === "B") return "homepage_audit";
  if (branch === "D") return "landing_page_draft";
  const intent = topIntent(entry);
  const pick = intent ? getIntent(intent).quickWin : "homepage_audit";
  if (branch === "C" && quickWins[pick].needsWebsite) return "landing_page_draft";
  return pick;
}

/**
 * Accepts "acme.com", "www.acme.com/about", "https://acme.com", and the common
 * "acme,com" typo. Returns null if it isn't a URL.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/,(?=[a-z]{2,}(\/|$))/i, ".");
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname)) return null;
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** "https://www.acme-labs.com/x" → "Acme Labs" */
export function nameFromUrl(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const base = host.split(".")[0];
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
