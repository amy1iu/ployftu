import { describe, expect, it } from "vitest";
import type { Integration, MapNode, Ploy, Workspace } from "@/lib/db/types";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import { profileWith } from "@/test/fixtures";
import { mapFocus, nodeState, regionSlots } from "./state";

const workspace = (entry: Partial<Entry>, crawl: Workspace["crawl"] = null) =>
  ({ entry: { ...emptyEntry, ...entry }, crawl }) as Workspace;
const site: Entry["website"] = { status: "has", url: "https://acme.com" };
const goal = (id: "run_outbound" | "measure_performance"): Entry["goals"] => ({
  status: "has",
  intents: [{ id, weight: 1 }],
  inUserWords: null,
  unmatched: null,
});
const unsure: Entry["goals"] = { status: "unsure", intents: [], inUserWords: null, unmatched: null };

describe("mapFocus", () => {
  it("starts fully fogged", () => {
    expect(mapFocus(workspace({}), [])).toEqual({ revealed: [], emphasized: [] });
  });

  it("lifts Site & Brand once they answer the website question", () => {
    expect(mapFocus(workspace({ website: site }), []).revealed).toEqual(["site_brand"]);
  });

  it("emphasizes the regions their goal points at", () => {
    const focus = mapFocus(workspace({ website: site, goals: goal("run_outbound") }), []);
    expect(focus.emphasized).toEqual(["leads_data", "campaigns"]);
    expect(focus.revealed).toEqual(["site_brand", "leads_data", "campaigns"]);
  });

  it("on path B, follows the opportunities spotted on their site", () => {
    const crawl = { opportunities: [{ intent: "measure_performance", title: "", why: "" }] } as unknown as Workspace["crawl"];
    const focus = mapFocus(workspace({ website: site, goals: unsure }, crawl), []);
    expect(focus.emphasized).toEqual(["site_brand", "measure"]);
  });

  it("on path D, starts with a site and a customer list", () => {
    const focus = mapFocus(workspace({ website: { status: "none", url: null }, goals: unsure }), []);
    expect(focus.emphasized).toEqual(["site_brand", "leads_data"]);
  });

  it("lifts all the fog once the first deliverable is done and the goal is known", () => {
    const done = { spec: { source: "quick_win" }, status: "done" } as Ploy;
    expect(mapFocus(workspace({ website: site, goals: goal("run_outbound") }), [done]).revealed).toHaveLength(4);
    expect(mapFocus(workspace({ website: site }), [done]).revealed).toEqual(["site_brand"]);
  });
});

it("gives emphasized regions more levels", () => {
  expect(regionSlots("campaigns", { revealed: ["site_brand", "campaigns"], emphasized: ["campaigns"] }, false)).toBe(3);
  expect(regionSlots("site_brand", { revealed: ["site_brand"], emphasized: [] }, false)).toBe(1);
  expect(regionSlots("site_brand", { revealed: ["site_brand"], emphasized: [] }, true)).toBe(2);
  expect(regionSlots("measure", { revealed: [], emphasized: [] }, true)).toBe(0);
});

describe("nodeState", () => {
  const node = (spec_id: string, ploy_id: string | null = null) => ({ spec_id, ploy_id }) as MapNode;
  const ploy = (id: string, status: Ploy["status"]) => ({ id, status }) as Ploy;
  const none = { ploys: [], integrations: [], mapNodes: [], docs: profileWith("offering", "audience", "goal") };

  it("follows its ploy", () => {
    expect(nodeState(node("lead_list", "p1"), { ...none, ploys: [ploy("p1", "running")] }).state).toBe("running");
    expect(nodeState(node("lead_list", "p1"), { ...none, ploys: [ploy("p1", "done")] }).state).toBe("done");
  });

  it("is locked until any tool providing what it needs is connected", () => {
    expect(nodeState(node("lead_nurture"), none)).toMatchObject({
      state: "locked",
      lockReason: "Connect an email inbox",
      missing: ["email"],
    });
    const outlook = [{ provider: "Outlook", category: "email" } as Integration];
    expect(nodeState(node("lead_nurture"), { ...none, integrations: outlook }).state).toBe("available");
  });

  it("is locked until the business context it needs is known", () => {
    expect(nodeState(node("lead_list"), { ...none, docs: profileWith("offering") })).toMatchObject({
      state: "locked",
      lockReason: "Needs who you sell to",
      missingContext: ["audience"],
    });
    expect(nodeState(node("lead_list"), none).state).toBe("available");
  });

  it("asks for context before tools", () => {
    expect(nodeState(node("cold_outbound"), { ...none, docs: profileWith() }).missingContext).toEqual(["audience"]);
  });

  it("is locked until its prerequisite is done", () => {
    const hubspot = [{ provider: "Attio", category: "crm" } as Integration];
    expect(nodeState(node("crm_sync"), { ...none, integrations: hubspot }).lockReason).toBe(
      'Finish "Build a target account list" first',
    );
    const prereq = { ...none, mapNodes: [node("lead_list", "p1")], ploys: [ploy("p1", "done")] };
    expect(nodeState(node("crm_sync"), { ...prereq, integrations: hubspot }).state).toBe("available");
  });
});
