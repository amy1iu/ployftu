import type { UIMessage } from "ai";
import { catalogForPrompt, getIntent, quickWins } from "@/lib/catalog";
import { contextItemIds, contextItems, type ContextItemId, type ContextKey } from "@/lib/catalog/context";
import { integrationCategories } from "@/lib/catalog/integrations";
import type { Doc } from "@/lib/db/types";
import { readSection } from "@/lib/docs/markdown";
import { getProfileSection } from "@/lib/docs/profile";
import { toolToAsk } from "@/lib/map/plan";
import { defaultQuickWin, topIntent, type Entry } from "@/lib/onboarding/entry";
import {
  chipOptions,
  itemStatus,
  MAX_ANSWERED,
  toolQuestions,
  type AnsweredData,
  type ItemStatus,
  type QuestionData,
  type TrailState,
} from "@/lib/onboarding/trail";
import { textOf } from "./text";

function describeEntry(entry: Entry) {
  const site = {
    unknown: "not answered yet",
    has: `yes: ${entry.website.url}`,
    none: "no website",
    not_live: "website not live yet",
    unreadable: `gave ${entry.website.url}, but it couldn't be read`,
  }[entry.website.status];
  const goals = {
    unknown: "not answered yet",
    unsure: "not sure yet",
    has: `${entry.goals.intents.map((i) => getIntent(i.id).label).join(", ")}${
      entry.goals.inUserWords ? ` ("${entry.goals.inUserWords}")` : ""
    }`,
  }[entry.goals.status];
  return `- Website: ${site}\n- Goals: ${goals}${entry.goals.unmatched ? `\n- Asked for something Ploy doesn't cover: "${entry.goals.unmatched}"` : ""}`;
}

/** What the user's latest message did, for the reply to respond to. */
export type Said = {
  /** There was a question on screen (none once the trail is done and they're chatting freely). */
  open: boolean;
  answered: boolean;
  offScript: string | null;
  problems: string[];
};

function messageRule(said: Said | null, planning: boolean, finishing: boolean) {
  if (said && !said.open)
    return "They've finished the setup questions and are chatting freely. Answer what they said in under 70 words, statements only.";
  if (said?.offScript)
    return `They said something the question isn't about: "${said.offScript}". Reply to it in 1-2 sentences, statements only.${said.answered ? " They also answered the question; don't mention that." : ""}`;
  if (said && !said.answered)
    return said.problems.length
      ? `Their answer couldn't be recorded: ${said.problems.join(" ")} Say so in one short sentence, statements only.`
      : "Their latest message didn't answer the question. Respond to what they said in one short, friendly sentence, statements only.";
  if (finishing)
    return "The trail is complete: one or two sentences wrapping up (their first deliverable is building, their map is ready to explore), statements only.";
  return planning
    ? 'Leave it empty (""), except when you finish: then one or two sentences on what happens now (e.g. their first deliverable is building, their map is ready), statements only.'
    : 'Leave it empty ("").';
}

/** What's recorded for an item, in a few words, for the "done" list. */
function recorded(id: ContextItemId, state: TrailState, docs: Doc[]) {
  const { entry } = state.workspace;
  if (id === "website") return entry.website.url ?? entry.website.status.replace("_", " ");
  if (id === "goal_detail") return describeEntry(entry).split("\n")[1].replace("- Goals: ", "");
  if (id === "quick_win_offer") return `${state.ploys.find((p) => p.spec?.source === "quick_win")?.spec?.name ?? "one"} is running`;
  if (id === "tool") return Object.values(entry.tools ?? {}).join(", ") || "connected";
  for (const { doc, section } of contextItems[id].sections) {
    const d = docs.find((x) => x.slug === doc);
    const text = d && d.sections[section]?.status !== "empty" && readSection(d.content_md, getProfileSection(doc, section).heading);
    if (text) return `"${text.replace(/\s+/g, " ").slice(0, 160)}"`;
  }
  return "known";
}

