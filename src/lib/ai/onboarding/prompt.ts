import type { UIMessage } from "ai";
import { getIntent, quickWins } from "@/lib/catalog";
import { regions } from "@/lib/catalog/regions";
import { contextItems, type ContextItemId } from "@/lib/catalog/context";
import type { Doc } from "@/lib/db/types";
import { readSection } from "@/lib/docs/markdown";
import { getProfileSection, type ProfileDocSlug } from "@/lib/docs/profile";
import { defaultQuickWin, topIntent, type Entry } from "@/lib/onboarding/entry";
import {
  chipOptions,
  quickWinNeeds,
  itemStatus,
  trailItems,
  MAX_ANSWERED,
  type AnsweredData,
  type QuestionData,
  type TrailState,
} from "@/lib/onboarding/trail";
import { textOf } from "./text";

/** What the user's latest message did, for the reply to respond to. */
export type Said = {
  /** There was a question on screen (none once the trail is done and they're chatting freely). */
  open: boolean;
  answered: boolean;
  offScript: string | null;
  problems: string[];
};

/** Whether this turn has something to say before the card; otherwise the message stays empty (code drops any). */
export const hasReply = (said: Said | null) => !!said && (!said.open || !said.answered || !!said.offScript);

function messageRule(said: Said | null) {
  if (said && !said.open)
    return "They've finished the setup questions and are chatting freely. Answer what they said in under 70 words, statements only.";
  if (said?.offScript)
    return `They said something the card isn't about: "${said.offScript}". Reply to it in 1-2 sentences, statements only.${said.answered ? " They also answered the card; don't mention that." : ""}`;
  if (said && !said.answered)
    return said.problems.length
      ? `Their answer couldn't be recorded: ${said.problems.join(" ")} Say so in one short sentence, statements only.`
      : "Their latest message didn't answer the card. Respond to what they said in one short, friendly sentence, statements only.";
  return '"" (empty: the card speaks for itself).';
}

/** A known item's value, in a few words. */
function recorded(id: ContextItemId, state: TrailState, docs: Doc[]) {
  const { entry } = state.workspace;
  if (id === "website") return entry.website.url ?? entry.website.status.replace("_", " ");
  if (id === "goal_detail") return describeGoal(entry);
  for (const { doc, section } of contextItems[id].sections) {
    const d = docs.find((x) => x.slug === doc);
    const text = d && d.sections[section]?.status !== "empty" && readSection(d.content_md, getProfileSection(doc, section).heading);
    if (text) return `"${text.replace(/\s+/g, " ").slice(0, 160)}"`;
  }
  return "known";
}

function describeGoal(entry: Entry) {
  const { goals } = entry;
  if (goals.status === "unsure") return "not sure yet";
  if (goals.status !== "has") return "not answered yet";
  const labels = goals.intents.map((i) => getIntent(i.id).label).join(", ");
  return `${labels}${goals.inUserWords ? ` (in their words: "${goals.inUserWords}")` : ""}${goals.unmatched ? `; also asked for something Ploy doesn't do: "${goals.unmatched}"` : ""}`;
}

/** Items a card may ask about, with what the card can offer. */
function askable(id: ContextItemId, state: TrailState) {
  const lines = [`- ${id} (${contextItems[id].label}): ${contextItems[id].why}`];
  const intent = topIntent(state.workspace.entry);
  if (id === "target_customer" && intent) lines.push(`  For their goal, e.g. "${getIntent(intent).audienceQuestion}"`);
  if (id === "business_model") lines.push("  No chips: they type it.");
  const options = chipOptions(id, state);
  if (options?.length) lines.push(`  Options (chips come only from these): ${options.map((o, i) => `${i + 1}. ${o.label}`).join("; ")}`);
  return lines.join("\n");
}

type Group = "settled" | "sharpen" | "site" | "open" | "wait";

/**
 * Where each item stands for the planner. Known items that no card has asked
 * yet (they came up in passing, or from their site) may be sharpened once; an
 * item a card has asked and they answered, or said they weren't sure about, is
 * settled. A card they didn't answer (they said something else) leaves its
 * item open.
 */
function groupOf(id: ContextItemId, state: TrailState, asked: ReadonlySet<ContextItemId>): Group {
  const status = itemStatus(id, state);
  if (status === "known") return asked.has(id) || !SHARPENABLE.has(id) ? "settled" : "sharpen";
  if (status === "answered") return "settled";
  if (status === "inferred") return "site";
  if (status === "reading") return "wait";
  return "open";
}

/** What Ploy needs to act: what they sell, who to reach, and their goal. */
const ESSENTIALS: ContextItemId[] = ["business_model", "target_customer", "goal_detail"];

/**
 * The items the next card may ask about; the planner's schema only offers
 * these. Essentials come first: while one is still unknown and askable, only
 * essentials are offered, so an aside can't lead the trail past their goal.
 */
