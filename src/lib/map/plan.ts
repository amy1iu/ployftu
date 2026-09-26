import { getIntent } from "@/lib/catalog/intents";
import { integrationCategoryIds, type IntegrationCategory } from "@/lib/catalog/integrations";
import { getSpec, templates, type PloybookSpec } from "@/lib/catalog";
import { contextKeys, type ContextItemId } from "@/lib/catalog/context";
import type { RegionId } from "@/lib/catalog/regions";
import type { Doc, Integration, MapNode, Ploy, Workspace } from "@/lib/db/types";
import { hasContext } from "@/lib/docs/profile";
import { mapFocus, regionSlots } from "./state";

// Which tasks the map will show, and where each sits on the Getting Started
// trail. Pure, so the trail can plan its questions around tasks that haven't
// been written to the map yet.

/** Templates for a region, most relevant first: the user's goals, then what their site suggests, then the rest. */
export function rankTemplates(region: RegionId, workspace: Workspace) {
  const preferred: string[] = [
    ...workspace.entry.goals.intents.flatMap(({ id }) => getIntent(id).templates),
    ...(workspace.crawl?.opportunities ?? []).flatMap(({ intent }) => getIntent(intent).templates),
  ];
  const rank = (spec: PloybookSpec) => {
    const i = preferred.indexOf(spec.id);
    return i === -1 ? preferred.length + templates.indexOf(spec) : i;
  };
  return templates.filter((t) => t.region === region).sort((a, b) => rank(a) - rank(b));
}

const isTemplate = (specId: string) => getSpec(specId)?.source === "template";

/** The templates the map should add now, beyond what's already on it (what syncMap writes). */
export function plannedTemplates(workspace: Workspace, ploys: Ploy[], nodes: Pick<MapNode, "spec_id" | "region">[]) {
  const focus = mapFocus(workspace, ploys);
  const quickWinDone = ploys.some((p) => p.spec?.source === "quick_win" && p.status === "done");
  const onMap = new Set(nodes.map((n) => n.spec_id));
  return focus.revealed.flatMap((region) => {
    const shown = nodes.filter((n) => n.region === region && isTemplate(n.spec_id)).length;
    const wanted = regionSlots(region, focus, quickWinDone) - shown;
    return rankTemplates(region, workspace)
      .filter((t) => !onMap.has(t.id))
      .slice(0, Math.max(0, wanted));
  });
}

/**
 * The tool worth asking about during onboarding: the capability that the most
 * tasks on the map (or about to be) are waiting on, goal regions counting double.
 */
export function toolToAsk({
  workspace,
  ploys,
  mapNodes,
  integrations,
}: {
  workspace: Workspace;
  ploys: Ploy[];
  mapNodes: MapNode[];
  integrations: Integration[];
}): IntegrationCategory | null {
  const focus = mapFocus(workspace, ploys);
  const specs = [
    ...mapNodes.filter((n) => isTemplate(n.spec_id)).map((n) => getSpec(n.spec_id)!),
    ...plannedTemplates(workspace, ploys, mapNodes),
  ];
  const connected = new Set(integrations.map((i) => i.category));
  const score = new Map<IntegrationCategory, number>();
  for (const spec of specs)
    for (const category of spec.requires)
      if (!connected.has(category))
        score.set(category, (score.get(category) ?? 0) + (focus.emphasized.includes(spec.region) ? 2 : 1));
  return integrationCategoryIds.filter((c) => score.has(c)).sort((a, b) => score.get(b)! - score.get(a)!)[0] ?? null;
}

/**
 * Where a task hangs on the trail: beside the question for the registry item
 * whose answer it's waiting on, otherwise beside the one that revealed it.
 * - site: the website (or the site-read node)
 * - a registry item (business_model, target_customer, tool…): that item's question
 * - goal_detail: wherever they answered the goal question (the fallback for goal-driven tasks)
 * - build: the first deliverable, and everything revealed once it's done
 */
export type Anchor = "site" | "build" | Exclude<ContextItemId, "website" | "quick_win_offer">;

export function anchorFor(
  spec: PloybookSpec,
  {
    workspace,
    docs,
    integrations,
    toolCategory,
    quickWinDone,
  }: {
    workspace: Workspace;
    docs: Pick<Doc, "slug" | "sections">[];
    integrations: Integration[];
    /** The tool the trail will ask about, if it hasn't yet. */
    toolCategory: IntegrationCategory | null;
    quickWinDone: boolean;
  },
): Anchor {
  if (spec.source === "quick_win") return "build";
  const { entry, crawl } = workspace;
  const [waitingOn] = spec.needsContext.filter((key) => !hasContext(docs, key));
  // Reading their site will fill in what they sell.
  if (waitingOn === "offering" && entry.website.status === "has") return "site";
  if (waitingOn) return contextKeys[waitingOn].item;
  if (toolCategory && spec.requires.includes(toolCategory) && !integrations.some((i) => i.category === toolCategory))
    return "tool";

  const goalRegions = entry.goals.intents.flatMap(({ id }) => Object.keys(getIntent(id).regions));
  const siteRegions = entry.goals.status === "unsure" ? (crawl?.opportunities ?? []).flatMap(({ intent }) => Object.keys(getIntent(intent).regions)) : [];
  if (goalRegions.includes(spec.region) || siteRegions.includes(spec.region)) return "goal_detail";
  if (spec.region === "site_brand") return "site";
  return quickWinDone ? "build" : "goal_detail";
}
