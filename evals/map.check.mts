// Growth map check: answers reveal and emphasize the right regions, levels get
// personalized and hang off the right trail question, syncing is idempotent,
// and levels unlock (with context and tools) and run.
//
//   npm run check:map

import { getSpec } from "@/lib/catalog";
import { connectIntegration, createWorkspace, getDocs, getIntegrations, getMapNodes, getPloys, patchProfileSections } from "@/lib/db/workspaces";
import { runLevel, startLevel } from "@/lib/map/levels";
import { nodeState } from "@/lib/map/state";
import { syncMap } from "@/lib/map/sync";
import { applyEntryUpdate } from "@/lib/onboarding/set-entry";
import { db } from "@/lib/supabase/admin";

const results: boolean[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push(pass);
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
};

const workspace = await createWorkspace({ isEval: true });
const second = await createWorkspace({ isEval: true });
try {
  await syncMap(workspace.id);
  check("Starts empty", (await getMapNodes(workspace.id)).length === 0);

  await applyEntryUpdate(workspace.id, { website: { status: "has", url: "acme-bakery.com" }, goals: null, business: null }, { userTurns: 1 });
  await syncMap(workspace.id);
  const afterSite = await getMapNodes(workspace.id);
  check("Answering the website question adds a Site & Brand level", afterSite.length === 1 && afterSite[0].region === "site_brand");
  check("It hangs off the site read on the trail", afterSite[0].anchor === "site", afterSite[0].anchor ?? "none");

  await applyEntryUpdate(
    workspace.id,
    {
      website: null,
      goals: { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: "cold email cafes", unmatched: null },
      business: { whatTheyDo: "A wholesale bakery supplying cafes", whoTheyServe: "Independent cafes" },
    },
    { userTurns: 2 },
  );
  await Promise.all([syncMap(workspace.id), syncMap(workspace.id)]); // concurrent calls share one sync
  const nodes = await getMapNodes(workspace.id);
  const count = (region: string) => nodes.filter((n) => n.region === region).length;
  check(
    "A goal fills its emphasized regions with 3 levels each",
    count("leads_data") === 3 && count("campaigns") === 3,
    `leads ${count("leads_data")}, campaigns ${count("campaigns")}, site ${count("site_brand")}, measure ${count("measure")}`,
  );
  check("Unrelated regions stay in the fog", count("measure") === 0);
  check("Levels are ordered by the goal's Ploybooks", nodes.find((n) => n.region === "campaigns" && n.slot === 0)?.spec_id === "cold_outbound");
  check(
    "Levels are personalized",
    nodes.filter((n) => n.title !== getSpec(n.spec_id)?.name && n.reason).length >= nodes.length - 1,
    nodes.map((n) => n.title).join(" | "),
  );
  check("Slots are unique per region", new Set(nodes.map((n) => `${n.region}/${n.slot}`)).size === nodes.length);
  const anchorOf = (spec: string) => nodes.find((n) => n.spec_id === spec)?.anchor;
  check("Goal tasks hang off the goal", anchorOf("lead_list") === "goal", anchorOf("lead_list") ?? "none");
  check("Tasks waiting on the tool the trail asks about hang off that question", anchorOf("cold_outbound") === "tool", anchorOf("cold_outbound") ?? "none");

  await syncMap(workspace.id);
  check("Syncing again changes nothing", (await getMapNodes(workspace.id)).length === nodes.length);

  const [ploys, docs] = await Promise.all([getPloys(workspace.id), getDocs(workspace.id)]);
  const state = (spec: string, integrations: Awaited<ReturnType<typeof getIntegrations>> = []) =>
    nodeState(nodes.find((n) => n.spec_id === spec)!, { ploys, integrations, mapNodes: nodes, docs });
  check("A level needing email starts locked", state("cold_outbound").lockReason === "Connect an email inbox");
  await connectIntegration(workspace.id, "email", "Outlook");
  const integrations = await getIntegrations(workspace.id);
  check("Connecting any email tool clears that lock", !state("cold_outbound", integrations).missing.length);

  const lead = nodes.find((n) => n.spec_id === "lead_list")!;
  const ploy = await startLevel(lead.id);
  await runLevel(ploy.id);
  const [finalNodes, finalPloys] = await Promise.all([getMapNodes(workspace.id), getPloys(workspace.id)]);
  const leadAfter = finalNodes.find((n) => n.id === lead.id)!;
  check("Starting a level links its ploy and it finishes", nodeState(leadAfter, { ploys: finalPloys, integrations, mapNodes: finalNodes, docs }).state === "done");
  check(
    "Finishing a prerequisite unlocks what depends on it",
    nodeState(finalNodes.find((n) => n.spec_id === "cold_outbound")!, { ploys: finalPloys, integrations, mapNodes: finalNodes, docs }).state === "available",
  );

  // Without knowing who they sell to, audience tasks wait on the follow-up question.
  await applyEntryUpdate(
    second.id,
    {
      website: { status: "none", url: null },
      goals: { status: "has", intents: [{ id: "get_more_leads", weight: 1 }], inUserWords: null, unmatched: null },
      business: { whatTheyDo: "Bookkeeping for restaurants", whoTheyServe: null },
    },
    { userTurns: 2 },
  );
  await syncMap(second.id);
  const secondNodes = await getMapNodes(second.id);
  const list = secondNodes.find((n) => n.spec_id === "lead_list")!;
  check("A task needing who they sell to hangs off the follow-up", list?.anchor === "followup", list?.anchor ?? "missing");
  const secondState = async () =>
    nodeState(list, { ploys: [], integrations: [], mapNodes: secondNodes, docs: await getDocs(second.id) });
  check("…and is locked until they answer it", (await secondState()).lockReason === "Needs who you sell to");
  await patchProfileSections(second.id, [
    { slug: "business-overview", key: "who-we-serve", body: "Independent restaurants", status: "confirmed", source: "user" },
  ]);
  check("Answering it unlocks the task", (await secondState()).state === "available");
} finally {
  await db().from("workspaces").delete().in("id", [workspace.id, second.id]);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${failed ? `${failed} check(s) failed.` : "All map checks pass."}`);
process.exit(failed ? 1 : 0);