const dontAsk: Partial<Record<ItemStatus, string>> = {
  answered: "asked already; they weren't sure or skipped",
  reading: "coming from their site, which is being read",
  unavailable: "none of their tasks need a tool yet",
};

/**
 * The registry as the planner sees it, grouped by what it may do with each
 * item: done (never ask), don't ask, inferred (confirm at most), open (ask).
 * Grouping, rather than a status per item, is what keeps the model from
 * re-asking what's known.
 */
function describeItems(state: TrailState, docs: Doc[], done: boolean) {
  const ids = contextItemIds.map((id) => ({ id, status: itemStatus(id, state) }));
  const list = (status: ItemStatus[], line: (id: ContextItemId, status: ItemStatus) => string) =>
    ids.filter((i) => status.includes(i.status)).map((i) => line(i.id, i.status)).join("\n") || "- (none)";
  const open = (id: ContextItemId) => {
    const lines = [`- ${id} (${contextItems[id].label}): ${contextItems[id].why}`];
    if (id === "tool") {
      const category = toolToAsk(state)!;
      lines.push(`  Ask about ${integrationCategories[category].need}, what most of their tasks need, e.g. "${toolQuestions[category]}"`);
    }
    const intent = topIntent(state.workspace.entry);
    if (id === "target_customer" && intent) lines.push(`  For their goal, e.g. "${getIntent(intent).audienceQuestion}"`);
    const options = chipOptions(id, state);
    if (options?.length)
      lines.push(`  Options (the answers the card offers, so ask a question they answer): ${options.map((o, i) => `${i + 1}. ${o.label}`).join("; ")}`);
    return lines.join("\n");
  };
  return `## Done: never ask about these again, not even to refine or confirm
${list(["known"], (id) => `- ${id}: ${recorded(id, state, docs)}`)}

## Don't ask
${list(["answered", "reading", "unavailable"], (id, status) => `- ${id}: ${dontAsk[status]}`)}

## Inferred from their site: don't ask cold; confirm only if it matters for their goal
${list(["inferred"], (id) => `${open(id)}\n  Their site says: ${recorded(id, state, docs)}`)}

${done ? "## Not needed now: the trail is complete. Ask these only if they ask for more questions" : "## Open: the only items you may ask about"}
${list(["missing"], open)}`;
}

/** Whether the trail has what it needs: the goal and who it's for (either may be "not sure"), and a first deliverable running. */
function readiness(state: TrailState) {
  const settled = (id: ContextItemId) => ["known", "answered"].includes(itemStatus(id, state));
  const missing = [
    !settled("goal_detail") && "goal_detail",
    !settled("target_customer") && "target_customer",
    !contextItems.quick_win_offer.known(state) && "a running quick win",
  ].filter(Boolean);
  return missing.length
    ? { done: false, text: `Not ready to finish. Still needed: ${missing.join(", ")}.` }
    : { done: true, text: "READY TO FINISH: their goal and who they want to reach are in, and their first deliverable is running. Set next to null now." };
}

/** Their first deliverable: running, picked, or what starts on its own once we know enough. */
function describeQuickWin(state: TrailState) {
  const running = state.ploys.find((p) => p.spec?.source === "quick_win");
  if (running) return `Running: ${running.spec?.name}. Don't offer another.`;
  const recipe = defaultQuickWin(state.workspace.entry);
  const waiting = recipe && (quickWins[recipe].spec.needsContext as ContextKey[]).includes("audience");
  if (recipe)
    return `Not started. "${quickWins[recipe].spec.name}" starts on its own${waiting ? " once target_customer is known or answered" : " right away"}.`;
  return "Not started. On the goal path it starts on its own once the goal is known (and, for audience-based ones, who they want to reach). Offering the quick win card lets them start one now.";
}

function describeSite(state: TrailState) {
  const { crawl } = state.workspace;
  if (!crawl) return "Not read (no site, or not read yet).";
  if (crawl.status === "failed") return "Couldn't be read.";
  if (crawl.status !== "done" || !crawl.summary) return "Being read right now; the profile fills in within a minute.";
  const opportunities = crawl.opportunities.map((o) => `- ${o.title} (${getIntent(o.intent).label}): ${o.why}`).join("\n");
  return `${crawl.summary.oneLiner}\nOpportunities we spotted:\n${opportunities || "- none"}`;
}

