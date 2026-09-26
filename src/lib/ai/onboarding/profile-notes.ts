import { generateText, Output, type UIMessage } from "ai";
import { z } from "zod";
import { getDocs, patchProfileSections, type SectionPatch } from "@/lib/db/workspaces";
import { readSection } from "@/lib/docs/markdown";
import { getProfileSection, type ProfileDocSlug } from "@/lib/docs/profile";
import { models } from "../models";
import { isQuoted, textOf } from "./text";

// Profile sections the user fills in as the conversation goes. Anything they
// tell us about these, at any point, is written into the Docs as confirmed.
const noteSections = [
  ["business-overview", "what-we-do", "what the business does"],
  ["business-overview", "offering", "their products or services, and pricing"],
  ["business-overview", "who-we-serve", "who their customers are"],
  ["business-overview", "differentiators", "what makes them different from competitors"],
  ["goals-and-focus", "challenges", "problems or frustrations with marketing and growth"],
  ["goals-and-focus", "constraints", "limits on budget, time, team, or compliance that rule things in or out"],
  ["channels-and-tools", "acquisition", "how customers find them today (channels)"],
  ["channels-and-tools", "outreach", "how they reach out to or follow up with prospects today"],
  ["channels-and-tools", "tools", "software and services they use (CRM, email, store, ads, analytics)"],
  ["brand-guidelines", "voice", "how their brand should sound"],
] as const satisfies readonly (readonly [ProfileDocSlug, string, string])[];

const sectionIds = noteSections.map(([slug, key]) => `${slug}#${key}`) as [string, ...string[]];

/** A quote that's only a URL (e.g. their first message) can't back up a profile note. */
const statesSomething = (quote: string) => /[a-z]/i.test(quote.replace(/\S+\.[a-z]{2,}\S*/gi, ""));

export const profileNotesSchema = z.object({
  notes: z.array(
    z.object({
      section: z.enum(sectionIds),
      content: z
        .string()
        .describe(
          "The full new section text: what's already there (unless the user corrected it), plus what they just said, rewritten as a short clean note. Markdown allowed.",
        ),
      evidence: z.string().describe("Verbatim quote from the user's latest message that this comes from"),
    }),
  ),
});


/**
 * Records what the user's latest message says about their offering, channels,
 * tools, challenges, or voice into the profile Docs. Best-effort; failures are logged.
 */
export async function recordProfileNotes(workspaceId: string, messages: UIMessage[]) {
  const user = messages.at(-1);
  if (user?.role !== "user") return;
  const assistant = messages.findLast((m) => m.role === "assistant");
  const said = textOf(user);
  try {
    // Fresh, not from the start of the turn: the site reader may have written since.
    const docs = await getDocs(workspaceId);
    const current = noteSections
      .map(([slug, key, meaning]) => {
        const doc = docs.find((d) => d.slug === slug);
        return `### ${slug}#${key}: ${meaning}\n${doc ? (readSection(doc.content_md, getProfileSection(slug, key).heading) ?? "") : ""}`;
      })
      .join("\n\n");
    const { output } = await generateText({
      model: models.extract,
      system: `You keep a small business's profile up to date during onboarding. From the user's latest message, record facts it states about these sections, putting each in the section it belongs to (one message can touch several). Only use the user's own words; the assistant's suggestions don't count. A bare website, name, or yes/no states nothing: return no notes. Never speculate ("appears to", "likely"). If they correct something, fix it and keep the rest of the section. For each note, quote the exact words it comes from.

Current sections:
${current}`,
      prompt: `Assistant: ${assistant ? textOf(assistant) : "(none)"}\n\nUser: ${said}`,
      output: Output.object({ schema: profileNotesSchema }),
    });

    const patches: SectionPatch[] = output.notes
      .filter((n) => n.content.trim() && isQuoted(n.evidence, said) && statesSomething(n.evidence))
      .map((n) => {
        const [slug, key] = n.section.split("#") as [ProfileDocSlug, string];
        return { slug, key, body: n.content, status: "confirmed", source: "user" };
      });
    await patchProfileSections(workspaceId, patches);
  } catch (error) {
    console.error("Failed to record profile notes", error);
  }
}
