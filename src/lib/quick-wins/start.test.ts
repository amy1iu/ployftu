import { describe, expect, it } from "vitest";
import type { Ploy, Workspace } from "@/lib/db/types";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import type { AnsweredSlot } from "@/lib/onboarding/trail";
import { confirmedProfile, profileWith } from "@/test/fixtures";
import { quickWinToStart } from "./start";

const entry = (overrides: Partial<Entry>): Entry => ({ ...emptyEntry, ...overrides });
const site: Entry["website"] = { status: "has", url: "https://acme.com" };
const outbound = entry({
  website: site,
  goals: { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: null, unmatched: null },
});
const unsure = entry({ website: site, goals: { status: "unsure", intents: [], inUserWords: null, unmatched: null } });
const workspace = (e: Entry) => ({ entry: e }) as Workspace;
const answered = (...slots: AnsweredSlot[]) => new Set(slots);

describe("quickWinToStart", () => {
  it("starts as soon as the goal is set when they've said who it's for", () => {
    expect(
      quickWinToStart({ workspace: workspace(outbound), docs: confirmedProfile("audience"), ploys: [], answered: answered("website", "goal_detail") }),
    ).toBe("outreach_sequence");
  });

  it("waits for who it's for from them, not just their site", () => {
    expect(quickWinToStart({ workspace: workspace(outbound), docs: profileWith("audience"), ploys: [], answered: answered("website", "goal_detail") })).toBeNull();
  });

  it("starts one that doesn't need an audience when they're not sure who", () => {
    expect(
      quickWinToStart({ workspace: workspace(outbound), docs: profileWith(), ploys: [], answered: answered("website", "goal_detail", "target_customer") }),
    ).toBe("homepage_audit");
  });

  it("never starts one built on nothing: no site, nothing about what they sell", () => {
    const noSite = entry({ website: { status: "none", url: null }, goals: { status: "unsure", intents: [], inUserWords: null, unmatched: null } });
    expect(quickWinToStart({ workspace: workspace(noSite), docs: profileWith(), ploys: [], answered: answered("website", "goal_detail") })).toBeNull();
    expect(quickWinToStart({ workspace: workspace(noSite), docs: profileWith("offering"), ploys: [], answered: answered("website", "goal_detail") })).toBe(
      "landing_page_draft",
    );
  });

  it("waits while nothing ready fits, even once they've said they're not sure who", () => {
    const leadsNoSite = entry({
      website: { status: "none", url: null },
      goals: { status: "has", intents: [{ id: "get_more_leads", weight: 1 }], inUserWords: null, unmatched: null },
    });
    const asked = answered("website", "goal_detail", "target_customer");
    expect(quickWinToStart({ workspace: workspace(leadsNoSite), docs: profileWith(), ploys: [], answered: asked })).toBeNull();
    expect(quickWinToStart({ workspace: workspace(leadsNoSite), docs: profileWith("offering"), ploys: [], answered: asked })).toBe("landing_page_draft");
  });

  it("starts a homepage audit right away for someone unsure of their goal", () => {
    expect(quickWinToStart({ workspace: workspace(unsure), docs: profileWith(), ploys: [], answered: answered("website", "goal_detail") })).toBe("homepage_audit");
  });

  it("never starts on their very first answer, even one that covers everything", () => {
    expect(quickWinToStart({ workspace: workspace(outbound), docs: confirmedProfile("audience"), ploys: [], answered: answered("website") })).toBeNull();
    expect(
      quickWinToStart({ workspace: workspace(outbound), docs: confirmedProfile("audience"), ploys: [], answered: answered("website", "current_acquisition") }),
    ).toBe("outreach_sequence");
  });

  it("waits until the goal is set", () => {
    expect(quickWinToStart({ workspace: workspace(entry({ website: site })), docs: profileWith("audience"), ploys: [], answered: answered() })).toBeNull();
  });

  it("only ever starts one (including one they picked themselves)", () => {
    const existing = { spec: { source: "quick_win" } } as Ploy;
    expect(
      quickWinToStart({ workspace: workspace(outbound), docs: confirmedProfile("audience"), ploys: [existing], answered: answered("website", "goal_detail") }),
    ).toBeNull();
  });
});
