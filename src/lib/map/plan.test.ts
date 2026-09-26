import { describe, expect, it } from "vitest";
import { getSpec } from "@/lib/catalog";
import type { IntegrationCategory } from "@/lib/catalog/integrations";
import type { Integration, Workspace } from "@/lib/db/types";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import { profileWith } from "@/test/fixtures";
import { anchorFor, toolToAsk } from "./plan";

const site: Entry["website"] = { status: "has", url: "https://acme.com" };
const outbound: Entry["goals"] = { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: null, unmatched: null };
const workspace = { entry: { ...emptyEntry, website: site, goals: outbound }, crawl: null } as Workspace;
const known = profileWith("offering", "audience", "goal");
const ctx = { workspace, docs: known, integrations: [] as Integration[], toolCategory: null as IntegrationCategory | null, quickWinDone: false };
const anchor = (specId: string, overrides: Partial<typeof ctx> = {}) => anchorFor(getSpec(specId)!, { ...ctx, ...overrides });

describe("anchorFor", () => {
  it("hangs the first deliverable off its build", () => {
    expect(anchor("outreach_sequence")).toBe("build");
  });

  it("hangs a task beside the question whose answer it's waiting on", () => {
    expect(anchor("lead_list", { docs: profileWith("offering") })).toBe("followup");
    expect(anchor("cold_outbound", { toolCategory: "email" })).toBe("tool");
  });

  it("waits on their site, not a question, for what they sell", () => {
    expect(anchor("homepage_refresh", { docs: profileWith() })).toBe("site");
  });

  it("otherwise hangs a task off whatever revealed it", () => {
    expect(anchor("lead_list")).toBe("goal");
    expect(anchor("homepage_refresh")).toBe("site");
    expect(anchor("site_dashboard", { quickWinDone: true })).toBe("build");
  });
});

describe("toolToAsk", () => {
  const state = { workspace, ploys: [], mapNodes: [], integrations: [] as Integration[] };

  it("asks for the capability the most goal tasks need", () => {
    expect(toolToAsk(state)).toBe("email");
  });

  it("moves on once it's connected", () => {
    expect(toolToAsk({ ...state, integrations: [{ category: "email", provider: "Gmail" } as Integration] })).toBe("crm");
  });
});
