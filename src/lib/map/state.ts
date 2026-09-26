import { getIntent } from "@/lib/catalog/intents";
import { getSpec } from "@/lib/catalog";
import { contextKeys, type ContextKey } from "@/lib/catalog/context";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { regionIds, type RegionId } from "@/lib/catalog/regions";
import type { Doc, Integration, MapNode, Ploy, Workspace } from "@/lib/db/types";
import { hasContext } from "@/lib/docs/profile";
import { entryBranch } from "@/lib/onboarding/entry";

// The growth map's rules, shared by the server (which nodes exist) and the
// client (how they look). Everything here is derived, never stored, so the map
// can't drift from the ploys and integrations it reflects.

export type MapFocus = {
  /** Regions out of the fog. */
  revealed: RegionId[];
  /** Regions the user's goals point at: more levels, drawn larger. */
  emphasized: RegionId[];
};

const EMPHASIS = 0.7;

/**
 * Which regions show, and which are emphasized. Every entry answer lifts some
 * fog; finishing the first deliverable (once the goal is known) lifts the rest.
 */
export function mapFocus(workspace: Workspace, ploys: Ploy[]): MapFocus {
  const { entry, crawl } = workspace;
  if (entry.website.status === "unknown" && entry.goals.status === "unknown") return { revealed: [], emphasized: [] };

  const weights = new Map<RegionId, number>();
  const weigh = (region: RegionId, weight: number) => weights.set(region, Math.max(weights.get(region) ?? 0, weight));

  if (entry.website.status !== "unknown") weigh("site_brand", entry.website.status === "has" ? 0.5 : 0.8);
  if (entry.goals.status === "has") {
    for (const { id } of entry.goals.intents)
      for (const [region, weight] of Object.entries(getIntent(id).regions)) weigh(region as RegionId, weight);
  }
  const branch = entryBranch(entry);
  if (branch === "B") {
    for (const { intent } of crawl?.opportunities ?? [])
      for (const [region, weight] of Object.entries(getIntent(intent).regions)) weigh(region as RegionId, weight);
    weigh("site_brand", 1);
  }
  if (branch === "C") weigh("site_brand", EMPHASIS);
  if (branch === "D") {
    weigh("site_brand", 1);
    weigh("leads_data", EMPHASIS);
  }

  // The rest of the fog lifts once the first deliverable is done and they've
  // given a goal, so answering the goal question still fills the map.
  const quickWinDone = ploys.some((p) => p.spec?.source === "quick_win" && p.status === "done");
  const emphasized = regionIds.filter((r) => (weights.get(r) ?? 0) >= EMPHASIS);
  const revealed =
    quickWinDone && entry.goals.status !== "unknown" ? [...regionIds] : regionIds.filter((r) => weights.has(r));
  return { revealed, emphasized };
}

/** How many levels a region shows: more where the user's goals point, more once the fog lifts. */
export function regionSlots(region: RegionId, focus: MapFocus, quickWinDone: boolean) {
  if (!focus.revealed.includes(region)) return 0;
  if (focus.emphasized.includes(region)) return 3;
  return quickWinDone ? 2 : 1;
}

export type NodeState = {
  state: "locked" | "available" | "running" | "done" | "live";
  /** Why it's locked, e.g. "Connect a CRM". */
  lockReason: string | null;
  /** Capabilities to connect (any tool that provides them) before it can start. */
  missing: IntegrationCategory[];
  /** Business context it's waiting on (e.g. who they sell to); an answer on the trail unlocks it. */
  missingContext: ContextKey[];
};

export function nodeState(
  node: MapNode,
  {
    ploys,
    integrations,
    mapNodes,
    docs,
  }: { ploys: Ploy[]; integrations: Integration[]; mapNodes: MapNode[]; docs: Pick<Doc, "slug" | "sections">[] },
): NodeState {
  const ploy = node.ploy_id ? ploys.find((p) => p.id === node.ploy_id) : undefined;
  if (ploy && ploy.status !== "idle") return { state: ploy.status, lockReason: null, missing: [], missingContext: [] };

  const spec = getSpec(node.spec_id);
  const missingContext = (spec?.needsContext ?? []).filter((key) => !hasContext(docs, key));
  if (missingContext.length)
    return {
      state: "locked",
      lockReason: `Needs ${missingContext.map((k) => contextKeys[k].need).join(" and ")}`,
      missing: [],
      missingContext,
    };

  const missing = (spec?.requires ?? []).filter((c) => !integrations.some((i) => i.category === c));
  if (missing.length)
    return {
      state: "locked",
      lockReason: `Connect ${missing.map((c) => integrationCategories[c].need).join(" and ")}`,
      missing,
      missingContext: [],
    };

  const unfinished = (spec?.prereqs ?? []).find((prereq) => {
    const prereqNode = mapNodes.find((n) => n.spec_id === prereq);
    const prereqPloy = prereqNode?.ploy_id ? ploys.find((p) => p.id === prereqNode.ploy_id) : undefined;
    return !prereqPloy || (prereqPloy.status !== "done" && prereqPloy.status !== "live");
  });
  if (unfinished)
    return { state: "locked", lockReason: `Finish "${getSpec(unfinished)?.name}" first`, missing: [], missingContext: [] };

  return { state: "available", lockReason: null, missing: [], missingContext: [] };
}
