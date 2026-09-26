import type { Experimental_EvaluationQuestion as Question } from "ai";
import { contextItems, type ContextItemId } from "@/lib/catalog/context";
import { intents, type IntentId } from "@/lib/catalog/intents";
import type { Doc, Workspace } from "@/lib/db/types";
import { readSection, EMPTY_SECTION } from "@/lib/docs/markdown";
import { getProfileSection, noteSections, type ProfileDocSlug } from "@/lib/docs/profile";
import type { Chip } from "./trail";

// The trail's typed decisions, as questions for a decision model (Jev, see
// ai/jev.ts): what a typed answer means, which chip it matches, which goal,
// which profile sections it has facts for, and what to ask next. Pure: the
// builders turn trail state into a small JSON state plus typed questions, and
// the readers turn typed answers (with their probabilities) back into what the
// trail does. Jev reads literally and gets distracted by irrelevant state, so
// the state carries only what these questions need (never the transcript or
// the full profile), each question is atomic, and code composes the answers.

export const decisionIds = ["answer_status", "chip_match", "website_status", "goal_intent", "profile_touch", "next_info"] as const;
export type Decision = (typeof decisionIds)[number];

// Confidence routing (TypeSafe's recommended bands): act above ACT, act and
// confirm it back between CONFIRM and ACT, don't act below CONFIRM (fall back
// to the extractor).
export const ACT = 0.9;
export const CONFIRM = 0.5;
/** A second goal intent counts when it's at least this likely. */
export const SECOND_INTENT_MIN = 0.2;
/** A profile section gets a note written when it's at least this likely to be touched. */
export const PROFILE_TOUCH_MIN = 0.5;
/** An item the model thinks is at least this likely known isn't asked (composite next_info). */
export const KNOWN_MIN = 0.5;
/** The trail stops when no unknown item's value reaches this (0-2 scale; composite next_info). */
export const VALUE_MIN = 0.8;

// ── Answers and confidence ─────────────────────────────────────────────────

export type RawAnswer =
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "score"; score: number; probabilities?: Record<string, number> }
  | { type: "boolean"; probability: number };
export type Answer = RawAnswer & { confidence: number };

/**
 * How concentrated an answer is, 0-1: for a choice or score over n options,
 * (n·pmax − 1)/(n − 1), so 1 when all the probability is on one option and 0
 * when it's spread evenly; for a boolean, |2p − 1|. The SDK doesn't return it.
 * A choice or score without probabilities counts as no confidence.
 */
export function confidence(answer: RawAnswer): number {
  if (answer.type === "boolean") return Math.abs(2 * answer.probability - 1);
  const probabilities = Object.values(answer.probabilities ?? {});
  const n = probabilities.length;
  if (n < 2) return 0;
  const top = Math.max(...probabilities);
  return Math.min(1, Math.max(0, (n * top - 1) / (n - 1)));
}

export const withConfidence = (answer: RawAnswer): Answer => ({ ...answer, confidence: confidence(answer) });

export type Answers = Record<string, Answer>;

// ── State ──────────────────────────────────────────────────────────────────

/** What's recorded so far, in a line or two each: the part of the profile these decisions read. */
export type Recorded = {
  website: string;
  goal: string;
  whatTheyDo: string | null;
  customers: string | null;
  channels: string | null;
  constraints: string | null;
  tools: string | null;
};

const clip = (text: string | null | undefined, max = 160) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t || t === EMPTY_SECTION) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function section(docs: Pick<Doc, "slug" | "content_md">[], slug: ProfileDocSlug, key: string) {
  const doc = docs.find((d) => d.slug === slug);
  return doc ? clip(readSection(doc.content_md, getProfileSection(slug, key).heading)) : null;
}

