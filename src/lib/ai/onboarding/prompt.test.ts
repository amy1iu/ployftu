import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { Ploy, Workspace } from "@/lib/db/types";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import type { AnsweredSlot, TrailState } from "@/lib/onboarding/trail";
import { confirmedProfile, profileWith } from "@/test/fixtures";
import { askableItems } from "./prompt";
import { turnSchemaFor } from "./reply";

const site: Entry["website"] = { status: "has", url: "https://acme.com" };
const outbound: Entry["goals"] = { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: null, unmatched: null };
const state = (entry: Partial<Entry>, overrides: Partial<TrailState> = {}): TrailState => ({
  workspace: { entry: { ...emptyEntry, ...entry }, crawl: null } as Workspace,
  docs: profileWith(),
  ploys: [],
  mapNodes: [],
  integrations: [],
  answered: new Set<AnsweredSlot>(),
  ...overrides,
});
const cardFor = (slot: string): UIMessage => ({
  id: `ask-${slot}`,
  role: "assistant",
  parts: [{ type: "data-question", data: { slot, question: "?", hint: null, chips: [], category: null, alt: null, offScript: false } }],
});

describe("askableItems (what the next card may ask about)", () => {
  it("offers only the essentials while one is still unknown", () => {
    const items = askableItems(state({ website: site }), [cardFor("quick_win_offer")]);
    expect(items).toContain("goal_detail");
    expect(items).not.toContain("current_acquisition");
    expect(items).not.toContain("constraints");
  });

  it("offers what isn't known once the essentials are in, never the website or the old tool question", () => {
    const items = askableItems(state({ website: site, goals: outbound }, { docs: confirmedProfile("offering", "audience") }), [cardFor("target_customer")]);
    expect(items).toEqual(expect.arrayContaining(["current_acquisition", "constraints"]));
    expect(items).not.toContain("website");
    expect(items).not.toContain("tool");
    expect(items).not.toContain("goal_detail");
  });

  it("lets a fact they only mentioned in passing be sharpened, until a card has asked it", () => {
    const passing = state({ website: site, goals: outbound }, { docs: confirmedProfile("audience") });
    expect(askableItems(passing, [])).toContain("target_customer");
    expect(askableItems(passing, [cardFor("target_customer")])).not.toContain("target_customer");
  });

  it("keeps a card's item open when they took the quick win beside it instead", () => {
    const tookQuickWin = state({ website: site, goals: outbound }, { answered: new Set<AnsweredSlot>(["website", "quick_win_offer"]) });
    expect(askableItems(tookQuickWin, [cardFor("target_customer")])).toContain("target_customer");
  });

  it("asks for a goal again when all they asked for is something Ploy doesn't do", () => {
    const hiring: Entry["goals"] = { status: "has", intents: [], inUserWords: "help hiring engineers", unmatched: "help hiring engineers" };
    expect(askableItems(state({ website: { status: "none", url: null }, goals: hiring }, { docs: confirmedProfile("offering", "audience") }), [])).toEqual(["goal_detail"]);
  });

  it("treats 'not sure' as settled", () => {
    const unsure = state({ website: site, goals: outbound }, { answered: new Set<AnsweredSlot>(["target_customer"]) });
    expect(askableItems(unsure, [cardFor("target_customer")])).not.toContain("target_customer");
  });

  it("doesn't offer a quick win once one is running", () => {
    const running = state({ website: site, goals: outbound }, { ploys: [{ spec: { source: "quick_win" }, status: "running" } as Ploy] });
    expect(askableItems(running, [])).not.toContain("quick_win_offer");
  });
});

describe("turnSchemaFor", () => {
  const base = { message: "", understood: "x", gap: "none" };
  const cardOf = (item: string) => ({ item, question: "?", hint: null, chips: [], alt: null });

  it("rejects a card about an item that isn't offered", () => {
    const schema = turnSchemaFor(["current_acquisition"]);
    expect(schema.safeParse({ ...base, next: cardOf("current_acquisition") }).success).toBe(true);
    expect(schema.safeParse({ ...base, next: cardOf("target_customer") }).success).toBe(false);
  });

  it("allows only finishing when nothing is left to ask", () => {
    const schema = turnSchemaFor([]);
    expect(schema.safeParse({ ...base, next: null }).success).toBe(true);
    expect(schema.safeParse({ ...base, next: cardOf("constraints") }).success).toBe(false);
  });
});