export function askableItems(state: TrailState, messages: UIMessage[]): ContextItemId[] {
  const asked = askedOnCards(messages);
  const items = trailItems.filter((id) => id !== "website" && ["sharpen", "site", "open"].includes(groupOf(id, state, asked)));
  const missing = items.filter((id) => ESSENTIALS.includes(id) && groupOf(id, state, asked) === "open");
  return missing.length ? missing : items;
}

/** What we know and don't, as the planner sees it. */
function describeItems(state: TrailState, docs: Doc[], asked: ReadonlySet<ContextItemId>) {
  const groups: Record<Group, string[]> = { settled: [], sharpen: [], site: [], open: [], wait: [] };
  for (const id of trailItems) {
    const group = groupOf(id, state, asked);
    const status = itemStatus(id, state);
    if (group === "settled") groups.settled.push(`- ${id}: ${status === "known" ? recorded(id, state, docs) : "they weren't sure or skipped; that's their answer"}`);
    else if (group === "sharpen") groups.sharpen.push(`${askable(id, state)}\n  Known so far: ${recorded(id, state, docs)}`);
    else if (group === "site") groups.site.push(`${askable(id, state)}\n  Their site says: ${recorded(id, state, docs)}`);
    else if (group === "wait") groups.wait.push(`- ${id}: their site is still being read and will say it`);
    else groups.open.push(askable(id, state));
  }
  const list = (lines: string[]) => lines.join("\n") || "- (none)";
  return `## Settled: can't be asked again
${list(groups.settled)}

## Known, but only in passing: may be sharpened once, if it's too broad to act on for their goal
${list(groups.sharpen)}

## From their site, not confirmed: confirm only if it matters for their goal
${list(groups.site)}

## Not known yet
${list(groups.open)}

## Not askable right now
${list(groups.wait)}`;
}

/** The three things Ploy needs to act, and whether each is in hand. */
function essentials(state: TrailState) {
  const mark = (id: ContextItemId) => {
    const status = itemStatus(id, state);
    return status === "known" || status === "inferred" ? "yes" : status === "answered" ? "they're not sure" : "not yet";
  };
  return `What they sell: ${mark("business_model")}. Who to reach: ${mark("target_customer")}. Their goal: ${mark("goal_detail")}.`;
}

/** Profile items worth sharpening when they arrived in passing (broad answers limit what Ploy can make). */
const SHARPENABLE = new Set<ContextItemId>(["target_customer", "business_model", "current_acquisition", "constraints"]);

/**
 * Their first deliverable: running, or what starts it. It comes from the
 * questions (there's no separate offer to pick), and it's only as specific as
 * what we know.
 */
function describeQuickWin(state: TrailState) {
  const running = state.ploys.find((p) => p.spec?.source === "quick_win");
  if (running) return `Building: ${running.spec?.name}.`;
  const recipe = defaultQuickWin(state.workspace.entry);
  if (!recipe) return "Not started. It's chosen from their goal once that's known, and starts once it has what it needs.";
  const name = `"${quickWins[recipe].spec.name}"`;
  const needs = quickWinNeeds(recipe, state);
  if (!needs.length) return `Not started. ${name} starts when they answer the next card (the card says so).`;
  return `Not started. ${name} starts once ${needs.join(" and ")} ${needs.length > 1 ? "are" : "is"} known (the card that asks says so).`;
}

function describeSite(state: TrailState) {
  const { crawl, entry } = state.workspace;
  if (!crawl) return entry.website.status === "has" ? "Not read yet." : "They have no site to read.";
  if (crawl.status === "failed") return "Couldn't be read: what they sell has to come from them.";
  if (crawl.status !== "done" || !crawl.summary) return "Still being read.";
  const opportunities = crawl.opportunities.map((o) => `- ${o.title} (${getIntent(o.intent).label}): ${o.why}`).join("\n");
  return `${crawl.summary.oneLiner}\nGaps we spotted on it:\n${opportunities || "- none"}`;
}

/** Their profile: only what's filled in, one line per section. */
function describeProfile(docs: Doc[]) {
  const lines = docs
    .filter((d) => d.kind === "profile")
    .flatMap((d) =>
      Object.entries(d.sections)
        .filter(([, meta]) => meta.status !== "empty")
        .map(([key, meta]) => {
          const text = readSection(d.content_md, getProfileSection(d.slug as ProfileDocSlug, key).heading)?.replace(/\s+/g, " ").slice(0, 200);
          return text ? `- ${d.title} › ${getProfileSection(d.slug as ProfileDocSlug, key).heading}${meta.status === "inferred" ? " (from their site)" : ""}: ${text}` : null;
        }),
    )
    .filter(Boolean);
  return lines.join("\n") || "- (nothing yet)";
}

/** The trail so far: each card, what they said, and what it recorded. */
export function trailSoFar(messages: UIMessage[]) {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push(`They: "${textOf(m).slice(0, 300)}"`);
      continue;
    }
    for (const p of m.parts) {
      if (p.type === "data-answered") {
        const a = p.data as AnsweredData;
        lines.push(`Recorded ${a.slot}: ${a.summary}`);
      }
      if (p.type === "data-question") {
        const q = p.data as QuestionData;
        lines.push(`Card (${q.slot}${q.alt ? ` + ${q.alt.slot}` : ""}): ${q.question}`);
      }
    }
  }
  return lines.join("\n");
}

