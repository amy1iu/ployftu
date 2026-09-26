import { catalogForPrompt, getIntent } from "@/lib/catalog";
import type { Doc, Workspace } from "@/lib/db/types";
import type { Entry } from "@/lib/onboarding/entry";
import type { NextQuestion } from "@/lib/onboarding/trail";

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

function messageRule(next: NextQuestion | null, said: Said | null) {
  if (said && !said.open)
    return "They've finished the setup questions and are chatting freely. Answer what they said in under 70 words, statements only.";
  if (said?.offScript)
    return `They said something the question isn't about: "${said.offScript}". Reply to it in 1-2 sentences, statements only.${said.answered ? " They also answered the question; don't mention that." : ""}`;
  if (said && !said.answered)
    return said.problems.length
      ? `Their answer couldn't be recorded: ${said.problems.join(" ")} Say so in one short sentence, statements only.`
      : "Their latest message didn't answer the question. Respond to what they said in one short, friendly sentence, statements only.";
  return 'Leave it empty ("").';
}

/**
 * The Getting Started trail's words. The code picks each question; the model
 * only writes what's specific to this business (the follow-up and its chips)
 * and replies to anything off-script.
 */
export function buildTrailPrompt({
  workspace,
  docs,
  next,
  said,
}: {
  workspace: Workspace;
  docs: Doc[];
  next: NextQuestion | null;
  said: Said | null;
}) {
  const question = !next
    ? 'Leave it empty ("").'
    : next.question
      ? `Write exactly: "${next.question}"`
      : `${next.guide} One plain sentence, 15 words or fewer, ending in "?".`;
  const replies =
    next && !next.chips
      ? 'Exactly 3 short answers (1-4 words each) the user could tap, specific to their business, like "Independent cafés". Never generic.'
      : "An empty list.";

  return `You are Ploy's onboarding guide. Ploy is a marketing platform: it builds on-brand sites and content, and runs growth automations (Ploybooks) made of building blocks called primitives.
The user is on a short trail of quick questions; each answer unlocks tasks on their growth map. You write the words for one step of it.

# What to write
- message: ${messageRule(next, said)}
- question: ${question}
- replies: ${replies}

# Rules
- Warm, plain, and brief. No filler, no exclamation marks.
- Never invent facts about their business; use only what's recorded below.
- If they ask for something Ploy doesn't do, say so honestly and name the closest thing it does.
- Never say a tool is connected or that Ploy has access to one. Naming a tool only tells Ploy what they use; they connect it themselves, and approve the access, from a task that needs it.

# What's recorded
${describeEntry(workspace.entry)}

${docs
  .filter((d) => d.kind === "profile")
  .map((d) => d.content_md)
  .join("\n\n")}

# What Ploy can do
${catalogForPrompt()}`;
}
