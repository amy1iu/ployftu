// Growth map check (phase 4): answers reveal and emphasize the right regions,
// levels get personalized, syncing is idempotent, and levels unlock and run.
//
//   npm run check:map

import { getSpec } from "@/lib/catalog";
import { connectIntegration, createWorkspace, getIntegrations, getMapNodes, getPloys } from "@/lib/db/workspaces";
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
try {
  await syncMap(workspace.id);
  check("Starts empty", (await getMapNodes(workspace.id)).length === 0);

  await applyEntryUpdate(workspace.id, { website: { status: "has", url: "acme-bakery.com" }, goals: null, business: null }, { userTurns: 1 });
  await syncMap(workspace.id);
  const afterSite = await getMapNodes(workspace.id);
  check("Answering the website question adds a Site & Brand level", afterSite.length === 1 && afterSite[0].region === "site_brand");

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

  await syncMap(workspace.id);
  check("Syncing again changes nothing", (await getMapNodes(workspace.id)).length === nodes.length);

  const ploys = await getPloys(workspace.id);
  const state = (spec: string, integrations: Awaited<ReturnType<typeof getIntegrations>> = []) =>
    nodeState(nodes.find((n) => n.spec_id === spec)!, { ploys, integrations, mapNodes: nodes });
  check("A level needing email starts locked", state("cold_outbound").lockReason === "Connect an email inbox");
  await connectIntegration(workspace.id, "email", "Outlook");
  const integrations = await getIntegrations(workspace.id);
  check("Connecting any email tool clears that lock", !state("cold_outbound", integrations).missing.length);

  const lead = nodes.find((n) => n.spec_id === "lead_list")!;
  const ploy = await startLevel(lead.id);
  await runLevel(ploy.id);
  const [finalNodes, finalPloys] = await Promise.all([getMapNodes(workspace.id), getPloys(workspace.id)]);
  const leadAfter = finalNodes.find((n) => n.id === lead.id)!;
  check("Starting a level links its ploy and it finishes", nodeState(leadAfter, { ploys: finalPloys, integrations, mapNodes: finalNodes }).state === "done");
  check(
    "Finishing a prerequisite unlocks what depends on it",
    nodeState(finalNodes.find((n) => n.spec_id === "cold_outbound")!, { ploys: finalPloys, integrations, mapNodes: finalNodes }).state === "available",
  );
} finally {
  await db().from("workspaces").delete().eq("id", workspace.id);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${failed ? `${failed} check(s) failed.` : "All map checks pass."}`);
process.exit(failed ? 1 : 0);
