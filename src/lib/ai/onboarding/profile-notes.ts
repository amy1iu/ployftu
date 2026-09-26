import { generateText, Output, type UIMessage } from "ai";
import { z } from "zod";
import { getDocs, patchProfileSections, type SectionPatch } from "@/lib/db/workspaces";
import { readSection } from "@/lib/docs/markdown";
import { getProfileSection, noteSections, type ProfileDocSlug } from "@/lib/docs/profile";
import { models } from "../models";
import { isQuoted, textOf } from "./text";

const sectionIds = noteSections.map(([slug, key]) => `${slug}#${key}`) as [string, ...string[]];
const notesSchema = (ids: [string, ...string[]]) =>
  z.object({
    notes: z.array(
      z.object({
        section: z.enum(ids),
        content: z
          .string()
          .describe(
            "The full new section text: what's already there (unless the user corrected it), plus what they just said, rewritten as a short clean note. Markdown allowed.",
          ),
        evidence: z.string().describe("Verbatim quote from the user's latest message that this comes from"),
      }),
    ),
  });

/** A quote that's only a URL (e.g. their first message) can't back up a profile note. */
const statesSomething = (quote: string) => /[a-z]/i.test(quote.replace(/\S+\.[a-z]{2,}\S*/gi, ""));

export const profileNotesSchema = notesSchema(sectionIds);

/**
 * The notes a message supports, as section patches (no DB): what
 * recordProfileNotes writes, and what the decision eval compares profile_touch
 * against. `docs` are the current sections, for the model to merge into.
 */
export async function proposeNotes({
  said,
  assistant,
  docs,
  sections,
  model = models.extract,
}: {
  said: string;
  assistant: string | null;
  docs: { slug: string; content_md: string }[];
  sections?: string[];
  model?: string;
}) {
  const inPlay = noteSections.filter(([slug, key]) => !sections || sections.includes(`${slug}#${key}`));
  if (!inPlay.length) return { patches: [] as SectionPatch[], usage: null };
  const current = inPlay
    .map(([slug, key, meaning]) => {
      const doc = docs.find((d) => d.slug === slug);
      return `### ${slug}#${key}: ${meaning}\n${doc ? (readSection(doc.content_md, getProfileSection(slug, key).heading) ?? "") : ""}`;
    })
    .join("\n\n");
  const { output, usage } = await generateText({
    model,
    system: `You keep a small business's profile up to date during onboarding. From the user's latest message, record facts it states about these sections, putting each in the section it belongs to (one message can touch several). Only use the user's own words; the assistant's suggestions don't count. A bare website, name, or yes/no states nothing: return no notes. Never speculate ("appears to", "likely"). If they correct something, fix it and keep the rest of the section. For each note, quote the exact words it comes from.

Current sections:
${current}`,
    prompt: `Assistant: ${assistant ?? "(none)"}\n\nUser: ${said}`,
    output: Output.object({
      schema: sections ? notesSchema(inPlay.map(([slug, key]) => `${slug}#${key}`) as [string, ...string[]]) : profileNotesSchema,
    }),
  });
  const patches: SectionPatch[] = output.notes
    .filter((n) => n.content.trim() && isQuoted(n.evidence, said) && statesSomething(n.evidence))
    .map((n) => {
      const [slug, key] = n.section.split("#") as [ProfileDocSlug, string];
      return { slug, key, body: n.content, status: "confirmed", source: "user" };
    });
  return { patches, usage };
}

/**
 * Records what the user's latest message says about their offering, channels,
 * tools, challenges, or voice into the profile Docs. Best-effort; failures are
 * logged. `sections` (as `slug#key`) limits it to the ones a decision model
 * said the message touches (profile_touch).
 */
export async function recordProfileNotes(workspaceId: string, messages: UIMessage[], { sections }: { sections?: string[] } = {}) {
  const user = messages.at(-1);
  if (user?.role !== "user") return;
  const assistant = messages.findLast((m) => m.role === "assistant");
  if (sections && !sections.length) return;
  try {
    // Fresh, not from the start of the turn: the site reader may have written since.
    const docs = await getDocs(workspaceId);
    const { patches } = await proposeNotes({ said: textOf(user), assistant: assistant ? textOf(assistant) : null, docs, sections });
    await patchProfileSections(workspaceId, patches);
  } catch (error) {
    console.error("Failed to record profile notes", error);
  }
}
