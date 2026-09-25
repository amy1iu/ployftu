import { z } from "zod";
import { integrationCategoryIds } from "./integrations";

// Ploy primitives: the product's own building blocks, semi-visible in the UI.
// None of these run in this project; they're described so agents can plan with
// them and the UI can show what a Ploybook *would* do. Schemas use .nullable()
// rather than .optional() so they stay valid for OpenAI strict structured output.

type Action = { description: string; input: z.ZodType };

type PrimitiveDef = {
  name: string;
  description: string;
  actions: Record<string, Action>;
};

const markdown = z.string().describe("Markdown content");

export const primitives = {
  docs: {
    name: "Docs",
    description:
      "Markdown documents that hold the business's shared context (profile, goals, channels) and written deliverables.",
    actions: {
      create_doc: {
        description: "Create a new doc.",
        input: z.object({ title: z.string(), markdown }),
      },
      update_doc: {
        description: "Replace one section of an existing doc.",
        input: z.object({ title: z.string(), section: z.string(), markdown }),
      },
    },
  },
  brand_guidelines: {
    name: "Brand Guidelines",
    description:
      "The brand's voice, colors, typography, logo, and messaging pillars. Stored as a Doc; filled from the website and the user.",
    actions: {
      read: { description: "Read the current brand guidelines.", input: z.object({}) },
      update: {
        description: "Update brand fields.",
        input: z.object({
          voice: z.string().nullable(),
          toneWords: z.array(z.string()).nullable(),
          colors: z.array(z.string()).nullable(),
          fonts: z.array(z.string()).nullable(),
          logoUrl: z.string().nullable(),
          messagingPillars: z.array(z.string()).nullable(),
        }),
      },
    },
  },
  ploydb: {
    name: "PloyDB",
    description: "Structured tables for leads, accounts, contacts, and content calendars.",
    actions: {
      create_table: {
        description: "Create a table.",
        input: z.object({
          table: z.string(),
          columns: z.array(z.object({ name: z.string(), type: z.enum(["text", "number", "url", "email", "date"]) })),
        }),
      },
      upsert_rows: {
        description: "Insert or update rows.",
        input: z.object({ table: z.string(), rows: z.array(z.record(z.string(), z.string())) }),
      },
      query: {
        description: "Filter rows in a table.",
        input: z.object({ table: z.string(), filter: z.string().nullable() }),
      },
    },
  },
  ploybooks: {
    name: "Ploybooks",
    description:
      "Automations: a trigger plus ordered steps that call other primitives. Can run once or on a schedule/event.",
    actions: {
      create_ploybook: {
        description: "Define an automation.",
        input: z.object({
          name: z.string(),
          trigger: z.enum(["manual", "schedule", "event"]),
          schedule: z.string().nullable(),
          steps: z.array(z.string()),
        }),
      },
      activate: { description: "Turn an automation on.", input: z.object({ name: z.string() }) },
    },
  },
  sites: {
    name: "Sites",
    description: "Build, edit, and publish web pages, and connect custom domains.",
    actions: {
      create_page: {
        description: "Create a page from sections.",
        input: z.object({
          page: z.string(),
          sections: z.array(z.object({ type: z.string(), copy: z.string() })),
        }),
      },
      update_section: {
        description: "Rewrite one section of a page.",
        input: z.object({ page: z.string(), section: z.string(), copy: z.string() }),
      },
      publish: { description: "Publish a page.", input: z.object({ page: z.string() }) },
      connect_domain: { description: "Point a custom domain at the site.", input: z.object({ domain: z.string() }) },
    },
  },
  integrations: {
    name: "Integrations",
    description: "Connections to outside tools (email, CRM, social, ad platforms, analytics).",
    actions: {
      connect: {
        description: "Connect a tool that provides a capability (e.g. Attio as the CRM).",
        input: z.object({ category: z.enum(integrationCategoryIds), tool: z.string() }),
      },
      send_email: {
        description: "Send or schedule email through a connected inbox.",
        input: z.object({ to: z.string(), subject: z.string(), body: markdown }),
      },
      sync_contacts: {
        description: "Sync contacts with the connected CRM.",
        input: z.object({ table: z.string() }),
      },
      post: {
        description: "Publish a post to a connected social account.",
        input: z.object({ account: z.string(), text: z.string() }),
      },
    },
  },
  ads: {
    name: "Ads",
    description: "Plan and launch paid campaigns: audiences, creatives, and budgets.",
    actions: {
      create_campaign: {
        description: "Create a campaign.",
        input: z.object({
          platform: z.enum(["google", "meta", "linkedin"]),
          objective: z.enum(["traffic", "leads", "conversions", "awareness"]),
          budgetDaily: z.number().nullable(),
        }),
      },
      create_audience: {
        description: "Define a targeting audience.",
        input: z.object({ platform: z.enum(["google", "meta", "linkedin"]), description: z.string() }),
      },
      generate_creative: {
        description: "Write ad creative variants.",
        input: z.object({ headline: z.string(), body: z.string() }),
      },
    },
  },
  analytics: {
    name: "Analytics",
    description: "Track site and campaign metrics, build reports and dashboards.",
    actions: {
      track: { description: "Start tracking a metric.", input: z.object({ metric: z.string(), source: z.string() }) },
      create_report: {
        description: "Build a recurring report.",
        input: z.object({ metrics: z.array(z.string()), period: z.enum(["daily", "weekly", "monthly"]) }),
      },
      create_dashboard: {
        description: "Build a dashboard.",
        input: z.object({ name: z.string(), metrics: z.array(z.string()) }),
      },
    },
  },
} satisfies Record<string, PrimitiveDef>;

export type PrimitiveId = keyof typeof primitives;
export const primitiveIds = Object.keys(primitives) as [PrimitiveId, ...PrimitiveId[]];