export function recordedFrom(workspace: Pick<Workspace, "entry">, docs: Pick<Doc, "slug" | "content_md">[]): Recorded {
  const { website, goals, tools } = workspace.entry;
  const goalLabels = goals.intents.map((i) => intents.find((x) => x.id === i.id)?.label).join(", ");
  return {
    website: website.status === "has" ? `has a site: ${website.url}` : website.status === "unknown" ? "not answered yet" : website.status.replace("_", " "),
    goal:
      goals.status === "has"
        ? [goalLabels, goals.inUserWords && `"${goals.inUserWords}"`, goals.unmatched && `also asked for: "${goals.unmatched}"`].filter(Boolean).join(" ")
        : goals.status === "unsure"
          ? "not sure yet"
          : "not answered yet",
    whatTheyDo: section(docs, "business-overview", "what-we-do"),
    customers: section(docs, "business-overview", "who-we-serve"),
    channels: section(docs, "channels-and-tools", "acquisition"),
    constraints: section(docs, "goals-and-focus", "constraints"),
    tools:
      Object.entries(tools ?? {})
        .map(([category, tool]) => `${category}: ${tool}`)
        .join(", ") || null,
  };
}

/** A typed message, under the question on screen. */
export type TurnInput = {
  item: ContextItemId;
  question: string;
  chips: Chip[];
  /** The fork's quick-win card. */
  alt: { question: string; chips: Chip[] } | null;
  /** What the assistant said just before (its text, without the question). */
  previous: string | null;
  message: string;
  recorded: Recorded;
};

/** Every chip on screen, the fork's quick wins included. */
export const chipsOf = (input: Pick<TurnInput, "chips" | "alt">) => [...input.chips, ...(input.alt?.chips ?? [])];

export function turnState(input: TurnInput) {
  const { question, alt, previous, message, recorded } = input;
  return {
    question_on_screen: {
      asks_for: `${input.item}: ${contextItems[input.item].why}`,
      text: question,
      chips: input.chips.map((c) => c.label),
      ...(alt ? { or_quick_win_card: { text: alt.question, chips: alt.chips.map((c) => c.label) } } : {}),
    },
    ...(previous ? { assistant_said_before: previous } : {}),
    user_latest_message: message,
    recorded_so_far: { website: recorded.website, goal: recorded.goal, what_they_do: recorded.whatTheyDo ?? "unknown" },
  };
}

// ── Questions about a typed message ────────────────────────────────────────

export const answerStatuses = ["answered", "partial", "unsure", "off_script", "asked_question", "changed_earlier_answer"] as const;
export type AnswerStatus = (typeof answerStatuses)[number];

const answerStatus: Question = {
  type: "choice",
  instructions:
    "How does `user_latest_message` relate to `question_on_screen`? Judge only the user's latest message. Naming or paraphrasing one of the chips answers the question.",
  criteria: {
    answered: {
      what: "It answers the question on screen, briefly or at length, in their own words or by naming a chip. Extra detail or an aside doesn't change that.",
      examples: [
        "Q: What's your website? → 'it's acme.com'",
        "Q: Who do you most want to reach? → 'mostly coffee shops, a few offices too'",
        "Q: What does your business sell? → 'Plumbing services.'",
        "Q: Where do you send email from? → 'Gmail mostly'",
      ],
    },
    partial: {
      what: "It gestures at an answer but is too vague to use, e.g. 'grow' or 'everyone' or 'a mix of people'.",
      not_for: "Short but specific answers, which are `answered`.",
      examples: ["Q: Who do you most want to reach? → 'a mix of students, each has its benefits'", "Q: What do you want to grow? → 'just grow'"],
    },
    unsure: {
      what: "They say they don't know, aren't sure, want to skip, or ask for suggestions instead of answering.",
      examples: ["not sure yet", "no idea, what do you suggest?", "I'm honestly not certain; suggestions would help", "skip"],
    },
    off_script: {
      what: "It's about something else: a different topic, or a request the question isn't about, with no answer to the question.",
      not_for: "Asking for one of the chips on screen (that answers it).",
      examples: [
        "Q: What's your website? → 'I'd like to start cold outreach to HR leaders'",
        "Q: Who do you most want to reach? → 'can you also handle my bookkeeping?'",
      ],
    },
    asked_question: {
      what: "It asks a question back (about Ploy, pricing, or what the question means) instead of answering.",
      examples: ["what do you mean by channels?", "how much does Ploy cost?", "why do you need my website?"],
    },
    changed_earlier_answer: {
      what: "It corrects or changes something recorded earlier (their website, goal, or what they sell) rather than answering the question on screen.",
      examples: ["actually our site is acme.io, not acme.com", "wait, I'd rather focus on ads than outreach", "sorry, we sell to restaurants, not cafés"],
    },
  },
};

