import type { RegionId } from "@/lib/catalog/regions";

// Each region takes one of Ploy's pastel brand colors (ploy.ai), used for its
// glow on the map, its label tag, and its tasks' dots.
export const regionColors: Record<RegionId, string> = {
  site_brand: "var(--color-ploy-pink)",
  leads_data: "var(--color-ploy-lime)",
  campaigns: "var(--color-ploy-yellow)",
  measure: "var(--color-ploy-blue)",
};
