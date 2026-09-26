import { generateText, Output, type UIMessage } from "ai";
import { z } from "zod";
import { intentIds, intents } from "@/lib/catalog";
import type { Entry } from "@/lib/onboarding/entry";
import type { EntryUpdate } from "@/lib/onboarding/set-entry";
import type { AnsweredSlot, Chip } from "@/lib/onboarding/trail";
import { models } from "../models";
import { isQuoted, textOf } from "./text";

// Schemas use .nullable() instead of .optional(): OpenAI strict mode requires every field.
export const entryUpdateSchema = z.object({
  website: z
    .object({
      status: z
        .enum(["has", "none", "not_live"])
        .describe("has = gave a URL (a social or marketplace profile counts); none = no site; not_live = in progress"),
      url: z.string().nullable().describe("Exactly as the user wrote it, when status is has"),
      evidence: z.string().describe("Verbatim quote from the user's own messages that gives this answer"),
    })
    .nullable()
    .describe("Only when the latest message says something about having a website"),
  goals: z
    .object({
      status: z.enum(["has", "unsure"]),
      intents: z
        .array(z.object({ id: z.enum(intentIds), weight: z.number() }))
        .describe("1-2 intents matching what they want, strongest first, weight 0-1. Empty when unsure."),
      inUserWords: z.string().nullable().describe("Their goal, briefly, in their own words"),
      unmatched: z
        .string()
        .nullable()
        .describe("If what they want isn't covered by any intent, their words here; otherwise null"),
      evidence: z.string().describe("Verbatim quote from the user's own messages that gives this answer"),
    })
    .nullable()
    .describe("Only when the latest message says what they want to achieve, or that they're not sure"),
  business: z
    .object({
      whatTheyDo: z.string().nullable().describe("One sentence: what they sell"),
      whoTheyServe: z.string().nullable().describe("Who their customers are"),
      evidence: z.string().describe("Verbatim quote from the user's own messages that gives this answer"),
    })
    .nullable()
    .describe("Only when the latest message describes the business itself"),
  answer: z
    .object({
      answered: z
        .boolean()
        .describe("Whether the latest message actually answers the current question. False if it only asks or talks about something else."),
      matchedChip: z
        .string()
        .nullable()
        .describe("The value of the option that best matches their answer, if one clearly does; otherwise null"),
      summary: z
        .string()
        .nullable()
        .describe("Their answer to the current question in 5 words or fewer, styled like the options (e.g. 'Cafés and offices'). Null if they didn't answer it."),
      offScript: z
        .string()
        .nullable()
        .describe("If the latest message asks for or says something the current question isn't about, a short paraphrase of it; otherwise null"),
    })
    .nullable()
    .describe("Only when a current question is given: how the latest message relates to it"),
});

/** How a typed message relates to the trail question it was typed under. */
export type TrailAnswer = { answered: boolean; matchedChip: string | null; summary: string | null; offScript: string | null };

/** The trail question a typed message answers. */
export type AskedQuestion = { slot: AnsweredSlot; question: string; chips: Chip[] };

const system = `You record a new user's answers during onboarding for Ploy, a marketing platform.
You get what's already recorded and the conversation. Fill in a field when the user's messages answer it and it isn't recorded yet, or when their latest message changes a recorded answer. Otherwise leave it null.
Never infer an answer from silence: a message that only gives a URL says nothing about goals, so goals stays null.
Only the user's own words count. Answering a follow-up question (e.g. about customers or pricing) is not a goal.
For every field you fill, quote the exact words from the user's messages that give the answer. If you can't quote them, the field is null.

Rules:
- A URL, domain, or social/marketplace profile link means website.status "has". Copy the URL exactly as written, typos included.
- Saying they have no site means "none"; a site that's being built or not launched means "not_live".
- Goals: map what they want to 1-2 of the intents below. If they're unsure or ask for suggestions, status "unsure" with no intents. If they pick a suggested option, that counts as a goal.
- If their goal isn't really covered by any intent (e.g. hiring, fundraising, product development, legal), put their words in "unmatched" and include the closest intent only if it's a reasonable fit.
- A vague goal like "grow" still counts: map it to the closest intent with a low weight.
- business: only when they describe what they sell or who they sell to.
- answer (only when a current question is given): whether their latest message answers it, the option it matches (by value, only if it clearly does), a summary of 5 words or fewer, and anything off-script. A message can answer the question and still ask about something else; fill both. Asking for one of the options ("can you check my homepage?") answers the question by picking it; that's not off-script.

Examples:
- "yes, acme.com" → website has acme.com; goals null; business null
- "no site yet, I'm a wedding photographer" → website none; goals null; business whatTheyDo "Wedding photography"
- "not sure, what do you suggest?" (asked about goals) → goals unsure; website null
- "we want more demo requests" → goals has [get_more_leads]; website null
- "no site, I run a bakery and I'm not sure where to start with marketing" → website none; goals unsure; business whatTheyDo "Bakery"
- "I run a software agency and need help hiring engineers" → goals has, no intents, unmatched "help hiring engineers"; business whatTheyDo "Software agency"
- "we want Google Ads running for Greenleaf, our landscaping company" → goals has [launch_paid_ads]; business whatTheyDo "Landscaping company" (a business named in passing still counts)

Intents:
${intents.map((i) => `- ${i.id}: ${i.label} (e.g. ${i.examples.join(", ")})`).join("\n")}`;


