import type { UIMessage } from "ai";
import { contextItems, contextKeys, type ContextItemId } from "@/lib/catalog/context";
import { getIntent, type IntentId } from "@/lib/catalog/intents";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import type { Doc, Integration, MapNode, Ploy, Workspace } from "@/lib/db/types";
import { cleanQuestion } from "@/lib/ai/onboarding/sentences";
import { hasContext } from "@/lib/docs/profile";
import { toolToAsk } from "@/lib/map/plan";

// Getting Started is a trail of small questions, each answerable in under a
// minute. The chat model plans it: each turn it picks the context item (see
// the registry in catalog/context) that unlocks the most for this business
// next, writes the card, or finishes. Code enforces only two rules: the
// website comes first (it's the fastest way in), and the trail stops after
// MAX_ANSWERED answers. Ordering, never re-asking, offering the quick win
// early, and when to stop are the prompt's job, measured by the entry eval.
//
// Chips carry values, so tapping one records the answer exactly, with no
// extraction. Where chip values drive code (goals, quick wins, tools), code
// supplies the options and the model only picks, orders, and words them.
// Typed answers go through the extractor.

/** What an answer records: a registry item. Answering the fork's quick-win card records `quick_win_offer`. */
export type AnsweredSlot = ContextItemId;

export type Chip = { label: string; value: string };

type Card = { question: string; hint: string | null; chips: Chip[] };

