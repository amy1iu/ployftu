import { generateText, Output } from "ai";
import type { z } from "zod";
import { models } from "@/lib/ai/models";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import { getDocs, getWorkspace } from "@/lib/db/workspaces";
import { readSection } from "@/lib/docs/markdown";
import { getCachedSite } from "@/lib/site/read";

export type Deliverable<R extends QuickWinId> = z.infer<(typeof quickWins)[R]["output"]>;

const instructions: Record<QuickWinId, string> = {
  homepage_audit:
    "Audit their homepage copy (below). Find the 3 biggest messaging gaps that cost them customers: unclear headline, vague value, weak or missing call to action, no proof, wrong audience. For each: quote what you saw, say why it costs them, and write a rewrite in their voice. Start with a one-sentence summary.",
  outreach_sequence:
    "Write a 3-email cold outreach sequence to their best-fit buyers, sent on days 0, 3, and 7. Short (under 120 words each), specific to what they sell and who they sell to, in their voice, one clear ask per email. Use [First name] and [Company] placeholders. Start with who it's for.",
  lookalike_accounts:
    "List 10 real companies that look like their best customers, with their website if you know it (null if unsure) and one sentence on why each fits. Only include companies you're confident exist. Start with the criteria you used.",
  social_posts:
    "Write 3 LinkedIn posts they could publish this week: each with a scroll-stopping first line (hook) and a body under 120 words, in their voice, about what they sell or why it matters. Vary the angles: a story, a tip, a point of view.",
  landing_page_draft:
    "Draft a landing page for their main offer: a hero (headline under 10 words, one-sentence subheadline, call-to-action button text), 3-4 sections (title + short body) covering the problem, what they offer, why them, and proof or how it works, and a closing call to action. In their voice, specific to them.",
};

/** Waits for their site to finish reading (the homepage audit needs its copy), up to a limit. */
async function siteCopy(workspaceId: string, timeoutMs = 45_000) {
  for (const started = Date.now(); Date.now() - started < timeoutMs; await new Promise((r) => setTimeout(r, 1500))) {
    const { crawl } = await getWorkspace(workspaceId);
    if (!crawl || crawl.status === "failed") return null;
    if (crawl.status === "done") return getCachedSite(crawl.url);
  }
  return null;
}

async function context(workspaceId: string, recipeId: QuickWinId) {
  const [workspace, docs] = await Promise.all([getWorkspace(workspaceId), getDocs(workspaceId)]);
  const profile = docs
    .filter((d) => d.kind === "profile")
    .map((d) => d.content_md)
    .join("\n\n");
  const goal = workspace.entry.goals.inUserWords ? `\n\nTheir goal, in their words: ${workspace.entry.goals.inUserWords}` : "";
  const site = recipeId === "homepage_audit" ? await siteCopy(workspaceId) : null;
  const homepage = site?.pages.find((p) => p.path === "/");
  return {
    docs,
    prompt: `# Their business profile\n\n${profile}${goal}${homepage ? `\n\n# Their homepage (${site!.pages[0].url})\n\n${homepage.markdown}` : ""}`,
  };
}

/**
 * The quick win's deliverable, written by the model from their profile (and
 * homepage, for the audit). One retry, then a template built from the profile,
 * so the first deliverable always arrives.
 */
export async function generateDeliverable<R extends QuickWinId>(workspaceId: string, recipeId: R) {
  const { docs, prompt } = await context(workspaceId, recipeId);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: models.chat,
        system: `You're Ploy, a marketing platform, making a first deliverable for a small business. ${instructions[recipeId]}\nUse only what their profile says about them; don't invent facts, numbers, or testimonials. Write plainly and specifically.`,
        prompt,
        // Narrowing a union of recipe schemas by a generic key needs a cast.
        output: Output.object({ schema: quickWins[recipeId].output as unknown as z.ZodType<Deliverable<R>> }),
      });
      return { output, fallback: false };
    } catch (error) {
      console.error(`Deliverable ${recipeId} attempt ${attempt + 1} failed`, error);
    }
  }
  return { output: fallbackDeliverable(recipeId, docs), fallback: true };
}

/** A usable deliverable built from the profile alone. */
function fallbackDeliverable<R extends QuickWinId>(recipeId: R, docs: Awaited<ReturnType<typeof getDocs>>): Deliverable<R> {
  const overview = docs.find((d) => d.slug === "business-overview")?.content_md ?? "";
  const known = (heading: string, otherwise: string) => {
    const text = readSection(overview, heading);
    return text && !text.startsWith("_") ? text.split("\n")[0] : otherwise;
  };
  const what = known("What we do", "what you do");
  const who = known("Who we serve", "your customers");

  const outputs: { [K in QuickWinId]: Deliverable<K> } = {
    homepage_audit: {
      summary: `Three places to make your homepage say "${what}" faster and more clearly.`,
      issues: [
        { title: "Lead with the outcome", whatWeSaw: "The first screen", why: "Visitors decide in seconds whether you're for them.", rewrite: `${what}, for ${who}.` },
        { title: "One clear next step", whatWeSaw: "The calls to action", why: "Several competing buttons split attention.", rewrite: "Pick one primary action and repeat it down the page." },
        { title: "Show proof early", whatWeSaw: "Reviews and results", why: "Proof near the top builds trust before people scroll away.", rewrite: "Add a short customer quote or result under the headline." },
      ],
    },
    outreach_sequence: {
      audience: who,
      emails: [
        { sendDay: 0, subject: "Quick question, [First name]", body: `Hi [First name],\n\nWe help ${who} with ${what}. Worth a 15-minute call to see if it fits [Company]?\n\nThanks` },
        { sendDay: 3, subject: "Re: Quick question", body: "Hi [First name],\n\nFollowing up in case this got buried. Happy to share how others like [Company] use us.\n\nThanks" },
        { sendDay: 7, subject: "Should I close the loop?", body: "Hi [First name],\n\nI'll stop here. If the timing's better later, just reply and I'll send details.\n\nThanks" },
      ],
    },
    lookalike_accounts: {
      criteria: `Businesses like your best customers: ${who}.`,
      accounts: Array.from({ length: 10 }, (_, i) => ({ name: `Target account ${i + 1}`, website: null, why: `Matches: ${who}.` })),
    },
    social_posts: {
      posts: [
        { hook: "Here's what we actually do all day.", body: `${what}. Here's why it matters for ${who}.` },
        { hook: "One thing we wish every customer knew:", body: "Share the tip you give most often, and why it works." },
        { hook: "Behind the scenes this week:", body: "Show one real moment from your work and what it says about how you do things." },
      ],
    },
    landing_page_draft: {
      hero: { headline: what.split(/[.,]/)[0].slice(0, 60), subheadline: `For ${who}.`, cta: "Get started" },
      sections: [
        { title: "The problem", body: `What ${who} struggle with today, in their words.` },
        { title: "What we offer", body: what },
        { title: "Why us", body: "What makes working with you different." },
      ],
      closingCta: "Ready when you are.",
    },
  };
  return outputs[recipeId];
}
