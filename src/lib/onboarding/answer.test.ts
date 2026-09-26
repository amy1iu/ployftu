import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/lib/db/types";
import { withConfidence, type Answers, type Decision } from "./decisions";
import { emptyEntry } from "./entry";
import type { QuestionData } from "./trail";

// The Jev branch of recording a typed answer, with the database and the
// extractors mocked: which decisions lead where, and when it falls back.

const calls = vi.hoisted(() => ({ entry: [] as unknown[], sections: [] as unknown[], extract: 0, freeText: 0 }));

vi.mock("./set-entry", () => ({
  applyEntryUpdate: vi.fn(async (_id: string, update: { website: { status: string; url: string | null } | null }) => {
    calls.entry.push(update);
    return { entry: { ...emptyEntry, website: update.website ?? emptyEntry.website }, branch: null, problems: [] };
  }),
}));
vi.mock("@/lib/db/workspaces", () => ({
  getDocs: vi.fn(async () => []),
  getWorkspace: vi.fn(),
  patchProfileSections: vi.fn(async (_id: string, patches: unknown[]) => calls.sections.push(...patches)),
  updateWorkspace: vi.fn(),
}));
vi.mock("@/lib/db/events", () => ({ logEvent: vi.fn(), logEvents: vi.fn() }));
vi.mock("@/lib/ai/onboarding/extract", () => ({
  extractEntryUpdate: vi.fn(async () => {
    calls.extract++;
    return { website: null, goals: null, business: null, answer: null };
  }),
  extractFreeText: vi.fn(async () => {
    calls.freeText++;
    return { goalInWords: "reach HR leaders", whatTheyDo: null, whoTheyServe: "Cafés", summary: "Cafés mostly" };
  }),
}));

const { applyAnswer } = await import("./answer");

const workspace = { id: "w", entry: emptyEntry } as Workspace;
const message = (text: string): UIMessage => ({ id: "u", role: "user", parts: [{ type: "text", text }] });
const choice = (choice: string, p: number, others: string[] = ["other"]) =>
  withConfidence({ type: "choice", choice, probabilities: { [choice]: p, ...Object.fromEntries(others.map((o) => [o, (1 - p) / others.length])) } });
const statuses = ["partial", "unsure", "off_script", "asked_question", "changed_earlier_answer"];
const status = (s: string, p = 0.98) => choice(s, p, [...statuses, "answered"].filter((x) => x !== s));
const all = new Set<Decision>(["answer_status", "chip_match", "website_status", "goal_intent"]);

const card = (q: Partial<QuestionData>): QuestionData => ({ question: "?", hint: null, chips: [], category: null, alt: null, offScript: false, slot: "website", ...q });
const website = card({ slot: "website", chips: [{ label: "I don't have one yet", value: "none" }, { label: "It's not live yet", value: "not_live" }] });
const cafes = card({
  slot: "target_customer",
  chips: [
    { label: "Independent cafés", value: "Independent cafés" },
    { label: "Offices", value: "Offices" },
    { label: "Not sure yet", value: "unsure" },
  ],
});
const fork = card({
  slot: "goal_detail",
  chips: [{ label: "Get more leads", value: "get_more_leads" }, { label: "Not sure yet", value: "unsure" }],
  alt: { slot: "quick_win_offer", question: "?", hint: null, chips: [{ label: "Audit my homepage", value: "homepage_audit" }] },
});

const run = (asked: QuestionData, text: string, answers: Answers, decisions = all) =>
  applyAnswer({ workspace, asked, message: message(text), messages: [message(text)], userTurns: 1, decided: { answers: Promise.resolve(answers), decisions } });

beforeEach(() => {
  calls.entry = [];
  calls.sections = [];
  calls.extract = 0;
  calls.freeText = 0;
});

