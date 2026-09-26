import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { contextItems } from "@/lib/catalog/context";
import type { Integration, Ploy, Workspace } from "@/lib/db/types";
import { confirmedProfile, profileWith } from "@/test/fixtures";
import { emptyEntry, type Entry } from "./entry";
import {
  itemStatus,
  MAX_ANSWERED,
  nextQuestion,
  openQuestion,
  pickChips,
  toQuestion,
  websiteQuestion,
  type AnsweredSlot,
  type PlannedCard,
  type QuestionData,
  type TrailState,
} from "./trail";

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
const planned = (card: Partial<PlannedCard> & Pick<PlannedCard, "item">): PlannedCard => ({
  question: "Who do you most want to reach?",
  hint: null,
  chips: [],
  alt: null,
  ...card,
});

describe("nextQuestion", () => {
  it("always starts with their website", () => {
    expect(nextQuestion(state({}))).toEqual(websiteQuestion());
  });

  it("lets the model plan everything after the website", () => {
    expect(nextQuestion(state({ workspace: workspace({ website: { status: "none", url: null } }) }))).toBe("plan");
    expect(nextQuestion(state({ workspace: workspace({ website: site, goals: outbound }) }))).toBe("plan");
  });

  it(`stops after ${MAX_ANSWERED} answers, whatever's left`, () => {
    const answered = new Set<AnsweredSlot>(["website", "goal_detail", "target_customer", "tool", "constraints", "current_acquisition"]);
    expect(nextQuestion(state({ workspace: workspace({ website: site }), answered }))).toBeNull();
  });
});

describe("itemStatus", () => {
  const withSite = workspace({ website: site, goals: outbound });

  it("knows what they told us", () => {
    expect(itemStatus("target_customer", state({ workspace: withSite, docs: confirmedProfile("audience") }))).toBe("known");
    expect(itemStatus("goal_detail", state({ workspace: withSite }))).toBe("known");
    expect(itemStatus("quick_win_offer", state({ workspace: withSite, ploys: [quickWin] }))).toBe("known");
  });

  it("marks what their site says as inferred, not known", () => {
    expect(itemStatus("target_customer", state({ workspace: withSite, docs: profileWith("audience") }))).toBe("inferred");
  });

  it("waits on their site for what they sell, unless it couldn't be read", () => {
    expect(itemStatus("business_model", state({ workspace: withSite }))).toBe("reading");
    expect(itemStatus("business_model", state({ workspace: workspace({ website: site }, { status: "failed" }) }))).toBe("missing");
    expect(itemStatus("business_model", state({ workspace: workspace({ website: { status: "none", url: null } }) }))).toBe("missing");
  });

  it("marks 'not sure' answers as asked", () => {
    expect(itemStatus("target_customer", state({ workspace: withSite, answered: new Set(["target_customer"]) }))).toBe("answered");
  });

  it("has no tool to ask about until tasks need one", () => {
    expect(itemStatus("tool", state({}))).toBe("unavailable");
    expect(itemStatus("tool", state({ workspace: withSite }))).toBe("missing");
    const named = workspace({ website: site, goals: outbound, tools: { email: "Gmail" } });
    expect(itemStatus("tool", state({ workspace: named }))).toBe("known");
  });
});

describe("contextItems", () => {
  it("treats a confirmed section as known for every profile-backed item", () => {
    const s = { workspace: workspace({}), docs: confirmedProfile("offering"), ploys: [], integrations: [] as Integration[] };
    expect(contextItems.business_model.known(s)).toBe(true);
    expect(contextItems.constraints.known(s)).toBe(false);
  });

  it("tolerates profiles without the constraints section", () => {
    const docs = profileWith().map((d) => ({ ...d, sections: {} }));
    expect(contextItems.constraints.known({ workspace: workspace({}), docs, ploys: [], integrations: [] })).toBe(false);
  });
});

describe("pickChips", () => {
  const options = [
    { label: "Get more leads", value: "get_more_leads" },
    { label: "Run outbound outreach", value: "run_outbound" },
    { label: "Launch paid ads", value: "launch_paid_ads" },
  ];

  it("maps numbered picks to their option, keeping the model's wording", () => {
    expect(pickChips(options, ["3. Google Ads for more jobs", "1. Get more leads"])).toEqual([
      { label: "Google Ads for more jobs", value: "launch_paid_ads" },
      { label: "Get more leads", value: "get_more_leads" },
    ]);
  });

  it("maps by label, and drops anything that isn't an option", () => {
    expect(pickChips(options, ["run outbound outreach", "Become famous", "Launch paid ads"]).map((c) => c.value)).toEqual([
      "run_outbound",
      "launch_paid_ads",
    ]);
  });

  it("falls back to every option when fewer than two survive", () => {
    expect(pickChips(options, ["Become famous", "9. Nope"])).toEqual(options);
  });
});

