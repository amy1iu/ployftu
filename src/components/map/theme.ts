import type { RegionId } from "@/lib/catalog/regions";

// Each region takes one of Ploy's pastel brand colors (ploy.ai), softened for
// the trail: a pale tint behind its tasks and a dot on their tags.
export const regionTheme: Record<RegionId, { tint: string; dot: string }> = {
  site_brand: { tint: "var(--color-region-site)", dot: "var(--color-region-site-dot)" },
  leads_data: { tint: "var(--color-region-leads)", dot: "var(--color-region-leads-dot)" },
  campaigns: { tint: "var(--color-region-campaigns)", dot: "var(--color-region-campaigns-dot)" },
  measure: { tint: "var(--color-region-measure)", dot: "var(--color-region-measure-dot)" },
};
