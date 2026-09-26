import { describe, expect, it } from "vitest";
import type { Integration, Ploy, Workspace } from "@/lib/db/types";
import { confirmedProfile, profileWith } from "@/test/fixtures";
import { emptyEntry, type Entry } from "./entry";
import { nextQuestion, type AnsweredSlot, type TrailState } from "./trail";

const site: Entry["website"] = { status: "has", url: "https://acme.com" };
const outbound: Entry["goals"] = { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: null, unmatched: null };
const workspace = (entry: Partial<Entry>, crawl: Partial<NonNullable<Workspace["crawl"]>> | null = null) =>
  ({ entry: { ...emptyEntry, ...entry }, crawl: crawl && { opportunities: [], ...crawl } }) as Workspace;
const quickWin = { spec: { source: "quick_win" }, status: "running" } as Ploy;

const state = (overrides: Partial<TrailState> & { answered?: Set<AnsweredSlot> }): TrailState => ({
  workspace: workspace({}),
  docs: profileWith(),
  ploys: [],
  mapNodes: [],
  integrations: [],
  answered: new Set(),
  ...overrides,
});

describe("nextQuestion", () => {
  it("starts with their website", () => {
    expect(nextQuestion(state({}))?.slot).toBe("website");
  });

  it("asks what they sell when there's no site to read", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: { status: "none", url: null } }) }));
    expect(q).toMatchObject({ slot: "sell", hint: null });
  });

  it("explains when their site couldn't be read", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: { status: "unreadable", url: "https://acme.com" } }) }));
    expect(q?.slot).toBe("sell");
    expect(q?.hint).toMatch(/couldn't read/);
  });

  it("forks into a goal or a quick win once it knows the business", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site }) }));
    expect(q?.slot).toBe("fork");
    expect(q?.chips?.at(-1)).toEqual({ label: "Not sure yet", value: "unsure" });
    expect(q?.alt?.chips.map((c) => c.value)).toEqual(["homepage_audit", "outreach_sequence", "lookalike_accounts"]);
  });

  it("offers a landing page instead of a homepage audit without a site", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: { status: "none", url: null } }), docs: profileWith("offering") }));
    expect(q?.alt?.chips[0].value).toBe("landing_page_draft");
    expect(q?.alt?.chips.map((c) => c.value)).not.toContain("homepage_audit");
  });

  it("suggests the goals their site points at first", () => {
    const q = nextQuestion(
      state({ workspace: workspace({ website: site }, { opportunities: [{ intent: "launch_paid_ads", title: "", why: "" }] }) }),
    );
    expect(q?.chips?.[0].value).toBe("launch_paid_ads");
  });

  it("still asks the goal after they pick a quick win", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site }), ploys: [quickWin], answered: new Set(["quick_win"]) }));
    expect(q?.slot).toBe("goal");
    expect(q?.question).toMatch(/^While that builds/);
  });

  it("asks who they sell to, in the model's words, when it isn't known", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site, goals: outbound }) }));
    expect(q).toMatchObject({ slot: "followup", question: null, chips: null });
    expect(q?.guide).toContain("Who do you most want to reach out to?");
  });

  it("still asks who they want to reach when only their site says who buys", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site, goals: outbound }), docs: profileWith("offering", "audience") }));
    expect(q?.slot).toBe("followup");
  });

  it("skips the follow-up when they've already said who they want to reach", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site, goals: outbound }), docs: confirmedProfile("offering", "audience") }));
    expect(q?.slot).toBe("tool");
  });

  it("asks for the tool the most tasks need", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site, goals: outbound }), docs: confirmedProfile("offering", "audience") }));
    expect(q).toMatchObject({ slot: "tool", category: "email" });
    expect(q?.chips?.map((c) => c.value)).toEqual(["email:Gmail", "email:Outlook", "skip"]);
  });

  it("never re-asks an answered slot", () => {
    const q = nextQuestion(state({ workspace: workspace({ website: site, goals: outbound }), answered: new Set(["followup"]) }));
    expect(q?.slot).toBe("tool");
  });

  it("is done once there's nothing left to ask", () => {
    const gmail = [{ category: "email", provider: "Gmail" } as Integration];
    const done = state({
      workspace: workspace({ website: site, goals: outbound }),
      docs: confirmedProfile("offering", "audience"),
      integrations: gmail,
      answered: new Set(["tool"]),
    });
    expect(nextQuestion(done)).toBeNull();
  });
});
