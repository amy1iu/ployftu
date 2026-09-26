import type { PrimitiveId } from "./primitives";
import type { QuickWinId } from "./quick-wins";
import type { RegionId } from "./regions";

// How users describe what they want, mapped to what Ploy can do about it.
// Drives the goal chips, the map's emphasis, and the default quick win.
export type Intent = {
  id: string;
  label: string;
  examples: string[];
  regions: Partial<Record<RegionId, number>>;
  primitives: PrimitiveId[];
  templates: string[];
  quickWin: QuickWinId;
  probes: string[];
  /** The one follow-up on the trail when we don't know who they sell to yet. */
  audienceQuestion: string;
};

export const intents = [
  {
    id: "get_more_leads",
    label: "Get more leads",
    examples: ["more leads", "fill the pipeline", "more demo requests", "grow sales", "more customers"],
    regions: { leads_data: 1, campaigns: 0.6, site_brand: 0.4 },
    primitives: ["ploydb", "ploybooks", "integrations", "sites"],
    templates: ["lead_list", "inbound_capture", "cold_outbound"],
    quickWin: "lookalike_accounts",
    probes: ["Who are your best customers today?", "Where do most of your leads come from right now?"],
    audienceQuestion: "Who are your best customers today?",
  },
  {
    id: "convert_site_visitors",
    label: "Convert more site visitors",
    examples: ["people visit but don't sign up", "low conversion", "better website", "clearer messaging"],
    regions: { site_brand: 1, measure: 0.5, leads_data: 0.4 },
    primitives: ["sites", "brand_guidelines", "analytics"],
    templates: ["homepage_refresh", "inbound_capture", "site_dashboard"],
    quickWin: "homepage_audit",
    probes: ["What do you want a visitor to do first: book a call, sign up, or buy?", "Roughly how much traffic does your site get?"],
    audienceQuestion: "Who do you most want visiting your site?",
  },
  {
    id: "run_outbound",
    label: "Run outbound outreach",
    examples: ["cold email", "outbound", "reach out to prospects", "prospecting", "sales outreach"],
    regions: { campaigns: 1, leads_data: 0.8 },
    primitives: ["ploybooks", "integrations", "ploydb"],
    templates: ["cold_outbound", "lead_list", "crm_sync"],
    quickWin: "outreach_sequence",
    probes: ["Who's your ideal buyer (role and company type)?", "How are you doing outreach today, if at all?"],
    audienceQuestion: "Who do you most want to reach out to?",
  },
  {
    id: "launch_paid_ads",
    label: "Launch paid ads",
    examples: ["google ads", "facebook ads", "paid acquisition", "run ads", "ppc"],
    regions: { campaigns: 1, measure: 0.5, site_brand: 0.4 },
    primitives: ["ads", "sites", "analytics"],
    templates: ["paid_search", "retargeting", "landing_page_for_offer"],
    quickWin: "landing_page_draft",
    probes: ["Have you run ads before, and on which platforms?", "Is there a monthly budget you have in mind?"],
    audienceQuestion: "Who should your ads reach?",
  },
  {
    id: "nurture_pipeline",
    label: "Convert the pipeline I have",
    examples: ["follow up", "leads go cold", "nurture", "close more deals", "existing pipeline"],
    regions: { campaigns: 1, leads_data: 0.7, measure: 0.3 },
    primitives: ["ploybooks", "integrations", "ploydb"],
    templates: ["lead_nurture", "crm_sync", "weekly_report"],
    quickWin: "outreach_sequence",
    probes: ["Where do your leads live today (CRM, spreadsheet, inbox)?", "What usually happens after someone first shows interest?"],
    audienceQuestion: "Who are the leads you most want to close?",
  },
  {
    id: "grow_content_brand",
    label: "Build my brand with content",
    examples: ["linkedin", "social media", "content marketing", "thought leadership", "seo", "blog", "awareness"],
    regions: { campaigns: 1, site_brand: 0.7 },
    primitives: ["docs", "brand_guidelines", "ploybooks", "integrations", "sites"],
    templates: ["linkedin_content", "seo_articles", "brand_kit"],
    quickWin: "social_posts",
    probes: ["Which channels matter most for your audience?", "How often are you publishing today?"],
    audienceQuestion: "Who do you most want your content to reach?",
  },
  {
    id: "measure_performance",
    label: "Know what's working",
    examples: ["analytics", "reporting", "attribution", "which channels work", "track results"],
    regions: { measure: 1, leads_data: 0.3 },
    primitives: ["analytics", "integrations"],
    templates: ["site_dashboard", "weekly_report", "channel_attribution"],
    quickWin: "homepage_audit",
    probes: ["What numbers do you check today, if any?", "Which tools hold your data (analytics, CRM)?"],
    audienceQuestion: "Who are the customers you most want more of?",
  },
  {
    id: "automate_busywork",
    label: "Automate repetitive marketing work",
    examples: ["save time", "automate", "too much manual work", "copy pasting", "busywork"],
    regions: { campaigns: 0.8, leads_data: 0.8, measure: 0.4 },
    primitives: ["ploybooks", "integrations", "ploydb"],
    templates: ["crm_sync", "lead_nurture", "weekly_report"],
    quickWin: "outreach_sequence",
    probes: ["What's the most repetitive thing you do each week?", "Which tools do you jump between most?"],
    audienceQuestion: "Who are the customers you spend the most time on?",
  },
] as const satisfies readonly Intent[];

export type IntentId = (typeof intents)[number]["id"];
export const intentIds = intents.map((i) => i.id) as [IntentId, ...IntentId[]];
export const getIntent = (id: IntentId) => intents.find((i) => i.id === id)!;
