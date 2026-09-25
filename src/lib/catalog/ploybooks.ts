import type { AgentToolId } from "./agent-tools";
import type { IntegrationProvider, PrimitiveId } from "./primitives";
import type { RegionId } from "./regions";

// One shape for every unit of work: map-node templates, quick wins, and
// (later) Ploybooks the agent composes itself from primitives.
export type Step =
  | { kind: "primitive"; primitive: PrimitiveId; action: string; label: string }
  | { kind: "agent_tool"; tool: AgentToolId; label: string };

export type PloybookSpec = {
  id: string;
  name: string;
  goal: string;
  region: RegionId;
  trigger: "manual" | "schedule" | "event";
  steps: Step[];
  requires: IntegrationProvider[];
  prereqs: string[];
  estMinutes: number;
  source: "template" | "quick_win" | "composed";
};

const p = (primitive: PrimitiveId, action: string, label: string): Step => ({
  kind: "primitive",
  primitive,
  action,
  label,
});
const t = (tool: AgentToolId, label: string): Step => ({ kind: "agent_tool", tool, label });

type TemplateInput = Omit<PloybookSpec, "source" | "prereqs" | "requires" | "trigger"> &
  Partial<Pick<PloybookSpec, "prereqs" | "requires" | "trigger">>;

const template = (spec: TemplateInput): PloybookSpec => ({
  trigger: "manual",
  requires: [],
  prereqs: [],
  ...spec,
  source: "template",
});