const aside: Question = {
  type: "boolean",
  instructions:
    "Besides answering (or not) the question on screen, does `user_latest_message` also ask for something or raise a separate topic that deserves a reply?",
  criteria: {
    true: "e.g. 'cafés mainly. also can you run instagram ads?'",
    false: "Just an answer, a chip, or small talk like 'thanks'.",
  },
};

/** The chip option ids are the chip labels, plus `all` and `none`. */
const chipMatch = (chips: Chip[]): Question => ({
  type: "choice",
  instructions:
    "Which chip on screen (the question's, or the quick-win card's) does `user_latest_message` pick or mean? `all` if they pick every chip ('all of the above', 'both'); `none` if no chip matches what they said.",
  criteria: {
    ...Object.fromEntries(chips.map((c) => [c.label, null])),
    all: { what: "Every chip at once", examples: ["all of the above", "both", "all of them"] },
    none: { what: "No chip says what they said, or they didn't answer", examples: ["something else in their own words", "a question"] },
  },
});

const websiteStatus: Question = {
  type: "choice",
  instructions: "What does `user_latest_message` say about the user's own website?",
  criteria: {
    has: {
      what: "They give a link or domain: a site, or a social or marketplace profile.",
      examples: ["acme.com", "it's greenleaf-landscaping,com", "instagram.com/lunaceramics", "I sell on Etsy: etsy.com/shop/x"],
    },
    none: { what: "They have no website at all.", examples: ["we don't have one", "no site, just word of mouth"] },
    not_live: {
      what: "A site exists or is being built but isn't live or launched yet.",
      examples: ["still building it", "launching next month", "it's not up yet"],
    },
  },
};

const goalIntent: Question = {
  type: "choice",
  instructions:
    "Which goal does `user_latest_message` express: what the user wants to achieve or grow? Judge only their words. `unsure` if they don't know; `not_covered` if what they want is outside marketing and growth.",
  criteria: {
    ...Object.fromEntries(intents.map((i) => [i.id, { what: i.label, examples: [...i.examples] }])),
    unsure: { what: "They don't know what to focus on, or ask for suggestions.", examples: ["not sure yet", "what would you suggest?"] },
    not_covered: {
      what: "Something a marketing platform doesn't do.",
      examples: ["hiring engineers", "raising a seed round", "bookkeeping", "legal help", "building the product"],
    },
  },
};

const statesGoal: Question = {
  type: "boolean",
  instructions: "Does `user_latest_message` say what the user wants to achieve or grow (a goal), or that they're unsure of one?",
  criteria: {
    true: "e.g. 'we want more demo requests', 'I need help raising a seed round', 'not sure where to start'",
    false: "Only a website, a description of the business, a customer group, or a tool.",
  },
};

/** One boolean per profile section the notes can write, keyed `touch_<section>`. */
export const touchId = (key: string) => `touch_${key.replace(/-/g, "_")}`;

const profileTouch = Object.fromEntries(
  noteSections.map(([, key, meaning]) => [
    touchId(key),
    {
      type: "boolean",
      instructions: `Does \`user_latest_message\` itself state a fact about ${meaning}? Only the user's own words count; a bare link, a yes/no, or just picking a goal states nothing about this.`,
    } satisfies Question,
  ]),
);

/** The questions to ask about a typed message, for the decisions in play. */
export function turnQuestions(input: TurnInput, decisions: ReadonlySet<Decision>): Record<string, Question> {
  const chips = chipsOf(input);
  return {
    ...(decisions.has("answer_status") ? { answer_status: answerStatus, has_aside: aside } : {}),
    ...(decisions.has("chip_match") && chips.length ? { chip_match: chipMatch(chips) } : {}),
    ...(decisions.has("website_status") && input.item === "website" ? { website_status: websiteStatus } : {}),
    ...(decisions.has("goal_intent") ? { goal_intent: goalIntent, states_goal: statesGoal } : {}),
    ...(decisions.has("profile_touch") ? profileTouch : {}),
  };
}

