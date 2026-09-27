import { z } from "zod";
import type { PloybookSpec } from "./ploybooks";

// Quick wins: the only work that actually runs. Each produces a real LLM
// deliverable (generation lands in phase 3) and is shown as a lit map node.

export const quickWins = {
  homepage_audit: {
    label: "Audit my homepage",
    builds: "a homepage messaging audit",
    needsWebsite: true,
    pickWhen: "They have a website, and either have no clear goal or want more conversions.",
    spec: {
      id: "homepage_audit",
      name: "Homepage messaging audit",
      goal: "Find the three biggest messaging gaps on your homepage and rewrite them.",
      region: "site_brand",
      trigger: "manual",
      steps: [
        { kind: "agent_tool", tool: "scrape_site", label: "Read your homepage" },
        { kind: "primitive", primitive: "brand_guidelines", action: "read", label: "Load your brand voice" },
        { kind: "primitive", primitive: "docs", action: "create_doc", label: "Save the audit to Docs" },
      ],
      requires: [],
      needsContext: [],
      prereqs: [],
      estMinutes: 2,
      source: "quick_win",
    },
    output: z.object({
      summary: z.string(),
      issues: z
        .array(z.object({ title: z.string(), whatWeSaw: z.string(), why: z.string(), rewrite: z.string() }))
        .length(3),
    }),
  },
  outreach_sequence: {
    label: "Write a cold email sequence",
    builds: "a 3-step outreach sequence",
    needsWebsite: false,
    pickWhen: "They want outbound, pipeline, or follow-up help.",
    spec: {
      id: "outreach_sequence",
      name: "3-step outreach sequence",
      goal: "A ready-to-send cold email sequence written in your voice.",
      region: "campaigns",
      trigger: "manual",
      steps: [
        { kind: "agent_tool", tool: "research_company", label: "Research your buyers" },
        { kind: "primitive", primitive: "brand_guidelines", action: "read", label: "Load your brand voice" },
        { kind: "primitive", primitive: "ploybooks", action: "create_ploybook", label: "Draft the sequence as a Ploybook" },
      ],
      requires: [],
      needsContext: ["audience"],
      prereqs: [],
      estMinutes: 2,
      source: "quick_win",
    },
    output: z.object({
      audience: z.string(),
      emails: z.array(z.object({ sendDay: z.number(), subject: z.string(), body: z.string() })).length(3),
    }),
  },
  lookalike_accounts: {
    label: "Find accounts like my best customers",
    builds: "a list of 10 look-alike accounts",
    needsWebsite: false,
    pickWhen: "They want more leads and can describe who their best customers are.",
    spec: {
      id: "lookalike_accounts",
      name: "10 look-alike target accounts",
      goal: "Companies that look like your best customers, with why each one fits.",
      region: "leads_data",
      trigger: "manual",
      steps: [
        { kind: "agent_tool", tool: "research_company", label: "Find companies like your best customers" },
        { kind: "primitive", primitive: "ploydb", action: "create_table", label: "Create a Target Accounts table" },
        { kind: "primitive", primitive: "ploydb", action: "upsert_rows", label: "Add accounts with fit notes" },
      ],
      requires: [],
      needsContext: ["audience"],
      prereqs: [],
      estMinutes: 2,
      source: "quick_win",
    },
    output: z.object({
      criteria: z.string(),
      accounts: z.array(z.object({ name: z.string(), website: z.string().nullable(), why: z.string() })).length(10),
    }),
  },
  social_posts: {
    label: "Draft 3 LinkedIn posts",
    builds: "3 LinkedIn posts",
    needsWebsite: false,
    pickWhen: "They want brand awareness, content, or social presence.",
    spec: {
      id: "social_posts",
      name: "3 LinkedIn posts",
      goal: "Three on-brand posts ready to publish this week.",
      region: "campaigns",
      trigger: "manual",
      steps: [
        { kind: "primitive", primitive: "brand_guidelines", action: "read", label: "Load your voice and pillars" },
        { kind: "primitive", primitive: "docs", action: "create_doc", label: "Save the drafts to Docs" },
      ],
      requires: [],
      needsContext: ["offering"],
      prereqs: [],
      estMinutes: 2,
      source: "quick_win",
    },
    output: z.object({ posts: z.array(z.object({ hook: z.string(), body: z.string() })).length(3) }),
  },
  landing_page_draft: {
    label: "Draft a landing page",
    builds: "a landing page draft",
    needsWebsite: false,
    pickWhen: "They don't have a website yet, or want a page for a specific offer or ad campaign.",
    spec: {
      id: "landing_page_draft",
      name: "Landing page draft",
      goal: "A first landing page: headline, sections, and call to action.",
      region: "site_brand",
      trigger: "manual",
      steps: [
        { kind: "primitive", primitive: "brand_guidelines", action: "read", label: "Load your brand" },
        { kind: "primitive", primitive: "sites", action: "create_page", label: "Draft the page" },
        { kind: "primitive", primitive: "docs", action: "create_doc", label: "Save the copy to Docs" },
      ],
      requires: [],
      needsContext: ["offering"],
      prereqs: [],
      estMinutes: 2,
      source: "quick_win",
    },
    output: z.object({
      hero: z.object({ headline: z.string(), subheadline: z.string(), cta: z.string() }),
      sections: z.array(z.object({ title: z.string(), body: z.string() })).min(3).max(4),
      closingCta: z.string(),
    }),
  },
} satisfies Record<
  string,
  {
    /** How the user picks it on the trail, e.g. "Audit my homepage". */
    label: string;
    /** What Ploy builds, for a sentence: "…enough to build a homepage messaging audit". */
    builds: string;
    needsWebsite: boolean;
    pickWhen: string;
    spec: PloybookSpec;
    output: z.ZodType;
  }
>;

export type QuickWinId = keyof typeof quickWins;
export const quickWinIds = Object.keys(quickWins) as [QuickWinId, ...QuickWinId[]];
