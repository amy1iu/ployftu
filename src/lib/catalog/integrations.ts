// What a Ploybook needs connected, by capability rather than by product: a CRM
// can be HubSpot or Attio or anything else the user runs. `tools` are just the
// common picks shown first; users can connect any tool by name.
export const integrationCategories = {
  email: {
    name: "Email",
    need: "an email inbox",
    tools: ["Gmail", "Outlook"],
    scopes: ["Send email on your behalf", "Read replies to emails Ploy sends"],
  },
  crm: {
    name: "CRM",
    need: "a CRM",
    tools: ["HubSpot", "Salesforce", "Attio", "Pipedrive"],
    scopes: ["Read and create contacts and companies", "Log activity on deals"],
  },
  social: {
    name: "Social",
    need: "a social account",
    tools: ["LinkedIn", "Instagram", "X"],
    scopes: ["Publish posts to your profile or page", "Read post engagement"],
  },
  search_ads: {
    name: "Search ads",
    need: "a search ads account",
    tools: ["Google Ads", "Microsoft Ads"],
    scopes: ["Create and manage campaigns", "Read ad performance"],
  },
  social_ads: {
    name: "Social ads",
    need: "a social ads account",
    tools: ["Meta Ads", "LinkedIn Ads", "TikTok Ads"],
    scopes: ["Create and manage campaigns and audiences", "Read ad performance"],
  },
  analytics: {
    name: "Analytics",
    need: "web analytics",
    tools: ["Google Analytics", "Plausible", "Mixpanel"],
    scopes: ["Read traffic and conversion reports"],
  },
  store: {
    name: "Store",
    need: "an online store",
    tools: ["Shopify", "WooCommerce", "Square"],
    scopes: ["Read products, orders, and customers"],
  },
  team_chat: {
    name: "Team chat",
    need: "team chat",
    tools: ["Slack", "Microsoft Teams"],
    scopes: ["Post updates to a channel you choose"],
  },
} as const;

export type IntegrationCategory = keyof typeof integrationCategories;
export const integrationCategoryIds = Object.keys(integrationCategories) as [IntegrationCategory, ...IntegrationCategory[]];
