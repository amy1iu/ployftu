import type { UIMessage } from "ai";
import { catalogForPrompt, getIntent, quickWins } from "@/lib/catalog";
import { contextItemIds, contextItems, type ContextKey } from "@/lib/catalog/context";
import { integrationCategories } from "@/lib/catalog/integrations";
import type { Doc } from "@/lib/db/types";
import { readSection } from "@/lib/docs/markdown";
import { getProfileSection } from "@/lib/docs/profile";
import { toolToAsk } from "@/lib/map/plan";
import { defaultQuickWin, type Entry } from "@/lib/onboarding/entry";
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

function messageRule(said: Said | null, planning: boolean) {
  if (said && !said.open)
    return "They've finished the setup questions and are chatting freely. Answer what they said in under 70 words, statements only.";
  if (said?.offScript)
    return `They said something the question isn't about: "${said.offScript}". Reply to it in 1-2 sentences, statements only.${said.answered ? " They also answered the question; don't mention that." : ""}`;
  if (said && !said.answered)
    return said.problems.length
      ? `Their answer couldn't be recorded: ${said.problems.join(" ")} Say so in one short sentence, statements only.`
      : "Their latest message didn't answer the question. Respond to what they said in one short, friendly sentence, statements only.";
  return planning
    ? 'Leave it empty (""), except when you finish: then one or two sentences on what happens now (e.g. their first deliverable is building, their map is ready), statements only.'
    : 'Leave it empty ("").';
}

const statusText: Record<ItemStatus, string> = {
  known: "KNOWN (they told us; never ask)",
  answered: "ANSWERED (asked already; they weren't sure or skipped; don't ask again)",
  inferred: "INFERRED from their site (unconfirmed)",
  reading: "COMING from their site, which is being read (don't ask)",
  missing: "MISSING",
  unavailable: "NOT ASKABLE (nothing needs a tool yet)",
};

/** The registry as the planner sees it: each item's status, why it matters, and its fixed options. */
function describeItems(state: TrailState, docs: Doc[]) {
  return contextItemIds
    .filter((id) => id !== "website")
    .map((id) => {
      const item = contextItems[id];
      const status = itemStatus(id, state);
      const lines = [`## ${id} (${item.label}): ${statusText[status]}`, `Why: ${item.why}`];
      if (status === "inferred")
        for (const { doc, section } of item.sections) {
          const d = docs.find((x) => x.slug === doc);
          const text = d && d.sections[section]?.status === "inferred" && readSection(d.content_md, getProfileSection(doc, section).heading);
          if (text) lines.push(`Their site says: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
        }
      if (status === "missing" || status === "inferred") {
        const options = chipOptions(id, state);
        if (id === "tool") {
          const category = toolToAsk(state)!;
          lines.push(
            `Ask about: ${integrationCategories[category].name} (${integrationCategories[category].need}), the capability most of their tasks need. e.g. "${toolQuestions[category]}"`,
          );
        }
        if (options?.length) lines.push(`Options (chips must come from these): ${options.map((o, i) => `${i + 1}. ${o.label}`).join("; ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
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
  const next = planning
    ? `the next card, or null to finish. At most ${left} more answer${left === 1 ? "" : "s"} fit on the trail.`
    : "null (the app puts up the next card itself).";

  return `You are Ploy's onboarding guide. Ploy is a marketing platform: it builds on-brand sites and content, and runs growth automations (Ploybooks) made of building blocks called primitives.
The user is on Getting Started: a short trail of question cards, each answerable in under a minute by tapping a chip or typing. Each answer unlocks tasks on their growth map. You run the trail: each turn you reply to what they said (if needed) and choose the next card, or finish.

# What to write
- message: ${messageRule(said, planning)}
- next: ${next}
  - item: the registry item the card asks about.
  - question: one plain sentence, 15 words or fewer, ending in "?", specific to their business. No lead-in pleasantries.
  - hint: one short line on what answering unlocks for them, or null.
  - chips: items with Options: pick 2-4, written as "<option number>. <label>" (you may reorder, and tailor a label's wording to them, keeping its meaning). Other items: 2-3 short answers (1-4 words) specific to their business, like "Independent cafés"; never generic. "Not sure yet" is added for you.
  - alt: a quick-win card offered beside this one (the fork: "a quick win now, or tell me your goal"), with chips from quick_win_offer's Options. Only while no quick win is running; otherwise null.

# How to plan
1. Never ask about an item that's KNOWN, ANSWERED, COMING from their site, or NOT ASKABLE. Check the trail so far too: if they already said it, even in passing, don't ask it.
2. INFERRED from their site: don't ask cold. If it matters for their goal, confirm it instead ("Your site says you serve dental clinics. Are they who you want to reach?"), with the inferred answer as the first chip.
3. Pick what unlocks the most for their goal. Usually: goal_detail (with the quick win as alt) → target_customer → tool. business_model only when there's no readable site. current_acquisition or constraints only if the answer would change what Ploy does for their goal, and there's room.
4. Offer the quick win early: put it beside the goal question as alt. If they went for the goal and it's already known, you don't need to offer it separately: their first deliverable starts on its own once goal_detail and target_customer are in.
5. One question per card, about one item. Ask it as a person would, using what you know ("Who do you most want your ads to reach?").
6. Finish (next: null) once goal_detail and target_customer are known or answered and a quick win is running, after the tool question if one is askable and there's room. Also finish when they seem done, impatient, or want to get going. Short beats thorough: every card costs them time.

# Rules
- Warm, plain, and brief. No filler, no exclamation marks.
- Never invent facts about their business; use only what's recorded below.
- If they ask for something Ploy doesn't do, say so honestly and name the closest thing it does.
- Never say a tool is connected or that Ploy has access to one. Naming a tool only tells Ploy what they use; they connect it themselves, and approve the access, from a task that needs it.

# What we want to learn (the registry)
${describeItems(state, docs)}

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
