import type { Doc, Integration, Ploy, Workspace } from "@/lib/db/types";
import type { ProfileDocSlug } from "@/lib/docs/profile";

// What Ploy needs to know about a business to tailor its recommendations: the
// registry the Getting Started trail asks from. Each item says what its answer
// unlocks (`why`), whether we already know it (`known`, derived from the
// workspace: their site, earlier answers, tools, tasks), and where an answer is
// recorded. `website`, `quick_win_offer` and `tool` are recorded by their own
// code (the entry, a task ploy, the tools list); the rest land in a profile section.

export type ContextItemId =
  | "website"
  | "target_customer"
  | "business_model"
  | "current_acquisition"
  | "constraints"
  | "goal_detail"
  | "quick_win_offer"
  | "tool";

/** What `known()` reads. */
export type KnownState = {
  workspace: Workspace;
  docs: Pick<Doc, "slug" | "sections">[];
  ploys: Ploy[];
  integrations: Integration[];
};

export type SectionRef = { doc: ProfileDocSlug; section: string };

export type ContextItem = {
  /** The answered pill's label on the trail. */
  label: string;
  /** What knowing it unlocks: shown to the model that words the question and to the one that picks it. */
  why: string;
  /** The profile section an answer is recorded in; null for the ones with their own handling. */
  record: SectionRef | null;
  known: (state: KnownState) => boolean;
};

const statusOf = (docs: KnownState["docs"], { doc, section }: SectionRef) =>
  docs.find((d) => d.slug === doc)?.sections[section]?.status;
/** Anything in the section, from their site or from them; `confirmed` means from them. */
const filled = (docs: KnownState["docs"], ref: SectionRef, { confirmed = false } = {}) => {
  const status = statusOf(docs, ref);
  return confirmed ? status === "confirmed" : !!status && status !== "empty";
};

const whoWeServe: SectionRef = { doc: "business-overview", section: "who-we-serve" };
const whatWeDo: SectionRef = { doc: "business-overview", section: "what-we-do" };
const offering: SectionRef = { doc: "business-overview", section: "offering" };
const acquisition: SectionRef = { doc: "channels-and-tools", section: "acquisition" };
const constraints: SectionRef = { doc: "goals-and-focus", section: "constraints" };

export const contextItems: Record<ContextItemId, ContextItem> = {
  website: {
    label: "Website",
    why: "Reading their site fills in what they sell, who buys, and their brand, so we ask far less.",
    record: null,
    known: ({ workspace }) => workspace.entry.website.status !== "unknown",
  },
  target_customer: {
    label: "Customers",
    why: "Who they most want to reach: every list, message, page and ad Ploy makes is aimed at them.",
    record: whoWeServe,
    // Their site says who buys today; who they want to reach is theirs to say.
    known: ({ docs }) => filled(docs, whoWeServe, { confirmed: true }),
  },
  business_model: {
    label: "Business",
    why: "What they sell and how they charge, so Ploy's pages, offers and outreach describe it right.",
    // "What we do" is what tasks wait on (the `offering` context key); pricing
    // detail reaches the offering section through profile notes.
    record: whatWeDo,
    known: ({ docs }) => filled(docs, whatWeDo) || filled(docs, offering),
  },
  current_acquisition: {
    label: "Channels",
    why: "How customers find them today, so Ploy builds on what already works instead of starting from zero.",
    record: acquisition,
    known: ({ docs }) => filled(docs, acquisition),
  },
  constraints: {
    label: "Constraints",
    why: "Budget, time, team or compliance limits that rule some tasks in or out (e.g. no ad budget, no time to post).",
    record: constraints,
    known: ({ docs }) => filled(docs, constraints),
  },
  goal_detail: {
    label: "Goal",
    why: "What they most want to grow in the next few months: decides which tasks the map shows first.",
    record: { doc: "goals-and-focus", section: "goals" },
    known: ({ workspace }) => workspace.entry.goals.status !== "unknown",
  },
  quick_win_offer: {
    label: "Quick win",
    why: "Something useful within minutes, so they see value before answering more.",
    record: null,
    known: ({ ploys }) => ploys.some((p) => p.spec?.source === "quick_win"),
  },
  tool: {
    label: "Tools",
    why: "The tool the most tasks need, so Connect can offer it first.",
    record: null,
    known: ({ workspace, integrations }) => Object.keys(workspace.entry.tools ?? {}).length > 0 || integrations.length > 0,
  },
};

export const contextItemIds = Object.keys(contextItems) as ContextItemId[];

/** Which items are known now. */
export const knownItems = (state: KnownState) =>
  Object.fromEntries(contextItemIds.map((id) => [id, contextItems[id].known(state)])) as Record<ContextItemId, boolean>;

// Business context a task needs before Ploy can do it well (PloybookSpec.needsContext).
// The older keys, kept as aliases: each names the registry item that answers it
// and the section that has to be filled (from their site or their answers).
export const contextKeys = {
  offering: { item: "business_model", doc: "business-overview", section: "what-we-do", need: "what you sell" },
  audience: { item: "target_customer", doc: "business-overview", section: "who-we-serve", need: "who you sell to" },
  goal: { item: "goal_detail", doc: "goals-and-focus", section: "goals", need: "your goal" },
} as const satisfies Record<string, SectionRef & { item: ContextItemId; need: string }>;

export type ContextKey = keyof typeof contextKeys;
