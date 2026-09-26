import type { UIMessage } from "ai";
import { contextItems, type ContextItemId, type KnownState } from "@/lib/catalog/context";
import { getIntent, type IntentId } from "@/lib/catalog/intents";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import type { MapNode, Workspace } from "@/lib/db/types";
import { hasContext } from "@/lib/docs/profile";
import { toolToAsk } from "@/lib/map/plan";
import { topIntent } from "./entry";

// Getting Started is a trail of small questions, each answerable in under a
// minute, each asking for one item of the context registry (catalog/context.ts).
// By default the code picks the next one, always in this order, skipping any
// whose answer we already have (from their site or an earlier answer):
//
//   website → business_model (no site) → goal_detail, forked with a
//   quick_win_offer → the other one → target_customer → tool → done
//
// With the `next_info` decision on (see ai/jev.ts), only the website stays
// first; after it, a decision model picks the next unknown item, up to a cap.
//
// Chips carry values, so tapping one records the answer exactly, with no model
// call. Typed answers go through the extractor (or the decision model).

/** A question on the trail asks for one registry item; the goal question can carry a quick-win card beside it (`alt`). */
export type QuestionSlot = ContextItemId;
/** What an answer records; answering the fork records `goal_detail` or `quick_win_offer`. */
export type AnsweredSlot = ContextItemId;

/** Most questions the trail asks before it's done, when a model picks them. */
export const MAX_TRAIL_QUESTIONS = 6;

export type Chip = { label: string; value: string };

type Card = { question: string; hint: string | null; chips: Chip[] };

/** A question as the trail shows it (the `data-question` part). */
export type QuestionData = Card & {
  slot: QuestionSlot;
  /** The tool question's capability. */
  category: IntegrationCategory | null;
  /** The fork's second card: a quick win, offered beside the goal question. */
  alt: (Card & { slot: "quick_win_offer" }) | null;
  /** The message before it replies to something off-script. */
  offScript: boolean;
};

/** Written when an answer lands: what it means, for the answered pill (the `data-answered` part). */
export type AnsweredData = { slot: AnsweredSlot; summary: string };

/** A user message's metadata: which card it answers, the chip's value if they tapped one, and whether it changes an earlier answer. */
export type TrailMetadata = { slot?: AnsweredSlot; value?: string; redo?: boolean };

/** Answers that can be changed later. A quick win, once started, can't. */
export const canRedo = (slot: AnsweredSlot) => slot !== "quick_win_offer";

/** The fork: the goal question with a quick win beside it. */
export const isFork = (q: Pick<QuestionData, "alt">) => !!q.alt;

// Slots before the registry, still in saved conversations and map anchors.
const legacySlots: Record<string, ContextItemId> = {
  sell: "business_model",
  fork: "goal_detail",
  goal: "goal_detail",
  followup: "target_customer",
  quick_win: "quick_win_offer",
};
export const slotOf = (slot: string) => (legacySlots[slot] ?? slot) as ContextItemId;

/**
 * The next question, before any model wording. `question: null` or
 * `chips: null` means the model writes them (the follow-up, which is specific
 * to their business); `guide` tells it what to ask.
 */
export type NextQuestion = Omit<QuestionData, "question" | "chips" | "offScript"> & {
  question: string | null;
  chips: Chip[] | null;
  guide: string;
};

/** A question's core, without lead-ins like "While that builds:". */
export const essence = (question: string) => {
  const core = question.replace(/^[^:?]{1,30}:\s*/, "");
  return core.charAt(0).toUpperCase() + core.slice(1);
};

export const websiteQuestion = (): QuestionData => ({
  slot: "website",
  question: "What's your website?",
  hint: "I'll read it, so you don't have to explain your business.",
  chips: [
    { label: "I don't have one yet", value: "none" },
    { label: "It's not live yet", value: "not_live" },
  ],
  category: null,
  alt: null,
  offScript: false,
});

const defaultGoals: Record<"site" | "noSite", IntentId[]> = {
  site: ["convert_site_visitors", "get_more_leads", "run_outbound", "launch_paid_ads"],
  noSite: ["get_more_leads", "grow_content_brand", "launch_paid_ads", "run_outbound"],
};