// Map-node templates. Placeholder set; swap in Ploy's real Ploybook library.
export const templates: PloybookSpec[] = [
  // Site & Brand
  template({
    id: "homepage_refresh",
    name: "Rewrite your homepage hero",
    goal: "Make the first screen of your site say what you do, for whom, and what to do next.",
    region: "site_brand",
    steps: [
      t("scrape_site", "Read your current homepage"),
      p("brand_guidelines", "read", "Load your brand voice"),
      p("sites", "update_section", "Rewrite the hero section"),
      p("sites", "publish", "Publish the update"),
    ],
    estMinutes: 3,
  }),
  template({
    id: "landing_page_for_offer",
    name: "Launch a landing page for your top offer",
    goal: "A focused page for one offer, built to convert visitors into leads.",
    region: "site_brand",
    steps: [
      p("brand_guidelines", "read", "Load your brand"),
      p("sites", "create_page", "Build the page"),
      p("sites", "publish", "Publish it"),
    ],
    estMinutes: 5,
  }),
  template({
    id: "brand_kit",
    name: "Set up your brand kit",
    goal: "Capture your voice, colors, and messaging so everything Ploy makes stays on-brand.",
    region: "site_brand",
    steps: [
      t("scrape_site", "Pull colors, fonts, and tone from your site"),
      p("brand_guidelines", "update", "Save your brand guidelines"),
    ],
    estMinutes: 2,
  }),
  template({
    id: "custom_domain",
    name: "Connect your custom domain",
    goal: "Serve your Ploy pages from your own domain.",
    region: "site_brand",
    steps: [p("sites", "connect_domain", "Point your domain at Ploy")],
    prereqs: ["landing_page_for_offer"],
    estMinutes: 2,
  }),

  // Leads & Data
  template({
    id: "lead_list",
    name: "Build a target account list",
    goal: "A list of companies that match your best customers, ready for outreach.",
    region: "leads_data",
    steps: [
      t("research_company", "Find companies like your best customers"),
      p("ploydb", "create_table", "Create a Target Accounts table"),
      p("ploydb", "upsert_rows", "Add accounts with fit notes"),
    ],
    estMinutes: 4,
  }),
  template({
    id: "inbound_capture",
    name: "Capture site visitors as leads",
    goal: "Turn anonymous visitors into contacts you can follow up with.",
    region: "leads_data",
    trigger: "event",
    steps: [
      p("sites", "update_section", "Add a lead form to your site"),
      p("ploydb", "create_table", "Create a Leads table"),
      p("ploybooks", "create_ploybook", "Save every submission as a lead"),
    ],
    estMinutes: 4,
  }),
  template({
    id: "crm_sync",
    name: "Sync leads to your CRM",
    goal: "Keep your CRM up to date without copy-pasting.",
    region: "leads_data",
    trigger: "event",
    steps: [
      p("ploydb", "query", "Watch for new leads"),
      p("integrations", "sync_contacts", "Push them to your CRM"),
    ],
    requires: ["hubspot"],
    prereqs: ["lead_list"],
    estMinutes: 3,
  }),

  // Campaigns
  template({
    id: "cold_outbound",
    name: "Run a cold email sequence",
    goal: "Reach your target accounts with a personalized multi-step sequence.",
    region: "campaigns",
    trigger: "schedule",
    steps: [
      p("ploydb", "query", "Pick accounts from your list"),
      p("brand_guidelines", "read", "Write in your voice"),
      p("ploybooks", "create_ploybook", "Schedule a 3-step sequence"),
      p("integrations", "send_email", "Send from your inbox"),
    ],
    requires: ["gmail"],
    prereqs: ["lead_list"],
    estMinutes: 5,
  }),
  template({
    id: "lead_nurture",
    name: "Nurture new leads automatically",
    goal: "Follow up with every new lead so none go cold.",
    region: "campaigns",
    trigger: "event",
    steps: [
      p("ploybooks", "create_ploybook", "Trigger on every new lead"),
      p("integrations", "send_email", "Send a timed follow-up series"),
    ],
    requires: ["gmail"],
    estMinutes: 4,
  }),
  template({
    id: "linkedin_content",
    name: "Post on LinkedIn every week",
    goal: "Stay visible to buyers with consistent, on-brand posts.",
    region: "campaigns",
    trigger: "schedule",
    steps: [
      p("brand_guidelines", "read", "Load your voice and pillars"),
      p("docs", "create_doc", "Draft a month of posts"),
      p("ploybooks", "create_ploybook", "Schedule weekly publishing"),
      p("integrations", "post", "Post to LinkedIn"),
    ],
    requires: ["linkedin"],
    estMinutes: 4,
  }),
  template({
    id: "seo_articles",
    name: "Publish SEO articles monthly",
    goal: "Bring in search traffic with articles your buyers are looking for.",
    region: "campaigns",
    trigger: "schedule",
    steps: [
      t("research_company", "Find what your buyers search for"),
      p("docs", "create_doc", "Write the articles"),
      p("sites", "create_page", "Publish them to your site"),
      p("ploybooks", "create_ploybook", "Repeat every month"),
    ],
    estMinutes: 6,
  }),
  template({
    id: "paid_search",
    name: "Launch a Google Ads campaign",
    goal: "Show up when buyers search for what you sell.",
    region: "campaigns",
    steps: [
      p("ads", "create_audience", "Define who to target"),
      p("ads", "generate_creative", "Write ad variants"),
      p("ads", "create_campaign", "Launch with a daily budget"),
    ],
    requires: ["google_ads"],
    estMinutes: 5,
  }),
  template({
    id: "retargeting",
    name: "Retarget site visitors on Meta",
    goal: "Bring back visitors who left without converting.",
    region: "campaigns",
    steps: [
      p("ads", "create_audience", "Build a site-visitor audience"),
      p("ads", "generate_creative", "Write reminder ads"),
      p("ads", "create_campaign", "Launch the campaign"),
    ],
    requires: ["meta_ads"],
    estMinutes: 4,
  }),

  // Measure
  template({
    id: "site_dashboard",
    name: "Track site conversions",
    goal: "Know how many visitors become leads, and from where.",
    region: "measure",
    steps: [
      p("analytics", "track", "Track visits and sign-ups"),
      p("analytics", "create_dashboard", "Build a conversion dashboard"),
    ],
    requires: ["ga4"],
    estMinutes: 3,
  }),
  template({
    id: "weekly_report",
    name: "Get a weekly growth report",
    goal: "One email every Monday with what moved and what to do next.",
    region: "measure",
    trigger: "schedule",
    steps: [
      p("analytics", "create_report", "Pick the metrics that matter"),
      p("ploybooks", "create_ploybook", "Schedule it for Mondays"),
      p("integrations", "send_email", "Email it to you"),
    ],
    requires: ["ga4", "gmail"],
    estMinutes: 3,
  }),
  template({
    id: "channel_attribution",
    name: "See which channels bring customers",
    goal: "Double down on what works by tying customers back to channels.",
    region: "measure",
    steps: [
      p("analytics", "track", "Tag traffic by channel"),
      p("integrations", "sync_contacts", "Match leads to customers in your CRM"),
      p("analytics", "create_dashboard", "Build an attribution view"),
    ],
    requires: ["ga4", "hubspot"],
    estMinutes: 4,
  }),
];
