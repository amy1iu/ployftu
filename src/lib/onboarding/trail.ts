import type { UIMessage } from "ai";
import { getIntent, type IntentId } from "@/lib/catalog/intents";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import type { Doc, Integration, MapNode, Ploy, Workspace } from "@/lib/db/types";
import { hasContext } from "@/lib/docs/profile";
import { toolToAsk } from "@/lib/map/plan";
import { topIntent } from "./entry";

// Getting Started is a trail of small questions, each answerable in under a
// minute. The code picks the next one, always in this order, skipping any whose
// answer we already have (from their site or an earlier answer):
//
//   website → sell (no site) → fork: a quick win or a goal → the other one →
//   followup (who they want to reach) → tool (what the most tasks need) → done
//
// Chips carry values, so tapping one records the answer exactly, with no model
// call. Typed answers go through the extractor.

/** A question on the trail. `fork` offers two at once: a goal, or a quick win. */
export type QuestionSlot = "website" | "sell" | "fork" | "goal" | "followup" | "tool";
/** What an answer records; answering the fork records `goal` or `quick_win`. */
export type AnsweredSlot = Exclude<QuestionSlot, "fork"> | "quick_win";

export type Chip = { label: string; value: string };

type Card = { question: string; hint: string | null; chips: Chip[] };

/** A question as the trail shows it (the `data-question` part). */
export type QuestionData = Card & {
  slot: QuestionSlot;
  /** The tool question's capability. */
  category: IntegrationCategory | null;
  /** The fork's second card: a quick win. */
  alt: (Card & { slot: "quick_win" }) | null;
  /** The message before it replies to something off-script. */
  offScript: boolean;
};

/** Written when an answer lands: what it means, for the answered pill (the `data-answered` part). */
export type AnsweredData = { slot: AnsweredSlot; summary: string };

/** A user message's metadata: which card it answers, the chip's value if they tapped one, and whether it changes an earlier answer. */
export type TrailMetadata = { slot?: AnsweredSlot; value?: string; redo?: boolean };

/** Answers that can be changed later. A quick win, once started, can't. */
export const canRedo = (slot: AnsweredSlot) => slot !== "quick_win";

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

export const slotLabels: Record<AnsweredSlot, string> = {
  website: "Website",
  sell: "Business",
  goal: "Goal",
  quick_win: "Quick win",
  followup: "Customers",
  tool: "Tools",
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

export type TrailState = {
  workspace: Workspace;
  docs: Pick<Doc, "slug" | "sections">[];
  ploys: Ploy[];
  mapNodes: MapNode[];
  integrations: Integration[];
  answered: ReadonlySet<AnsweredSlot>;
};

/** The next question on the trail, or null once there's nothing left to ask. */
export function nextQuestion(state: TrailState): NextQuestion | null {
  const { workspace, docs, ploys, answered } = state;
  const { entry, crawl } = workspace;
  const pick = (slot: AnsweredSlot) => !answered.has(slot);

  if (entry.website.status === "unknown" && pick("website")) {
    const { question, hint, chips } = websiteQuestion();
    return { ...base, slot: "website", question, hint, chips, guide: "Ask for their website." };
  }

  const noSite = entry.website.status !== "has" || crawl?.status === "failed";
  if (noSite && !hasContext(docs, "offering") && pick("sell")) {
    const unreadable = entry.website.status === "unreadable" || crawl?.status === "failed";
    return {
      ...base,
      slot: "sell",
      question: "In a sentence, what does your business sell?",
      hint: unreadable ? "I couldn't read your site, so a sentence from you is the fastest way in." : null,
      chips: [],
      guide: "Ask what their business sells, in a sentence.",
    };
  }

  const hasQuickWin = ploys.some((p) => p.spec?.source === "quick_win");
  const goalUnknown = entry.goals.status === "unknown";
  if (goalUnknown && !hasQuickWin && pick("goal") && pick("quick_win")) {
    return {
      slot: "fork",
      ...goalCard(workspace),
      category: null,
      alt: {
        slot: "quick_win",
        question: "Want something useful in the next few minutes?",
        hint: "Pick one and I'll start right away.",
        chips: quickWinChips(workspace),
      },
      guide: "Ask what they most want to grow.",
    };
  }
  if (goalUnknown && pick("goal"))
    return { ...base, slot: "goal", ...goalCard(workspace, "While that builds: "), guide: "Ask what they most want to grow." };

  // Their site says who buys today; who they want to reach for this goal is theirs to say.
  if (!hasContext(docs, "audience", { confirmed: true }) && pick("followup")) {
    const intent = topIntent(entry);
    const ask = intent ? getIntent(intent).audienceQuestion : "Who are your best customers?";
    return {
      ...base,
      slot: "followup",
      question: null,
      hint: "So everything Ploy makes speaks to them.",
      chips: null,
      guide: `Ask who they most want to reach, adapting this to their business and goal: "${ask}"`,
    };
  }

  const category = pick("tool") ? toolToAsk(state) : null;
  if (category) {
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
  return null;
}

type Parts = UIMessage["parts"];
const dataOf = <T,>(parts: Parts, type: string) =>
  parts.filter((p) => p.type === type).map((p) => (p as { data: T }).data);

/** The latest question asked, if any. */
export function lastQuestion(messages: UIMessage[]): QuestionData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    const [question] = dataOf<QuestionData>(messages[i].parts, "data-question");
    if (question) return question;
  }
  return null;
}

/** The latest question that asked for a slot (the fork asks for the goal and the quick win). */
export function questionFor(messages: UIMessage[], slot: AnsweredSlot): QuestionData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const [question] = dataOf<QuestionData>(messages[i].parts, "data-question");
    if (question && (question.slot === slot || (question.slot === "fork" && (slot === "goal" || slot === "quick_win"))))
      return question;
  }
  return null;
}

/** Every slot answered so far on the trail. */
export const answeredSlots = (messages: UIMessage[]) =>
  new Set(messages.flatMap((m) => dataOf<AnsweredData>(m.parts, "data-answered").map((a) => a.slot)));

/** The question on screen, if it hasn't been answered yet (none once the trail is done). */
export function openQuestion(messages: UIMessage[]): QuestionData | null {
  const question = lastQuestion(messages);
  if (!question) return null;
  const answered = answeredSlots(messages);
  const done = question.slot === "fork" ? answered.has("goal") || answered.has("quick_win") : answered.has(question.slot);
  return done ? null : question;
}