describe("a typed answer read from Jev's decisions", () => {
  it("finds the link in a sentence, with no model", async () => {
    const r = await run(website, "My website is acme.com.", { answer_status: status("answered"), website_status: choice("has", 0.99, ["none", "not_live"]) });
    expect(r).toMatchObject({ slot: "website", summary: "acme.com", confirm: null });
    expect(calls.entry).toEqual([expect.objectContaining({ website: { status: "has", url: "https://acme.com" } })]);
    expect(calls.extract + calls.freeText).toBe(0);
  });

  it("asks again when they say they have a site but give no link", async () => {
    const r = await run(website, "yes we have one", { answer_status: status("answered"), website_status: choice("has", 0.99, ["none", "not_live"]) });
    expect(r.slot).toBeNull();
    expect(r.problems).toHaveLength(1);
  });

  it("falls back to the extractor when unsure of its reading, or for a changed answer", async () => {
    await run(cafes, "cafés", { answer_status: status("answered", 0.3) });
    await run(cafes, "actually our site is acme.io", { answer_status: status("changed_earlier_answer") });
    expect(calls.extract).toBe(2);
  });

  it("records every chip for 'all of the above'", async () => {
    const r = await run(cafes, "all of the above", { answer_status: status("answered"), chip_match: choice("all", 0.97, ["none", "Offices"]) });
    expect(r).toMatchObject({ slot: "target_customer", summary: "Independent cafés, Offices" });
    expect(calls.sections).toEqual([expect.objectContaining({ key: "who-we-serve", body: "Independent cafés, Offices" })]);
  });

  it("takes 'not sure' as an answer, and replies to something off-script without recording", async () => {
    expect(await run(cafes, "no idea", { answer_status: status("unsure") })).toMatchObject({ slot: "target_customer", summary: "Not sure yet" });
    const off = await run(cafes, "can you do my bookkeeping?", { answer_status: status("off_script"), chip_match: choice("none", 0.99, ["Offices"]) });
    expect(off).toMatchObject({ slot: null, offScript: "can you do my bookkeeping?" });
    expect(calls.sections).toEqual([]);
  });

  it("copies free text only when there's an answer to copy", async () => {
    const r = await run(cafes, "mostly cafés, some offices", { answer_status: status("answered"), chip_match: choice("none", 0.95, ["Offices"]) });
    expect(r).toMatchObject({ slot: "target_customer", summary: "Cafés mostly" });
    expect(calls.freeText).toBe(1);
    expect(calls.sections).toEqual([expect.objectContaining({ key: "who-we-serve", body: "Cafés" })]);
  });

  it("confirms back a reading it's only fairly sure of", async () => {
    const r = await run(cafes, "offices I guess", { answer_status: status("answered", 0.8), chip_match: choice("Offices", 0.95, ["none"]) });
    expect(r).toMatchObject({ slot: "target_customer", summary: "Offices", confirm: "Offices" });
  });

  it("starts a quick win asked for under the goal question", async () => {
    const r = await run(fork, "can you check my homepage?", { answer_status: status("asked_question"), chip_match: choice("Audit my homepage", 0.9, ["none"]) });
    expect(r).toMatchObject({ slot: "quick_win_offer", quickWin: "homepage_audit" });
  });

  it("records a goal with probabilities as weights, in their words", async () => {
    const goal = withConfidence({ type: "choice", choice: "run_outbound", probabilities: { run_outbound: 0.7, get_more_leads: 0.25, unsure: 0.05 } });
    const r = await run(fork, "cold outreach to HR leaders", { answer_status: status("answered"), chip_match: choice("none", 0.9, ["Get more leads"]), goal_intent: goal });
    expect(r.slot).toBe("goal_detail");
    expect(calls.entry).toEqual([
      expect.objectContaining({
        goals: expect.objectContaining({ intents: [{ id: "run_outbound", weight: 0.7 }, { id: "get_more_leads", weight: 0.25 }], inUserWords: "reach HR leaders" }),
      }),
    ]);
  });

  it("leaves a slot to the extractor when its decision isn't switched on", async () => {
    await run(website, "it's acme.com", { answer_status: status("answered") }, new Set(["answer_status"]));
    expect(calls.extract).toBe(1);
  });
});
