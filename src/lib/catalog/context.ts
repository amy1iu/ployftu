import type { Doc, Integration, Ploy, Workspace } from "@/lib/db/types";
import type { ProfileDocSlug, SectionMeta } from "@/lib/docs/profile";

// What Getting Started wants to learn about a business, as a registry the
// chat model plans from: each turn it picks the item that unlocks the most for
// them next (or finishes), and writes the question. Code only records answers
// and says what's already known. Most items live in a profile Doc section;
// website, goal, quick win, and tool have their own records (the entry, the
// first deliverable, named tools).

export const contextItemIds = [
  "website",
  "target_customer",
  "business_model",
  "current_acquisition",
  "constraints",
  "goal_detail",
  "quick_win_offer",
  "tool",
] as const;

export type ContextItemId = (typeof contextItemIds)[number];

/** What `known()` reads: the workspace as it stands. */
export type ContextState = {
  workspace: Pick<Workspace, "entry" | "crawl">;
  docs: Pick<Doc, "slug" | "sections">[];
  ploys: Pick<Ploy, "spec">[];
  integrations: Pick<Integration, "category">[];
};

type Section = { doc: ProfileDocSlug; section: string };

export type ContextItem = {
  /** The answered pill's label on the trail. */
  label: string;
  /** What knowing it unlocks, for the planner. */
  why: string;
  /** Profile sections an answer is written to, and read from. Empty when it has its own record. */
  sections: Section[];
  /** Told by them (or otherwise settled): never ask again. */
  known: (state: ContextState) => boolean;
  /** Drafted from their site, unconfirmed: worth confirming, not asking cold. */
  inferred: (state: ContextState) => boolean;
};

const statusOf = (docs: ContextState["docs"], { doc, section }: Section): SectionMeta["status"] =>
  docs.find((d) => d.slug === doc)?.sections[section]?.status ?? "empty";

/** A profile-backed item: known once they've said it, inferred while only their site has. */
const fromProfile = (label: string, why: string, sections: Section[]): ContextItem => ({
  label,
  why,
  sections,
  known: ({ docs }) => sections.some((s) => statusOf(docs, s) === "confirmed"),
  inferred: ({ docs }) =>
    sections.some((s) => statusOf(docs, s) === "inferred") && !sections.some((s) => statusOf(docs, s) === "confirmed"),
});

const never = () => false;

export const contextItems: Record<ContextItemId, ContextItem> = {
  website: {
    label: "Website",
    why: "Ploy reads it and drafts their profile, so they don't have to explain their business.",
    sections: [],
    known: ({ workspace }) => workspace.entry.website.status !== "unknown",
    inferred: never,
  },
  target_customer: fromProfile(
    "Customers",
    "Who they most want to reach. Every list, message, and ad Ploy makes is aimed at them; outreach, lead lists, and lookalikes wait on it. Their site only says who buys today.",
    [{ doc: "business-overview", section: "who-we-serve" }],
  ),
  business_model: fromProfile(
    "Business",
    "What they sell and how they make money (products or services, pricing, one-off or recurring). Landing pages, offers, and site tasks wait on it.",
    [
      { doc: "business-overview", section: "what-we-do" },
      { doc: "business-overview", section: "offering" },
    ],
  ),
  current_acquisition: fromProfile(
    "Channels",
    "How customers find them today. Shows what to double down on and which channels are untapped.",
    [{ doc: "channels-and-tools", section: "acquisition" }],
  ),
  constraints: fromProfile(
    "Constraints",
    "Budget, time, team, or things they won't do. Keeps suggestions realistic.",
    [{ doc: "goals-and-focus", section: "constraints" }],
  ),
  goal_detail: {
    label: "Goal",
    why: "What they most want to grow in the next few months. Decides which tasks fill their map and their first deliverable.",
    sections: [{ doc: "goals-and-focus", section: "goals" }],
    known: ({ workspace }) => workspace.entry.goals.status !== "unknown",
    inferred: never,
  },
  quick_win_offer: {
    label: "Quick win",
    why: "Something useful in a few minutes (e.g. a homepage audit), built while they keep answering. Proves value early.",
    sections: [],
    known: ({ ploys }) => ploys.some((p) => p.spec?.source === "quick_win"),
    inferred: never,
  },
  tool: {
    label: "Tools",
    why: "The tool they use for what most of their tasks need (e.g. their email), so Connect offers it first. Never connects anything.",
    sections: [],
    known: ({ workspace, integrations }) => Object.keys(workspace.entry.tools ?? {}).length > 0 || integrations.length > 0,
    inferred: never,
  },
};

// Business context a task needs before Ploy can do it well (a Ploybook's
// `needsContext`), e.g. who they sell to. Each key maps to a section of the
// profile Docs, and to the registry item whose answer fills it; it's known
// once that section has anything in it (from their site or their answers).
export const contextKeys = {
  offering: { doc: "business-overview", section: "what-we-do", need: "what you sell", item: "business_model" },
  audience: { doc: "business-overview", section: "who-we-serve", need: "who you sell to", item: "target_customer" },
  goal: { doc: "goals-and-focus", section: "goals", need: "your goal", item: "goal_detail" },
} as const satisfies Record<string, Section & { need: string; item: ContextItemId }>;

export type ContextKey = keyof typeof contextKeys;