/** A question as the trail shows it (the `data-question` part). */
export type QuestionData = Card & {
  /** The item it asks about. */
  slot: ContextItemId;
  /** The tool question's capability. */
  category: IntegrationCategory | null;
  /** A second card offered alongside (the fork): a quick win. */
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

/** The trail ends after this many answers (the website included), whatever the model plans. */
export const MAX_ANSWERED = 6;

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
export const skip: Chip = { label: "Skip for now", value: "skip" };
export const soundsUnsure = (text: string) => /\b(not sure|no idea|don'?t know|dunno|idk|unsure)\b/i.test(text);

/** The four goals most likely to fit (what their site suggests first), plus "not sure". */
export function goalChips(workspace: Pick<Workspace, "entry" | "crawl">): Chip[] {
  const suggested = (workspace.crawl?.opportunities ?? []).map((o) => o.intent);
  const defaults = defaultGoals[workspace.entry.website.status === "has" ? "site" : "noSite"];
  const picks = [...new Set([...suggested, ...defaults])].slice(0, 4);
  return [...picks.map((id) => ({ label: getIntent(id).label, value: id })), notSure];
}

const quickWinOrder: QuickWinId[] = ["homepage_audit", "outreach_sequence", "lookalike_accounts", "social_posts", "landing_page_draft"];

/**
 * What a quick win still needs before it can be specific to them: their site
 * for the audit, and each piece of context its recipe names. Who they want to
 * reach has to come from them (their site only says who buys today). Empty
 * when it's ready; anything less and the deliverable would be generic.
 */
export function quickWinNeeds(id: QuickWinId, { workspace, docs }: Pick<TrailState, "workspace" | "docs">): ContextItemId[] {
  const { needsWebsite, spec } = quickWins[id];
  const noSite = workspace.entry.website.status !== "has" || workspace.crawl?.status === "failed";
  return [
    ...(needsWebsite && noSite ? (["website"] as const) : []),
    ...spec.needsContext
      .filter((key) => !hasContext(docs, key, { confirmed: key === "audience" }))
      .map((key) => contextKeys[key].item),
  ];
}

export const quickWinReady = (id: QuickWinId, state: Pick<TrailState, "workspace" | "docs">) => !quickWinNeeds(id, state).length;

/**
 * Up to three quick wins that are ready now: a homepage audit when they have a
 * site, a landing page when they don't. None until we know enough to make one
 * specific to them (e.g. what they sell, with no site).
 */
export function quickWinChips(state: Pick<TrailState, "workspace" | "docs">): Chip[] {
  const { workspace } = state;
  const hasSite = workspace.entry.website.status === "has";
  const suggested = (workspace.crawl?.opportunities ?? []).map((o) => getIntent(o.intent).quickWin);
  const first: QuickWinId[] = hasSite ? ["homepage_audit"] : ["landing_page_draft"];
  return [...new Set([...first, ...suggested, ...quickWinOrder])]
    .filter((id) => quickWinReady(id, state))
    .slice(0, 3)
    .map((id) => ({ label: quickWins[id].label, value: id }));
}

/** The common tools for a capability, plus "skip". */
export const toolChips = (category: IntegrationCategory): Chip[] => [
  ...integrationCategories[category].tools.slice(0, 3).map((tool) => ({ label: tool, value: `${category}:${tool}` })),
  skip,
];

/** How the old trail asked for each tool; a model hint, not a script. */
export const toolQuestions: Record<IntegrationCategory, string> = {
  email: "Where do you send email from today?",
  crm: "Where do your leads and contacts live today?",
  social: "Which social account matters most for you?",
  search_ads: "Which search ads account do you use?",
  social_ads: "Which social ads account do you use?",
  analytics: "What do you use to track site visits?",
  store: "Where do you sell online?",
  team_chat: "Where does your team chat?",
};

const toolHint = "You'll connect it yourself when a task needs it. Ploy never connects without your approval.";

export type TrailState = {
  workspace: Workspace;
  docs: Pick<Doc, "slug" | "sections">[];
  ploys: Ploy[];
  mapNodes: MapNode[];
  integrations: Integration[];
  answered: ReadonlySet<AnsweredSlot>;
};

/**
 * The next question, as far as code decides: the website first, nothing past
 * the cap, and otherwise `"plan"`: the model picks (see toQuestion).
 */
export function nextQuestion(state: TrailState): QuestionData | "plan" | null {
  if (state.workspace.entry.website.status === "unknown" && !state.answered.has("website")) return websiteQuestion();
  if (state.answered.size >= MAX_ANSWERED) return null;
  return "plan";
}

/** Where an item stands, for the planner. */
/** `waiting`: the quick win, before any would be specific to them. */
export type ItemStatus = "known" | "answered" | "inferred" | "reading" | "missing" | "unavailable" | "waiting";

export function itemStatus(id: ContextItemId, state: TrailState): ItemStatus {
  const item = contextItems[id];
  if (item.known(state)) return "known";
  // Said "not sure" or skipped: asked already.
  if (state.answered.has(id)) return "answered";
  if (id === "tool" && !toolToAsk(state)) return "unavailable";
  if (id === "quick_win_offer" && !quickWinChips(state).length) return "waiting";
  if (item.inferred(state)) return "inferred";
  // Their site is being read and will say what they sell.
  const { website } = state.workspace.entry;
  const crawl = state.workspace.crawl;
  if (id === "business_model" && website.status === "has" && crawl?.status !== "failed") return "reading";
  return "missing";
}

/** The chips an item's card must use, when their values drive code; null when the model writes them. */
export function chipOptions(id: ContextItemId, state: TrailState): Chip[] | null {
  if (id === "goal_detail") return goalChips(state.workspace);
  if (id === "quick_win_offer") return quickWinChips(state);
  if (id === "tool") {
    const category = toolToAsk(state);
    return category ? toolChips(category) : [];
  }
  return null;
}

/** The card as the model planned it (the planner turn's `next`). */
export type PlannedCard = {
  item: ContextItemId;
  question: string;
  hint: string | null;
  chips: string[];
  alt: { question: string; hint: string | null; chips: string[] } | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The model's chips mapped onto fixed options, by number ("2. Get more
 * leads") or label. The option's own label always shows: in evals Haiku
 * relabeled a quick win "Skip for now", which would have started it. Anything
 * else is dropped; with fewer than two left, all the options show.
 */
export function pickChips(options: Chip[], wanted: string[]): Chip[] {
  const picked: Chip[] = [];
  for (const raw of wanted) {
    const numbered = /^\s*(\d+)\s*[.):-]\s*(.*)$/.exec(raw);
    const text = (numbered ? numbered[2] : raw).trim();
    const option = (numbered && options[Number(numbered[1]) - 1]) || options.find((o) => norm(o.label) === norm(text));
    if (!option || picked.some((p) => p.value === option.value)) continue;
    picked.push(option);
  }
  return picked.length >= 2 ? picked : options;
}

/** The model's own chips for an open question: up to three, plus "not sure" (except for what they sell). */
function openChips(id: ContextItemId, labels: string[]): Chip[] {
  // Models carry the "<n>. " numbering of option chips over to their own; strip it.
  const own = [...new Set(labels.map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter((l) => l && !soundsUnsure(l) && !/^skip\b/i.test(l)))]
    .slice(0, 3)
    .map((label) => ({ label, value: label }));
  return id === "business_model" ? own : [...own, notSure];
}

/**
 * Turns the model's planned card into the question the trail shows, or null
 * to finish. A pick code can't serve (the website again, a second quick win,
 * a tool when none is needed) finishes too; the eval counts how often.
 */
export function toQuestion(planned: PlannedCard | null, state: TrailState): QuestionData | null {
  if (!planned || planned.item === "website") return null;
  const { item } = planned;
  const quickWinRunning = contextItems.quick_win_offer.known(state);
  if (item === "quick_win_offer" && quickWinRunning) return null;
  const category = item === "tool" ? toolToAsk(state) : null;
  if (item === "tool" && !category) return null;

  const options = chipOptions(item, state);
  let chips = options ? pickChips(options, planned.chips) : openChips(item, planned.chips);
  // "Not sure" and "skip" always stay on the goal and tool cards.
  if (item === "goal_detail" && !chips.some((c) => c.value === notSure.value)) chips = [...chips, notSure];
  if (item === "tool" && !chips.some((c) => c.value === skip.value)) chips = [...chips, skip];

  // Only quick wins that are ready are offered, beside the card or on their own.
  const ready = quickWinChips(state);
  if (item === "quick_win_offer" && !ready.length) return null;
  const alt =
    planned.alt && item !== "quick_win_offer" && !quickWinRunning && ready.length
      ? {
          slot: "quick_win_offer" as const,
          question: cleanQuestion(planned.alt.question) || "Want something useful in the next few minutes?",
          hint: planned.alt.hint ?? "Pick one and I'll start right away.",
          chips: pickChips(ready, planned.alt.chips),
        }
      : null;
  return {
    slot: item,
    question: cleanQuestion(planned.question) || (category ? toolQuestions[category] : "What should I know next?"),
    hint: item === "tool" ? toolHint : planned.hint,
    chips,
    category,
    alt,
    offScript: false,
  };
}

type Parts = UIMessage["parts"];
const dataOf = <T,>(parts: Parts, type: string) =>
  parts.filter((p) => p.type === type).map((p) => (p as { data: T }).data);

/** The latest question that asked for a slot (the fork asks for two). */
export function questionFor(messages: UIMessage[], slot: AnsweredSlot): QuestionData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const [question] = dataOf<QuestionData>(messages[i].parts, "data-question");
    if (question && (question.slot === slot || question.alt?.slot === slot)) return question;
  }
  return null;
}

/** Every slot answered so far on the trail. */
export const answeredSlots = (messages: UIMessage[]) =>
  new Set(messages.flatMap((m) => dataOf<AnsweredData>(m.parts, "data-answered").map((a) => a.slot)));

/**
 * The question on screen, if it hasn't been answered yet (none once the trail
 * is done). Only answers after it count: the planner may ask about an item
 * again (e.g. after "not sure").
 */
export function openQuestion(messages: UIMessage[]): QuestionData | null {
  const at = messages.findLastIndex((m) => m.role === "assistant" && dataOf(m.parts, "data-question").length > 0);
  if (at === -1) return null;
  const [question] = dataOf<QuestionData>(messages[at].parts, "data-question");
  const answered = answeredSlots(messages.slice(at + 1));
  const done = answered.has(question.slot) || (!!question.alt && answered.has(question.alt.slot));
  return done ? null : question;
}
