import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import type { Deliverable } from "./generate";

// Deliverables are saved to Docs as Markdown (the task ploy renders them richly).

const renderers: { [K in QuickWinId]: (o: Deliverable<K>) => string } = {
  homepage_audit: (o) =>
    [o.summary, ...o.issues.map((i, n) => `## ${n + 1}. ${i.title}\n\n**What we saw:** ${i.whatWeSaw}\n\n**Why it matters:** ${i.why}\n\n**Rewrite:**\n\n> ${i.rewrite}`)].join("\n\n"),
  outreach_sequence: (o) =>
    [`For: ${o.audience}`, ...o.emails.map((e) => `## Day ${e.sendDay}: ${e.subject}\n\n${e.body}`)].join("\n\n"),
  lookalike_accounts: (o) =>
    [
      o.criteria,
      "| Company | Website | Why they fit |\n| --- | --- | --- |",
      o.accounts.map((a) => `| ${a.name} | ${a.website ?? ""} | ${a.why} |`).join("\n"),
    ].join("\n\n"),
  social_posts: (o) => o.posts.map((p, n) => `## Post ${n + 1}\n\n**${p.hook}**\n\n${p.body}`).join("\n\n"),
  landing_page_draft: (o) =>
    [
      `## ${o.hero.headline}\n\n${o.hero.subheadline}\n\n**[${o.hero.cta}]**`,
      ...o.sections.map((s) => `## ${s.title}\n\n${s.body}`),
      `**${o.closingCta}**`,
    ].join("\n\n"),
};

export function deliverableMarkdown<R extends QuickWinId>(recipeId: R, output: Deliverable<R>) {
  return `# ${quickWins[recipeId].spec.name}\n\n${renderers[recipeId](output)}`;
}