/**
 * Pulls entry answers out of the conversation, focused on the user's latest
 * message but catching answers given earlier that weren't recorded. Runs in
 * parallel with the reply.
 */
export async function extractEntryUpdate(
  entry: Entry,
  messages: UIMessage[],
  asked: AskedQuestion | null = null,
): Promise<EntryUpdate & { answer: TrailAnswer | null }> {
  if (messages.at(-1)?.role !== "user") return { website: null, goals: null, business: null, answer: null };
  const conversation = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m)}`)
    .join("\n\n");

  const { output } = await generateText({
    model: models.extract,
    system,
    prompt: `Recorded so far: ${JSON.stringify(entry)}

Conversation (the last message is the user's latest):
${conversation}${
      asked
        ? `

Current question: ${asked.question}
Options (label = value): ${asked.chips.map((c) => `${c.label} = ${c.value}`).join("; ") || "none, free text only"}`
        : ""
    }`,
    output: Output.object({ schema: entryUpdateSchema }),
  });

  // Drop any answer the user didn't actually give: its quote must appear in their messages.
  const said = messages.filter((m) => m.role === "user").map(textOf).join("\n");
  const grounded = <T extends { evidence: string } | null>(field: T) => (field && isQuoted(field.evidence, said) ? field : null);
  const answer = asked && output.answer
    ? { ...output.answer, matchedChip: asked.chips.some((c) => c.value === output.answer!.matchedChip) ? output.answer.matchedChip : null }
    : null;
  return { website: grounded(output.website), goals: grounded(output.goals), business: grounded(output.business), answer };
}

// With Jev making the typed decisions (answered? which chip? which goal?), the
// extractor only has to copy out what a decision model can't: free text.
export const freeTextSchema = z.object({
  goalInWords: z.string().nullable().describe("Their goal, briefly, in their own words; null if the message states none"),
  whatTheyDo: z.string().nullable().describe("One sentence: what they sell; null if the message doesn't say"),
  whoTheyServe: z.string().nullable().describe("Who their customers are, or who they want to reach; null if the message doesn't say"),
  summary: z
    .string()
    .nullable()
    .describe("Their answer to the current question in 5 words or fewer, styled like the options (e.g. 'Cafés and offices'). Null if they didn't answer it."),
  evidence: z.string().describe("Verbatim quote from the user's latest message that the fields come from"),
});

export type FreeText = Omit<z.infer<typeof freeTextSchema>, "evidence">;

/**
 * The slim extractor: free-text fields from the latest message only, for an
 * answer the decision model already classified. Null fields when the quote
 * isn't really theirs.
 */
export async function extractFreeText(message: string, asked: AskedQuestion): Promise<FreeText> {
  const { output } = await generateText({
    model: models.extract,
    system: `You copy a new user's answer out of their message during onboarding for Ploy, a marketing platform. Use only their words; never guess. Quote the words you used.`,
    prompt: `Current question: ${asked.question}
Options: ${asked.chips.map((c) => c.label).join("; ") || "none, free text only"}

User's message: ${message}`,
    output: Output.object({ schema: freeTextSchema }),
  });
  const { evidence, ...fields } = output;
  return isQuoted(evidence, message) ? fields : { goalInWords: null, whatTheyDo: null, whoTheyServe: null, summary: null };
}
