import { generateText, Output } from "ai";
import { z } from "zod";
import { models } from "@/lib/ai/models";
import { intentIds, intents } from "@/lib/catalog/intents";
import type { ReadPage, SiteOpportunity, SiteSummary } from "./types";

export const siteSummarySchema = z.object({
  label: z.string().describe("What the business is, in 2-4 words, e.g. 'Specialty coffee roaster'"),
  oneLiner: z.string().describe("One sentence: what they sell and to whom, in plain words"),
  whatYouDo: z.string().describe("1-2 sentences on what the business does"),
  whoYouServe: z.string().describe("Who their customers are, as specifically as the site says"),
  offering: z.string().describe("Main products/services and pricing if stated (short Markdown list is fine)"),
  differentiators: z.string().describe("What they claim makes them different, from the site"),
  voice: z.string().describe("How the site sounds, in one sentence"),
  toneWords: z.array(z.string()).describe("3-5 adjectives for the brand voice"),
  pillars: z.array(z.string()).describe("3-4 messaging pillars the site keeps coming back to"),
  opportunities: z
    .array(
      z.object({
        intent: z.enum(intentIds),
        title: z.string().describe("Short, specific to this business, e.g. 'Turn tour page visitors into bookings'"),
        why: z.string().describe("What on the site suggests it, in one sentence"),
      }),
    )
    .describe("The 3 most promising growth opportunities, based on gaps you can see on the site"),
});

const system = `You read a small business's website and draft their profile for Ploy, a marketing platform.
Only use what the pages say. If something isn't stated, say "Not stated on the site." rather than guessing.
Write plainly and specifically; no marketing fluff.

For opportunities, look for gaps: an unclear headline or call to action, no pricing, no lead capture, no social proof, no content, weak targeting. Map each to one of these intents:
${intents.map((i) => `- ${i.id}: ${i.label}`).join("\n")}`;

export async function summarizeSite(url: string, pages: ReadPage[]): Promise<{ summary: SiteSummary; opportunities: SiteOpportunity[] }> {
  const { output } = await generateText({
    model: models.chat,
    system,
    prompt: `Website: ${url}\n\n${pages
      .map((p) => `## Page ${p.path}${p.title ? ` (${p.title})` : ""}\n\n${p.markdown}`)
      .join("\n\n---\n\n")}`,
    output: Output.object({ schema: siteSummarySchema }),
  });
  const { opportunities, ...summary } = output;
  return { summary, opportunities: opportunities.slice(0, 3) };
}