/** Saying you don't know counts as an answer; the trail moves on. */
export const notSure: Chip = { label: "Not sure yet", value: "unsure" };
export const soundsUnsure = (text: string) => /\b(not sure|no idea|don'?t know|dunno|idk|unsure)\b/i.test(text);

/** The four goals most likely to fit (what their site suggests first), plus "not sure". */
export function goalChips(workspace: Workspace): Chip[] {
  const suggested = (workspace.crawl?.opportunities ?? []).map((o) => o.intent);
  const defaults = defaultGoals[workspace.entry.website.status === "has" ? "site" : "noSite"];
  const picks = [...new Set([...suggested, ...defaults])].slice(0, 4);
  return [...picks.map((id) => ({ label: getIntent(id).label, value: id })), notSure];
}

/** The follow-up's chips: the model's guesses at who they sell to, plus "not sure". */
export const followupChips = (labels: string[]): Chip[] => [
  ...labels.slice(0, 3).map((label) => ({ label, value: label })),
  notSure,
];

const quickWinOrder: QuickWinId[] = ["homepage_audit", "outreach_sequence", "lookalike_accounts", "social_posts", "landing_page_draft"];

/** Three quick wins that fit: a homepage audit when they have a site, a landing page when they don't. */
export function quickWinChips(workspace: Workspace): Chip[] {
  const hasSite = workspace.entry.website.status === "has";
  const suggested = (workspace.crawl?.opportunities ?? []).map((o) => getIntent(o.intent).quickWin);
  const first: QuickWinId[] = hasSite ? ["homepage_audit"] : ["landing_page_draft"];
  return [...new Set([...first, ...suggested, ...quickWinOrder])]
    .filter((id) => hasSite || !quickWins[id].needsWebsite)
    .slice(0, 3)
    .map((id) => ({ label: quickWins[id].label, value: id }));
}

const toolQuestions: Record<IntegrationCategory, string> = {
  email: "Where do you send email from today?",
  crm: "Where do your leads and contacts live today?",
  social: "Which social account matters most for you?",
  search_ads: "Which search ads account do you use?",
  social_ads: "Which social ads account do you use?",
  analytics: "What do you use to track site visits?",
  store: "Where do you sell online?",
  team_chat: "Where does your team chat?",
};

const goalCard = (workspace: Workspace, lead = ""): Card => ({
  question: `${lead}What do you most want to grow in the next few months?`,
  hint: "Reveals the tasks that move it.",
  chips: goalChips(workspace),
});

const base = { category: null, alt: null } as const;

export type TrailState = KnownState & {
  mapNodes: MapNode[];
  answered: ReadonlySet<AnsweredSlot>;
};

const hasQuickWin = ({ ploys }: Pick<TrailState, "ploys">) => ploys.some((p) => p.spec?.source === "quick_win");

/** The goal question: forked with a quick win until they have one. */
function goalQuestion(state: TrailState, lead: string): NextQuestion {
  const { workspace } = state;
  const guide = "Ask what they most want to grow.";
  if (hasQuickWin(state) || state.answered.has("quick_win_offer"))
    return { ...base, slot: "goal_detail", ...goalCard(workspace, lead), guide };
  return {
    slot: "goal_detail",
    ...goalCard(workspace),
    category: null,
    alt: {
      slot: "quick_win_offer",
      question: "Want something useful in the next few minutes?",
      hint: "Pick one and I'll start right away.",
      chips: quickWinChips(workspace),
    },
    guide,
  };
}

function sellQuestion({ workspace }: TrailState): NextQuestion {
  const { entry, crawl } = workspace;
  const unreadable = entry.website.status === "unreadable" || crawl?.status === "failed";
  return {
    ...base,
    slot: "business_model",
    question: "In a sentence, what does your business sell?",
    hint: unreadable ? "I couldn't read your site, so a sentence from you is the fastest way in." : null,
    chips: [],
    guide: "Ask what their business sells, in a sentence.",
  };
}

function toolQuestion(category: IntegrationCategory): NextQuestion {
  const { tools } = integrationCategories[category];
  return {
    ...base,
    slot: "tool",
    category,
    question: toolQuestions[category],
    hint: "You'll connect it yourself when a task needs it. Ploy never connects without your approval.",
    chips: [
      ...tools.slice(0, 3).map((tool) => ({ label: tool, value: `${category}:${tool}` })),
      { label: "Skip for now", value: "skip" },
    ],
    guide: `Ask which ${integrationCategories[category].name.toLowerCase()} tool they use.`,
  };
}

const openHints: Partial<Record<ContextItemId, string>> = {
  target_customer: "So everything Ploy makes speaks to them.",
  business_model: "So Ploy describes what you sell the way you would.",
  current_acquisition: "So Ploy builds on what already works.",
  constraints: "So Ploy only suggests what fits.",
};

/** An open question, worded by the model from what the item unlocks. */
const askOpen = (item: ContextItemId): NextQuestion => ({
  ...base,
  slot: item,
  question: null,
  hint: openHints[item] ?? null,
  chips: null,
  guide: `Ask about: ${item} — ${contextItems[item].why}`,
});

/**
 * The items the trail could ask about now: not known, not answered, and with a
 * question to ask (the tool question needs a tool the map is waiting on; the
 * goal and quick win go once).
 */
export function askable(state: TrailState): ContextItemId[] {
  const { answered } = state;
  const open = (item: ContextItemId) => !answered.has(item) && !contextItems[item].known(state);
  const items: ContextItemId[] = [];
  if (open("website")) items.push("website");
  if (open("goal_detail")) items.push("goal_detail");
  if (open("quick_win_offer")) items.push("quick_win_offer");
  for (const item of ["target_customer", "business_model", "current_acquisition", "constraints"] as const)
    if (open(item)) items.push(item);
  if (!answered.has("tool") && toolToAsk(state)) items.push("tool");
  return items;
}

/**
 * The question for a registry item the decision model picked. Fixed items keep
 * their canned cards (so chip taps need no model); open ones are worded by the
 * model from what the item unlocks.
 */
export function questionForItem(item: ContextItemId, state: TrailState): NextQuestion | null {
  switch (item) {
    case "website": {
      const { question, hint, chips } = websiteQuestion();
      return { ...base, slot: "website", question, hint, chips, guide: "Ask for their website." };
    }
    case "goal_detail":
    case "quick_win_offer": {
      if (state.workspace.entry.goals.status === "unknown") return goalQuestion(state, "");
      if (hasQuickWin(state)) return null;
      const { question, hint, chips } = goalQuestion({ ...state, answered: new Set() }, "").alt!;
      return { ...base, slot: "quick_win_offer", question, hint, chips, guide: "Offer a quick win." };
    }
    case "tool": {
      const category = toolToAsk(state);
      return category ? toolQuestion(category) : null;
    }
    default:
      return askOpen(item);
  }
}

/**
 * The next question, or null once there's nothing left to ask. Without a
 * `plan`, the fixed order above; with one (the decision model's pick, or null
 * for "nothing worth asking"), the website still comes first and the trail
 * stops after MAX_TRAIL_QUESTIONS.
 */
export function nextQuestion(state: TrailState, plan?: { item: ContextItemId | null }): NextQuestion | null {
  const { workspace, docs, answered } = state;
  const { entry, crawl } = workspace;
  const pick = (slot: AnsweredSlot) => !answered.has(slot);

  if (entry.website.status === "unknown" && pick("website")) return questionForItem("website", state);

  if (plan) {
    if (answered.size >= MAX_TRAIL_QUESTIONS || !plan.item) return null;
    return questionForItem(plan.item, state);
  }

  const noSite = entry.website.status !== "has" || crawl?.status === "failed";
  if (noSite && !hasContext(docs, "offering") && pick("business_model")) return sellQuestion(state);

  const goalUnknown = entry.goals.status === "unknown";
  if (goalUnknown && !hasQuickWin(state) && pick("goal_detail") && pick("quick_win_offer")) return goalQuestion(state, "");
  if (goalUnknown && pick("goal_detail")) return goalQuestion(state, "While that builds: ");

  // Their site says who buys today; who they want to reach for this goal is theirs to say.
  if (!contextItems.target_customer.known(state) && pick("target_customer")) {
    const intent = topIntent(entry);
    const ask = intent ? getIntent(intent).audienceQuestion : "Who are your best customers?";
    return {
      ...base,
      slot: "target_customer",
      question: null,
      hint: openHints.target_customer!,
      chips: null,
      guide: `Ask who they most want to reach, adapting this to their business and goal: "${ask}"`,
    };
  }

  const category = pick("tool") ? toolToAsk(state) : null;
  return category ? toolQuestion(category) : null;
}

type Parts = UIMessage["parts"];
const dataOf = <T,>(parts: Parts, type: string) =>
  parts.filter((p) => p.type === type).map((p) => (p as { data: T }).data);

/** A saved question, with pre-registry slots mapped to registry items. */
export const questionOf = (q: QuestionData): QuestionData => ({
  ...q,
  slot: slotOf(q.slot),
  alt: q.alt && { ...q.alt, slot: "quick_win_offer" },
});

/** The latest question asked, if any. */
export function lastQuestion(messages: UIMessage[]): QuestionData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    const [question] = dataOf<QuestionData>(messages[i].parts, "data-question");
    if (question) return questionOf(question);
  }
  return null;
}

/** Whether a question asked for a slot (the fork asks for the goal and the quick win). */
export const asksFor = (question: QuestionData, slot: AnsweredSlot) =>
  question.slot === slot || (isFork(question) && slot === "quick_win_offer");

/** The latest question that asked for a slot. */
export function questionFor(messages: UIMessage[], slot: AnsweredSlot): QuestionData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const [saved] = dataOf<QuestionData>(messages[i].parts, "data-question");
    const question = saved && questionOf(saved);
    if (question && asksFor(question, slot)) return question;
  }
  return null;
}

/** Every slot answered so far on the trail. */
export const answeredSlots = (messages: UIMessage[]) =>
  new Set(messages.flatMap((m) => dataOf<AnsweredData>(m.parts, "data-answered").map((a) => slotOf(a.slot))));

/** The question on screen, if it hasn't been answered yet (none once the trail is done). */
export function openQuestion(messages: UIMessage[]): QuestionData | null {
  const question = lastQuestion(messages);
  if (!question) return null;
  const answered = answeredSlots(messages);
  const done = answered.has(question.slot) || (isFork(question) && answered.has("quick_win_offer"));
  return done ? null : question;
}
