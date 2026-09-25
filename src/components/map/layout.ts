import type { RegionId } from "@/lib/catalog/regions";

// Hub-and-spoke layout sized to the panel: home base in the middle, one region
// per corner, and each region's tasks stepping outward toward it. Positions
// are fractions of the available reach, so the map fills whatever space it
// has; a task's slot fixes its place, so tasks never move once placed.

export type MapSize = { width: number; height: number };

/** Below this the map scrolls rather than squeezing tasks into home base. */
export const MIN_SIZE: MapSize = { width: 340, height: 560 };

/** Tasks show as cards when there's room, and as dots otherwise; each needs its own spacing. */
export type MapMode = "cards" | "dots";

const spacing: Record<
  MapMode,
  { margin: { x: number; y: number }; first: number; step: number; label: number; wobble: number }
> = {
  // Cards are ~212px wide: a wider side margin keeps the outermost inside the
  // panel, and a bigger step keeps two-line cards from touching.
  cards: { margin: { x: 120, y: 48 }, first: 0.36, step: 0.26, label: 1.04, wobble: 24 },
  dots: { margin: { x: 76, y: 48 }, first: 0.36, step: 0.22, label: 0.97, wobble: 18 },
};

const corners: Record<RegionId, { x: number; y: number }> = {
  site_brand: { x: -1, y: -1 },
  leads_data: { x: 1, y: -1 },
  campaigns: { x: 1, y: 1 },
  measure: { x: -1, y: 1 },
};

export const center = ({ width, height }: MapSize) => ({ x: width / 2, y: height / 2 });

function toward(size: MapSize, mode: MapMode, region: RegionId, fraction: number) {
  const c = center(size);
  const d = corners[region];
  const { margin } = spacing[mode];
  return {
    x: c.x + d.x * fraction * (size.width / 2 - margin.x),
    y: c.y + d.y * fraction * (size.height / 2 - margin.y),
  };
}

export function nodePosition(size: MapSize, mode: MapMode, region: RegionId, slot: number) {
  const { first, step, wobble } = spacing[mode];
  const p = toward(size, mode, region, first + slot * step);
  // Alternate sides, starting outward so neighbouring regions' first tasks don't touch.
  return { x: p.x + (slot % 2 === 0 ? wobble : -wobble) * corners[region].x, y: p.y };
}

export const labelPosition = (size: MapSize, mode: MapMode, region: RegionId) =>
  toward(size, mode, region, spacing[mode].label);
