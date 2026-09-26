import { describe, expect, it } from "vitest";
import { getSpec } from "@/lib/catalog";
import type { Workspace } from "@/lib/db/types";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import { profileWith } from "@/test/fixtures";
import { anchorFor } from "./plan";

const site: Entry["website"] = { status: "has", url: "https://acme.com" };
const outbound: Entry["goals"] = { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: null, unmatched: null };
const workspace = { entry: { ...emptyEntry, website: site, goals: outbound }, crawl: null } as Workspace;
const known = profileWith("offering", "audience", "goal");
const ctx = { workspace, docs: known, quickWinDone: false };
const anchor = (specId: string, overrides: Partial<typeof ctx> = {}) => anchorFor(getSpec(specId)!, { ...ctx, ...overrides });

describe("anchorFor", () => {
  it("hangs the first deliverable off its build", () => {
    expect(anchor("outreach_sequence")).toBe("build");
  });

  it("hangs a task beside the question whose answer it's waiting on", () => {
    expect(anchor("lead_list", { docs: profileWith("offering") })).toBe("target_customer");
  });

  it("waits on their site, not a question, for what they sell", () => {
    expect(anchor("homepage_refresh", { docs: profileWith() })).toBe("site");
  });

  it("hangs a task waiting on what they sell beside that card when there's no site to read", () => {
    const noSite = { ...workspace, entry: { ...workspace.entry, website: { status: "none", url: null } } } as Workspace;
    expect(anchor("homepage_refresh", { workspace: noSite, docs: profileWith() })).toBe("business_model");
  });

  it("otherwise hangs a task off whatever revealed it", () => {
    expect(anchor("lead_list")).toBe("goal_detail");
    expect(anchor("homepage_refresh")).toBe("site");
    expect(anchor("site_dashboard", { quickWinDone: true })).toBe("build");
  });
});
