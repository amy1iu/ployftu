// Outcome regions of the growth map. Each groups the primitives that deliver it.
export const regions = [
  {
    id: "site_brand",
    name: "Site & Brand",
    description: "A clear, on-brand website that turns visitors into leads.",
    primitives: ["sites", "brand_guidelines", "docs"],
  },
  {
    id: "leads_data",
    name: "Leads & Data",
    description: "Know who to target and keep every contact organized.",
    primitives: ["ploydb", "integrations"],
  },
  {
    id: "campaigns",
    name: "Campaigns",
    description: "Outreach, ads, and content that run on their own.",
    primitives: ["ploybooks", "ads", "integrations"],
  },
  {
    id: "measure",
    name: "Measure",
    description: "See what's working and where to double down.",
    primitives: ["analytics"],
  },
] as const;

export type RegionId = (typeof regions)[number]["id"];
export const regionIds = regions.map((r) => r.id) as [RegionId, ...RegionId[]];
