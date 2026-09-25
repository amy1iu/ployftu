import { generateText, Output, type UIMessage } from "ai";
import { z } from "zod";
import { intentIds, intents } from "@/lib/catalog";
import type { Entry } from "@/lib/onboarding/entry";
import type { EntryUpdate } from "@/lib/onboarding/set-entry";
import { models } from "../models";

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
});

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

Examples:
- "yes, acme.com" → website has acme.com; goals null; business null
- "no site yet, I'm a wedding photographer" → website none; goals null; business whatTheyDo "Wedding photography"
- "not sure, what do you suggest?" (asked about goals) → goals unsure; website null
- "we want more demo requests" → goals has [get_more_leads]; website null
- "no site, I run a bakery and I'm not sure where to start with marketing" → website none; goals unsure; business whatTheyDo "Bakery"
- "I run a software agency and need help hiring engineers" → goals has, no intents, unmatched "help hiring engineers"; business whatTheyDo "Software agency"

Intents:
${intents.map((i) => `- ${i.id}: ${i.label} (e.g. ${i.examples.join(", ")})`).join("\n")}`;

const textOf = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

/**
 * Pulls entry answers out of the conversation, focused on the user's latest
 * message but catching answers given earlier that weren't recorded. Runs in
 * parallel with the reply.
 */
export async function extractEntryUpdate(entry: Entry, messages: UIMessage[]): Promise<EntryUpdate> {
  if (messages.at(-1)?.role !== "user") return { website: null, goals: null, business: null };
  const conversation = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m)}`)
    .join("\n\n");

  const { output } = await generateText({
    model: models.extract,
    system,
    prompt: `Recorded so far: ${JSON.stringify(entry)}

Conversation (the last message is the user's latest):
${conversation}`,
    output: Output.object({ schema: entryUpdateSchema }),
  });

  // Drop any answer the user didn't actually give: its quote must appear in their messages.
  const said = normalize(messages.filter((m) => m.role === "user").map(textOf).join("\n"));
  const grounded = <T extends { evidence: string } | null>(field: T) =>
    field && normalize(field.evidence) && said.includes(normalize(field.evidence)) ? field : null;
  return { website: grounded(output.website), goals: grounded(output.goals), business: grounded(output.business) };
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9.'/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
