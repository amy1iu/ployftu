import { describe, expect, it } from "vitest";
import type { Doc, Ploy, Workspace } from "@/lib/db/types";
import { emptyProfileDocs } from "@/lib/docs/profile";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import { quickWinToStart } from "./start";

const entry = (overrides: Partial<Entry>): Entry => ({ ...emptyEntry, ...overrides });
const resolved = entry({
  website: { status: "has", url: "https://acme.com" },
  goals: { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: "cold email", unmatched: null },
  resolvedAtTurn: 2,
});
const workspace = (e: Entry) => ({ entry: e }) as Workspace;
const docs = (knowsWhatTheySell: boolean) =>
  emptyProfileDocs().map((d) => ({
    ...d,
    sections: d.slug === "business-overview" && knowsWhatTheySell ? { ...d.sections, "what-we-do": { status: "inferred", source: "website", updatedAt: null } } : d.sections,
  })) as unknown as Doc[];

describe("quickWinToStart", () => {
  it("starts the intent's quick win once they've answered a follow-up", () => {
    expect(quickWinToStart({ workspace: workspace(resolved), docs: docs(true), ploys: [], userTurns: 3 })).toBe("outreach_sequence");
  });

  it("waits for a follow-up after the path is set", () => {
    expect(quickWinToStart({ workspace: workspace(resolved), docs: docs(true), ploys: [], userTurns: 2 })).toBeNull();
  });

  it("waits until the path is set", () => {
    expect(quickWinToStart({ workspace: workspace(emptyEntry), docs: docs(true), ploys: [], userTurns: 5 })).toBeNull();
  });

  it("waits until it knows what they sell", () => {
    expect(quickWinToStart({ workspace: workspace(resolved), docs: docs(false), ploys: [], userTurns: 3 })).toBeNull();
  });

  it("only ever starts one", () => {
    const existing = { spec: { source: "quick_win" } } as Ploy;
    expect(quickWinToStart({ workspace: workspace(resolved), docs: docs(true), ploys: [existing], userTurns: 4 })).toBeNull();
  });
});
