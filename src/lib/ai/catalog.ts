// Placeholder catalog. Replace with your real products/workflows, or move it
// into the `products` table in Supabase and query it from the tool.
export const catalog = [
  {
    id: "quickstart",
    name: "Quickstart workflow",
    description: "A guided setup that gets a new user to a first result in minutes.",
    goodFor: ["new users", "exploring", "small teams"],
  },
  {
    id: "automations",
    name: "Automations",
    description: "Trigger-based workflows that run repetitive tasks automatically.",
    goodFor: ["repetitive tasks", "operations", "scaling"],
  },
  {
    id: "analytics",
    name: "Analytics dashboard",
    description: "Reports and charts for tracking key metrics over time.",
    goodFor: ["reporting", "data-driven teams", "managers"],
  },
] as const;

export type CatalogItem = (typeof catalog)[number];