describe("toQuestion", () => {
  const withSite = workspace({ website: site, goals: outbound });

  it("finishes when the model does", () => {
    expect(toQuestion(null, state({ workspace: withSite }))).toBeNull();
  });

  it("writes open items' chips from the model, plus 'not sure'", () => {
    const q = toQuestion(
      planned({ item: "target_customer", chips: ["Independent cafés", "Offices", "Not sure", "Hotels", "Gyms"] }),
      state({ workspace: withSite }),
    );
    expect(q?.slot).toBe("target_customer");
    expect(q?.chips.map((c) => c.label)).toEqual(["Independent cafés", "Offices", "Hotels", "Not sure yet"]);
  });

  it("lets them type what they sell without a 'not sure' chip", () => {
    const noSite = workspace({ website: { status: "none", url: null } });
    expect(toQuestion(planned({ item: "business_model", question: "What do you sell?" }), state({ workspace: noSite }))?.chips).toEqual([]);
  });

  it("keeps goal chip values from the catalog, and 'not sure'", () => {
    const s = state({ workspace: workspace({ website: site }) });
    const unmatched = toQuestion(planned({ item: "goal_detail", chips: ["2. More demo bookings", "made up"] }), s);
    expect(unmatched?.chips.map((c) => c.value)).toEqual(["convert_site_visitors", "get_more_leads", "run_outbound", "launch_paid_ads", "unsure"]);
    const picked = toQuestion(planned({ item: "goal_detail", chips: ["2. More demo bookings", "1. Convert more site visitors"] }), s);
    expect(picked?.chips).toEqual([
      { label: "More demo bookings", value: "get_more_leads" },
      { label: "Convert more site visitors", value: "convert_site_visitors" },
      { label: "Not sure yet", value: "unsure" },
    ]);
  });

  it("offers the quick win beside another card, with catalog quick wins", () => {
    const alt = { question: "Want something **useful** now?", hint: null, chips: ["1. Audit my homepage", "3. Find accounts"] };
    const q = toQuestion(planned({ item: "goal_detail", alt }), state({ workspace: workspace({ website: site }) }));
    expect(q?.alt).toMatchObject({ slot: "quick_win_offer", question: "Want something useful now?" });
    expect(q?.alt?.chips.map((c) => c.value)).toEqual(["homepage_audit", "lookalike_accounts"]);
  });

  it("offers a landing page instead of a homepage audit without a site", () => {
    const alt = { question: "Quick win?", hint: null, chips: [] };
    const q = toQuestion(planned({ item: "goal_detail", alt }), state({ workspace: workspace({ website: { status: "none", url: null } }) }));
    expect(q?.alt?.chips[0].value).toBe("landing_page_draft");
    expect(q?.alt?.chips.map((c) => c.value)).not.toContain("homepage_audit");
  });

  it("never offers a second quick win", () => {
    const s = state({ workspace: withSite, ploys: [quickWin] });
    const alt = { question: "Quick win?", hint: null, chips: [] };
    expect(toQuestion(planned({ item: "target_customer", alt }), s)?.alt).toBeNull();
    expect(toQuestion(planned({ item: "quick_win_offer" }), s)).toBeNull();
  });

  it("asks for the tool the most tasks need, with its chips and skip", () => {
    const q = toQuestion(planned({ item: "tool", question: "Which email do you use?", chips: ["1. Gmail"] }), state({ workspace: withSite }));
    expect(q).toMatchObject({ slot: "tool", category: "email" });
    expect(q?.chips.map((c) => c.value)).toEqual(["email:Gmail", "email:Outlook", "skip"]);
  });

  it("finishes rather than ask something code can't serve", () => {
    expect(toQuestion(planned({ item: "tool" }), state({}))).toBeNull();
    expect(toQuestion(planned({ item: "website" }), state({ workspace: withSite }))).toBeNull();
  });
});

describe("openQuestion", () => {
  const ask = (id: string, q: Partial<QuestionData>): UIMessage => ({
    id,
    role: "assistant",
    parts: [{ type: "data-question", data: { ...websiteQuestion(), ...q } }],
  });
  const answer = (id: string, slot: AnsweredSlot, question?: Partial<QuestionData>): UIMessage[] => [
    { id: `u${id}`, role: "user", parts: [{ type: "text", text: "x" }] },
    {
      id,
      role: "assistant",
      parts: [
        { type: "data-answered", data: { slot, summary: "x" } },
        ...(question ? [{ type: "data-question" as const, data: { ...websiteQuestion(), ...question } }] : []),
      ],
    },
  ];

  it("is the latest card until it's answered", () => {
    const messages = [ask("a", { slot: "target_customer" })];
    expect(openQuestion(messages)?.slot).toBe("target_customer");
    expect(openQuestion([...messages, ...answer("b", "target_customer")])).toBeNull();
  });

  it("stays open when the model asks about an item again", () => {
    const messages = [ask("a", { slot: "target_customer" }), ...answer("b", "target_customer", { slot: "target_customer" })];
    expect(openQuestion(messages)?.slot).toBe("target_customer");
  });

  it("closes the fork when either card is answered", () => {
    const alt = { slot: "quick_win_offer" as const, question: "?", hint: null, chips: [] };
    const messages = [ask("a", { slot: "goal_detail", alt }), ...answer("b", "quick_win_offer")];
    expect(openQuestion(messages)).toBeNull();
  });
});