// ── Reading the answers ────────────────────────────────────────────────────

export type Read<T> = { value: T; confidence: number };

export function readStatus(answers: Answers): Read<AnswerStatus> | null {
  const a = answers.answer_status;
  return a?.type === "choice" ? { value: a.choice as AnswerStatus, confidence: a.confidence } : null;
}

export const hasAside = (answers: Answers) => answers.has_aside?.type === "boolean" && answers.has_aside.probability >= 0.5;

/** The chip they meant (from either card), every chip ("all"), or null. */
export function readChip(answers: Answers, chips: Chip[]): Read<Chip | "all" | null> | null {
  const a = answers.chip_match;
  if (a?.type !== "choice") return null;
  const value = a.choice === "all" ? "all" : (chips.find((c) => c.label === a.choice) ?? null);
  return { value, confidence: a.confidence };
}

export function readWebsite(answers: Answers): Read<"has" | "none" | "not_live"> | null {
  const a = answers.website_status;
  return a?.type === "choice" ? { value: a.choice as "has" | "none" | "not_live", confidence: a.confidence } : null;
}

export type GoalRead =
  | { status: "has"; intents: { id: IntentId; weight: number }[] }
  | { status: "unsure" }
  | { status: "not_covered"; intents: { id: IntentId; weight: number }[] };

/**
 * The goal, with probabilities as intent weights: the top intent, plus a
 * second one when it's at least SECOND_INTENT_MIN likely. "Not covered" keeps
 * the closest intent only if it's that likely too.
 */
export function readGoal(answers: Answers): Read<GoalRead> | null {
  const a = answers.goal_intent;
  if (a?.type !== "choice") return null;
  const ranked = Object.entries(a.probabilities ?? { [a.choice]: 1 })
    .filter(([id]) => intents.some((i) => i.id === id))
    .sort((x, y) => y[1] - x[1])
    .map(([id, weight]) => ({ id: id as IntentId, weight }));
  const likely = ranked.filter((r) => r.weight >= SECOND_INTENT_MIN).slice(0, 2);
  const value: GoalRead =
    a.choice === "unsure"
      ? { status: "unsure" }
      : a.choice === "not_covered"
        ? { status: "not_covered", intents: likely.slice(0, 1) }
        : { status: "has", intents: [ranked[0], ...likely.filter((r) => r.id !== ranked[0].id)].slice(0, 2) };
  return { value, confidence: a.confidence };
}

export const saysGoal = (answers: Answers) => answers.states_goal?.type === "boolean" && answers.states_goal.probability >= 0.5;

/** The profile sections the message has facts for, as `slug#key`; null when the decision wasn't asked. */
export function readTouched(answers: Answers): string[] | null {
  if (!noteSections.some(([, key]) => answers[touchId(key)])) return null;
  return noteSections
    .filter(([, key]) => {
      const a = answers[touchId(key)];
      return a?.type === "boolean" && a.probability >= PROFILE_TOUCH_MIN;
    })
    .map(([slug, key]) => `${slug}#${key}`);
}

// ── What to ask next ───────────────────────────────────────────────────────

/** Items a model can pick next: every registry item but the website, which always comes first. */
export const nextItems = ["goal_detail", "quick_win_offer", "target_customer", "business_model", "current_acquisition", "constraints", "tool"] as const satisfies readonly ContextItemId[];
export type NextItem = (typeof nextItems)[number];

export type NextDesign = "choice" | "composite";

export type NextInput = {
  recorded: Recorded;
  /** What the code knows (registry `known()`), before this turn's answer lands. */
  known: Record<ContextItemId, boolean>;
  /** The item on screen, being answered by `message`. */
  asking: ContextItemId | null;
  message: string | null;
};

export function nextState({ recorded, known, asking, message }: NextInput) {
  return {
    business: {
      website: recorded.website,
      goal: recorded.goal,
      what_they_do: recorded.whatTheyDo ?? "unknown",
      customers_they_want: known.target_customer ? recorded.customers : "unknown",
      how_customers_find_them: recorded.channels ?? "unknown",
      constraints: recorded.constraints ?? "unknown",
      tools: recorded.tools ?? "unknown",
    },
    already_known: nextItems.filter((i) => known[i]),
    not_known_yet: nextItems.filter((i) => !known[i]),
    ...(asking && message ? { just_asked: asking, user_latest_message: message } : {}),
  };
}

