import { generateText, Output } from "ai";
import { z } from "zod";
import { models } from "@/lib/ai/models";
import { getSpec, templates, type PloybookSpec } from "@/lib/catalog";
import { getIntent } from "@/lib/catalog/intents";
import type { RegionId } from "@/lib/catalog/regions";
import type { Doc, MapNode, Workspace } from "@/lib/db/types";
import { getDocs, getMapNodes, getPloys, getWorkspace, insertMapNodes } from "@/lib/db/workspaces";
import { mapFocus, regionSlots } from "./state";

/** Templates for a region, most relevant first: the user's goals, then what their site suggests, then the rest. */
function rankTemplates(region: RegionId, workspace: Workspace) {
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

const copySchema = z.object({
  levels: z.array(
    z.object({
      specId: z.string(),
      title: z.string().describe("Up to 7 words, specific to this business"),
      blurb: z.string().describe("One sentence: what this Ploybook does for them"),
      reason: z.string().describe("One sentence: why it's worth it for this business, citing their goal or profile"),
    }),
  ),
});

/** Titles and one-liners written for this business. Falls back to the catalog's own copy. */
async function personalize(specs: PloybookSpec[], workspace: Workspace, docs: Doc[]) {
  const fallback = new Map(specs.map((s) => [s.id, { title: s.name, blurb: s.goal, reason: null as string | null }]));
  try {
    const { output } = await generateText({
      model: models.chat,
      system: `You label levels on a small business's growth map in Ploy. For each Ploybook, write a short specific title, a one-sentence blurb, and a one-sentence reason it's worth it for them. Use their business and goal; don't invent facts or numbers.`,
      prompt: `Their goal: ${workspace.entry.goals.inUserWords ?? "not sure yet"}

${docs
  .filter((d) => d.kind === "profile")
  .map((d) => d.content_md)
  .join("\n\n")}

Ploybooks:
${specs.map((s) => `- ${s.id}: ${s.name}. ${s.goal}`).join("\n")}`,
      output: Output.object({ schema: copySchema }),
    });
    for (const { specId, title, blurb, reason } of output.levels)
      if (fallback.has(specId)) fallback.set(specId, { title, blurb, reason });
  } catch (error) {
    console.error("Failed to personalize map levels", error);
  }
  return fallback;
}

async function doSync(workspaceId: string) {
  const [workspace, docs, ploys, nodes] = await Promise.all([
    getWorkspace(workspaceId),
    getDocs(workspaceId),
    getPloys(workspaceId),
    getMapNodes(workspaceId),
  ]);
  const focus = mapFocus(workspace, ploys);
  const quickWin = ploys.find((p) => p.spec?.source === "quick_win");
  const quickWinDone = quickWin?.status === "done";
  const onMap = new Set(nodes.map((n) => n.spec_id));
  // Slots are for levels along a region's path; the first deliverable sits with home base instead.
  const slotsUsed = (region: string) =>
    nodes.filter((n) => n.region === region && getSpec(n.spec_id)?.source === "template").length;

  const added: Omit<MapNode, "id" | "revealed_at">[] = [];
  const add = (spec: PloybookSpec, ployId: string | null) => {
    added.push({
      workspace_id: workspaceId,
      spec_id: spec.id,
      region: spec.region,
      slot:
        spec.source === "quick_win"
          ? -1
          : slotsUsed(spec.region) + added.filter((a) => a.region === spec.region && a.slot >= 0).length,
      title: spec.name,
      blurb: spec.goal,
      reason: null,
      emphasized: focus.emphasized.includes(spec.region),
      ploy_id: ployId,
    });
    onMap.add(spec.id);
  };

  // The first deliverable is always on the map, lit up.
  if (quickWin?.spec && !onMap.has(quickWin.spec.id)) add(quickWin.spec, quickWin.id);
  for (const region of focus.revealed) {
    const templatesShown = nodes.filter((n) => n.region === region && getSpec(n.spec_id)?.source === "template").length;
    const wanted = regionSlots(region, focus, quickWinDone) - templatesShown;
    for (const spec of rankTemplates(region, workspace).filter((t) => !onMap.has(t.id)).slice(0, Math.max(0, wanted))) add(spec, null);
  }
  if (!added.length) return;

  const newTemplates = added.filter((a) => !a.ploy_id).map((a) => getSpec(a.spec_id)!);
  const copy = newTemplates.length ? await personalize(newTemplates, workspace, docs) : new Map();
  await insertMapNodes(added.map((a) => ({ ...a, ...(copy.get(a.spec_id) ?? {}) })));
}

// One sync at a time per workspace, and at most one waiting: a waiting sync
// reads fresh state when it runs, so extra requests can share it.
const running = new Map<string, Promise<void>>();
const waiting = new Map<string, Promise<void>>();

/**
 * Adds the levels the map should now show: revealed regions get their slots
 * filled with the most relevant Ploybooks, personalized for this business.
 * Never removes or moves levels. Call it whenever something that shapes the
 * map changes (answers, site, first deliverable).
 */
export function syncMap(workspaceId: string): Promise<void> {
  const queued = waiting.get(workspaceId);
  if (queued) return queued;
  const run = (running.get(workspaceId) ?? Promise.resolve())
    .then(() => {
      waiting.delete(workspaceId);
      return doSync(workspaceId);
    })
    .catch((error) => console.error("Failed to sync map", error))
    .finally(() => {
      if (running.get(workspaceId) === run) running.delete(workspaceId);
    });
  running.set(workspaceId, run);
  waiting.set(workspaceId, run);
  return run;
}