/** The trail so far: each card, what they said, and what it recorded. */
export function trailSoFar(messages: UIMessage[]) {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push(`They: "${textOf(m).slice(0, 200)}"`);
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

/**
 * The Getting Started planner. Each turn the model sees what we want to
 * learn (the registry), what's known, and the trail so far, then replies to
 * what they said and picks the next card, or finishes. When code has already
 * decided the card (the website first, or the cap), it only writes the message.
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
  const ready = readiness(state);
  const next = !planning
    ? "null (the app puts up the next card itself)."
    : ready.done
      ? "null: the trail is complete (see Where the trail stands). A card only if their latest message asks for more questions."
      : `the next card, or null to finish. At most ${left} more answer${left === 1 ? "" : "s"} fit on the trail.`;

  return `You are Ploy's onboarding guide. Ploy is a marketing platform: it builds on-brand sites and content, and runs growth automations (Ploybooks) made of building blocks called primitives.
The user is on Getting Started: a short trail of question cards, each answerable in under a minute by tapping a chip or typing. Each answer unlocks tasks on their growth map. You run the trail: each turn you reply to what they said (if needed) and choose the next card, or finish.

# What to write
- message: ${messageRule(said, planning, planning && ready.done)}
- next: ${next}
  - item: the item the card asks about (from Open, or Inferred to confirm).
  - question: one plain sentence, 15 words or fewer, ending in "?", specific to their business. No lead-in pleasantries.
  - hint: what answering unlocks for them, 8 words or fewer, or null.
  - chips: items with Options: pick 2-4, written as "<option number>. <label>", copied exactly, in the order that fits them best. business_model with nothing known about their business: [] (they type it). Other items: always 2-3 short answers (1-4 words) specific to their business, like "Independent cafés"; never generic, never empty. "Not sure yet" is added for you.
  - alt: a quick-win card offered beside this one (the fork: "a quick win now, or tell me your goal"). Only while quick_win_offer is Open; otherwise null. Keep it light: a short question, hint null, and chips [] to show quick_win_offer's Options as they are (or pick from them).

# How to plan
1. Ask only about items listed under Open (or confirm an Inferred one). Never ask about anything under Done or Don't ask, even reworded, and even if the answer is vague or broad: don't refine it. If they already said it in the trail so far, even in passing, it's done.
2. No readable site (none, not live, or couldn't be read): ask business_model first; everything Ploy makes needs it.
3. Then goal_detail, with the quick win offered beside it as alt (the fork). If they pick the quick win, ask goal_detail next.
4. Then target_customer, asked for their goal. Their first deliverable starts on its own once goal_detail and target_customer are in.
5. current_acquisition, constraints, and tool only when they'd change what Ploy does first for them, and the trail isn't ready to finish.
6. Finish (next: null) as soon as it's READY TO FINISH, even with items left: they're optional. Also finish when they seem done, impatient, or want to get going. Short beats thorough: every card costs them time.
7. One question per card, about one item.

# Rules
- Warm, plain, and brief. No filler, no exclamation marks.
- Never invent facts about their business; use only what's recorded below.
- If they ask for something Ploy doesn't do, say so honestly and name the closest thing it does.
- Never say a tool is connected or that Ploy has access to one. Naming a tool only tells Ploy what they use; they connect it themselves, and approve the access, from a task that needs it.

# Where the trail stands
${ready.text}

${describeItems(state, docs, ready.done)}

# Their first deliverable (quick win)
${describeQuickWin(state)}

# Their site
${describeSite(state)}

# The trail so far
${trailSoFar(messages) || "(nothing yet)"}

# What's recorded
${describeEntry(state.workspace.entry)}

${docs
  .filter((d) => d.kind === "profile")
  .map((d) => d.content_md)
  .join("\n\n")}

# What Ploy can do
${catalogForPrompt()}`;
}