const nextCriteria: Record<NextItem, { what: string; not_for?: string }> = {
  goal_detail: { what: `Their goal. ${contextItems.goal_detail.why}`, not_for: "A goal that's already recorded." },
  quick_win_offer: { what: `Offer a quick win. ${contextItems.quick_win_offer.why}`, not_for: "Users who already have one underway." },
  target_customer: { what: `Who they want to reach. ${contextItems.target_customer.why}` },
  business_model: { what: `What they sell. ${contextItems.business_model.why}`, not_for: "Businesses whose site already told us what they do." },
  current_acquisition: { what: `How customers find them today. ${contextItems.current_acquisition.why}` },
  constraints: { what: `Their limits. ${contextItems.constraints.why}` },
  tool: { what: `Which tool they use. ${contextItems.tool.why}` },
};

/** Design 1: one choice over the items, plus `nothing`. */
export const nextChoiceQuestions = (): Record<string, Question> => ({
  next_info: {
    type: "choice",
    instructions:
      "Pick the ONE thing to ask this user about next: the item in `not_known_yet` whose answer would most change what Ploy recommends for their business and goal. Never pick an item in `already_known`, or one the user's latest message already answers. `nothing` when nothing left would change the recommendations much.",
    criteria: {
      ...nextCriteria,
      nothing: { what: "Stop asking: we know enough to recommend well." },
    },
  },
});

export const valueLevels = ["Wouldn't change what we recommend", "Changes it somewhat", "Changes it a lot"];

/** Design 2: per item, is it known, and how much would knowing it change what we recommend. */
export const nextCompositeQuestions = (): Record<string, Question> =>
  Object.fromEntries(
    nextItems.flatMap((item) => [
      [
        `known_${item}`,
        {
          type: "boolean",
          instructions: `Do we already know this for the business, from \`business\` or the user's latest message: ${nextCriteria[item].what}`,
        } satisfies Question,
      ],
      [
        `value_${item}`,
        {
          type: "score",
          instructions: `For this business and its goal, how much would asking about this change what Ploy recommends: ${nextCriteria[item].what}`,
          criteria: valueLevels,
        } satisfies Question,
      ],
    ]),
  );

export const nextQuestions = (design: NextDesign) => (design === "choice" ? nextChoiceQuestions() : nextCompositeQuestions());

/**
 * The item to ask next among `candidates` (what the code says is askable after
 * this turn's answer), or null to finish. Design 1 takes the likeliest
 * candidate unless `nothing` is likelier; design 2 skips items the model thinks
 * are known and takes the highest value, finishing when it's under VALUE_MIN.
 */
export function pickNext(answers: Answers, design: NextDesign, candidates: readonly ContextItemId[]): Read<ContextItemId | null> | null {
  if (design === "choice") {
    const a = answers.next_info;
    if (a?.type !== "choice") return null;
    const p = a.probabilities ?? { [a.choice]: 1 };
    const best = candidates.filter((c) => c in p).sort((x, y) => (p[y] ?? 0) - (p[x] ?? 0))[0];
    const stop = !best || (p.nothing ?? 0) > (p[best] ?? 0);
    return { value: stop ? null : best, confidence: a.confidence };
  }
  const scored = candidates
    .filter((c): c is NextItem => (nextItems as readonly string[]).includes(c))
    .map((item) => {
      const known = answers[`known_${item}`];
      const value = answers[`value_${item}`];
      return {
        item,
        known: known?.type === "boolean" ? known.probability : 0,
        value: value?.type === "score" ? value.score : null,
        confidence: value?.confidence ?? 0,
      };
    });
  if (scored.every((s) => s.value === null)) return null;
  const [best] = scored.filter((s) => s.known < KNOWN_MIN && s.value !== null).sort((x, y) => y.value! - x.value!);
  return best && best.value! >= VALUE_MIN ? { value: best.item, confidence: best.confidence } : { value: null, confidence: 1 };
}