/** Every item a card has asked about (the fork asks two). */
export function askedOnCards(messages: UIMessage[]) {
  const asked = new Set<ContextItemId>();
  for (const m of messages)
    for (const p of m.parts)
      if (p.type === "data-question") {
        const q = p.data as QuestionData;
        asked.add(q.slot);
        if (q.alt) asked.add(q.alt.slot);
      }
  return asked;
}

const capabilities = () =>
  `Ploy covers: ${regions.map((r) => `${r.name} (${r.description.replace(/\.$/, "")})`).join("; ")}. First wins it can build in minutes: ${Object.values(quickWins)
    .map((q) => q.spec.name)
    .join(", ")}. It doesn't do hiring, fundraising, bookkeeping, legal, or building their product.`;

/**
 * The Getting Started planner. The model gets an objective (know the business
 * well enough to make their map and first deliverable specific), what's known
 * and what isn't, and the trail so far; it writes down what it understood and
 * the biggest gap, then picks the card that closes it, or finishes. Code only
 * holds the website first and the cap. When code has already chosen the card,
 * the model only writes the message.
 */
export function buildTrailPrompt({
  state,
  docs,
  messages,
  said,
  planning,
}: {
  state: TrailState;
  docs: Doc[];
  messages: UIMessage[];
  said: Said | null;
  /** The model picks the next card; otherwise code has, and `next` is ignored. */
  planning: boolean;
}) {
  const left = MAX_ANSWERED - state.answered.size;
  const asked = askedOnCards(messages);
  const cardsAnswered = state.answered.size;

  return `You are Ploy's onboarding guide. Ploy is a marketing platform that works like a teammate: it learns a business, then builds and runs its marketing (sites, content, outreach, ads, reporting).
Getting Started is a short trail of question cards. Your job: get to know this business well enough that everything Ploy makes for them, starting with their first deliverable and their growth map, is specific to them rather than generic. Each turn you reply if they said something that needs it, then choose the next card, or finish.

# What's known
${describeItems(state, docs, asked)}

## Their profile so far
${describeProfile(docs)}

## Their site
${describeSite(state)}

## Their first deliverable
${describeQuickWin(state)}

## Essentials
${essentials(state)}

## The trail so far (${cardsAnswered} card${cardsAnswered === 1 ? "" : "s"} answered; at most ${Math.max(0, left)} more)
${trailSoFar(messages) || "(nothing yet)"}

## What Ploy can do
${capabilities()}

# What to write
- message: ${messageRule(said)}
- understood: one sentence: what this business sells, who it wants to reach, and what it wants to grow, as far as you know.
- gap: ${planning ? "the one missing or too-broad thing that would most change their first deliverable or map, naming the item (e.g. \"target_customer: which HR roles\"), or \"none\" if another question wouldn't change what Ploy does first." : "\"none\" (the app puts up the next card itself)."}
- next: ${planning ? "the card that closes the gap, or null to finish (only when gap is \"none\")." : "null."}
  - item: what the card asks about (from Not known yet, Known only in passing, or From their site).
  - question: one plain sentence, 15 words or fewer, ending in "?", specific to their business and goal. No lead-in.
  - hint: what answering changes for them, 8 words or fewer, or null.
  - chips: for items with Options, 2-4 of them written "<option number>. <label>", copied exactly. Otherwise 2-3 short answers (1-4 words) specific to this business, in their voice. "Not sure yet" is added for you.

# How to decide
1. Enough to act on means the three essentials: what they sell, who to reach for their goal, and the goal itself. "They're not sure" counts as an answer: don't push on it.
2. Essentials come first; until they're in, only they can be asked. Beyond them, ask only what would change their first deliverable or map: sharpening a broad essential once (e.g. "mid-size companies" when outreach needs a role), how they reach customers today, or real constraints. A card that only confirms what's clear is wasted.
3. With no site to read, what they sell comes first: everything Ploy makes needs it.
4. Don't finish on their first answer, even one that covers everything: ask the one question that would most improve what Ploy makes first.
5. Aim for 3 to 4 cards in all. Once the essentials are answered (or they're not sure), set gap to "none" and finish, unless one more card would clearly change what Ploy makes first. Finish right away if they seem done or impatient.
6. Settled items can't be asked again. One question per card, about one item.

# Rules
- Warm, plain, and brief. No filler, no exclamation marks.
- Never invent facts about their business; use only what's known above and what they said.
- If they ask for something Ploy doesn't do (hiring, fundraising, legal, and so on), say plainly that Ploy doesn't do it, in one sentence, and name the closest thing it does for their customers or marketing. Never suggest Ploy helps with it indirectly (no "we can help attract investors" or "candidates").
- That request is not their goal, and never who to reach: who to reach is always their customers.
- Never say a tool is connected or that Ploy has access to one.`;
}
