import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { contextItems } from "@/lib/catalog/context";
import type { Integration, Ploy, Workspace } from "@/lib/db/types";
import { confirmedProfile, profileWith } from "@/test/fixtures";
import { emptyEntry, type Entry } from "./entry";
import {
  fallbackCard,
  itemStatus,
  MAX_ANSWERED,
  nextQuestion,
  openQuestion,
  pickChips,
  quickWinChips,
  quickWinNeeds,
  toQuestion,
  trailItems,
  upcomingQuickWin,
  websiteQuestion,
  withoutFailedTurn,
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

  it("never asks which tool they use: they name it when a task needs it connected", () => {
    expect(trailItems).not.toContain("tool");
    expect(trailItems).toContain("target_customer");
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

  it("maps numbered picks to their option, with the option's own label", () => {
    expect(pickChips(options, ["3. Google Ads for more jobs", "1. Skip for now"])).toEqual([options[2], options[0]]);
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

  it("strips option numbering the model carries over to its own chips", () => {
    const q = toQuestion(planned({ item: "target_customer", chips: ["1. Online courses", "2) Handmade crafts"] }), state({ workspace: withSite }));
    expect(q?.chips.map((c) => c.label)).toEqual(["Online courses", "Handmade crafts", "Not sure yet"]);
  });

  it("lets them type what they sell, with no guessed chips", () => {
    const noSite = workspace({ website: { status: "none", url: null } });
    const guesses = ["Online courses and coaching", "Handmade crafts and art", "Consulting and freelance services"];
    expect(toQuestion(planned({ item: "business_model", question: "What do you sell?", chips: guesses }), state({ workspace: noSite }))?.chips).toEqual([]);
  });

  it("words the goal card itself, whatever the model wrote", () => {
    const q = toQuestion(planned({ item: "goal_detail", question: "What is your revenue model?", hint: "Pricing detail" }), state({ workspace: workspace({ website: site }) }));
    expect(q).toMatchObject({ question: "What do you most want to grow in the next few months?", hint: "Decides which tasks fill your map." });
  });

  it("keeps goal chip values from the catalog, and 'not sure'", () => {
    const s = state({ workspace: workspace({ website: site }) });
    const unmatched = toQuestion(planned({ item: "goal_detail", chips: ["2. More demo bookings", "made up"] }), s);
    expect(unmatched?.chips.map((c) => c.value)).toEqual(["convert_site_visitors", "get_more_leads", "run_outbound", "launch_paid_ads", "unsure"]);
    const picked = toQuestion(planned({ item: "goal_detail", chips: ["2. More demo bookings", "1. Convert more site visitors"] }), s);
    expect(picked?.chips).toEqual([
      { label: "Get more leads", value: "get_more_leads" },
      { label: "Convert more site visitors", value: "convert_site_visitors" },
      { label: "Not sure yet", value: "unsure" },
    ]);
  });

  it("offers the quick win beside another card, with catalog quick wins", () => {
    const alt = { question: "Want something **useful** now?", hint: null, chips: ["1. Audit my homepage", "3. Find accounts"] };
    const q = toQuestion(planned({ item: "goal_detail", alt }), state({ workspace: workspace({ website: site }), docs: confirmedProfile("audience") }));
    // The side card's words are fixed: they always match its chips.
    expect(q?.alt).toMatchObject({ slot: "quick_win_offer", question: "Want something useful built in the next few minutes?" });
    expect(q?.alt?.chips.map((c) => c.value)).toEqual(["homepage_audit", "lookalike_accounts"]);
  });

  it("offers a landing page instead of a homepage audit without a site", () => {
    const alt = { question: "Quick win?", hint: null, chips: [] };
    const q = toQuestion(
      planned({ item: "goal_detail", alt }),
      state({ workspace: workspace({ website: { status: "none", url: null } }), docs: profileWith("offering") }),
    );
    expect(q?.alt?.chips[0].value).toBe("landing_page_draft");
    expect(q?.alt?.chips.map((c) => c.value)).not.toContain("homepage_audit");
  });

  it("offers no quick win before one would be specific to them", () => {
    const noSite = state({ workspace: workspace({ website: { status: "none", url: null } }) });
    const alt = { question: "Quick win?", hint: null, chips: ["1. Draft a landing page"] };
    const q = toQuestion(planned({ item: "business_model", question: "What do you sell?", alt }), noSite);
    expect(q?.slot).toBe("business_model");
    expect(q?.alt).toBeNull();
    expect(toQuestion(planned({ item: "quick_win_offer" }), noSite)).toBeNull();
  });

  it("never offers a second quick win", () => {
    const s = state({ workspace: withSite, ploys: [quickWin] });
    const alt = { question: "Quick win?", hint: null, chips: [] };
    expect(toQuestion(planned({ item: "target_customer", alt }), s)?.alt).toBeNull();
    expect(toQuestion(planned({ item: "quick_win_offer" }), s)).toBeNull();
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

describe("quick win readiness", () => {
  const noSite = workspace({ website: { status: "none", url: null } });
  const values = (s: TrailState) => quickWinChips(s).map((c) => c.value);

  it("offers nothing with no site and nothing known about them", () => {
    expect(values(state({ workspace: noSite }))).toEqual([]);
    expect(itemStatus("quick_win_offer", state({ workspace: noSite }))).toBe("waiting");
    expect(quickWinNeeds("landing_page_draft", state({ workspace: noSite }))).toEqual(["business_model"]);
  });

  it("offers what's ready once they've said what they sell", () => {
    const s = state({ workspace: noSite, docs: profileWith("offering") });
    expect(values(s)).toEqual(["landing_page_draft", "social_posts"]);
    expect(itemStatus("quick_win_offer", s)).toBe("missing");
  });

  it("needs who they want to reach from them, not their site, for audience-based ones", () => {
    const withSite = workspace({ website: site });
    expect(values(state({ workspace: withSite, docs: profileWith("audience") }))).toEqual(["homepage_audit"]);
    expect(values(state({ workspace: withSite, docs: confirmedProfile("audience") }))).toEqual(["homepage_audit", "outreach_sequence", "lookalike_accounts"]);
    expect(quickWinNeeds("outreach_sequence", state({ workspace: withSite }))).toEqual(["target_customer"]);
  });

  it("needs a site it could read for the homepage audit", () => {
    expect(quickWinNeeds("homepage_audit", state({ workspace: workspace({ website: site }, { status: "failed" }) }))).toEqual(["website"]);
  });
});

describe("fallbackCard (the planner failed)", () => {
  const noSite = workspace({ website: { status: "none", url: null } });

  it("asks what they sell first when there's no site to read", () => {
    expect(fallbackCard(state({ workspace: noSite }))).toMatchObject({ slot: "business_model", chips: [] });
  });

  it("then their goal, with ready quick wins beside it", () => {
    const q = fallbackCard(state({ workspace: noSite, docs: profileWith("offering") }));
    expect(q?.slot).toBe("goal_detail");
    expect(q?.alt?.chips.map((c) => c.value)).toEqual(["landing_page_draft", "social_posts"]);
  });

  it("then who they want to reach, asked for their goal", () => {
    const q = fallbackCard(state({ workspace: workspace({ website: site, goals: outbound }) }));
    expect(q).toMatchObject({ slot: "target_customer", question: "Who do you most want to reach out to?" });
  });

  it("has nothing to ask once the trail has what it needs, or before the website", () => {
    const done = state({ workspace: workspace({ website: site, goals: outbound }), docs: confirmedProfile("audience"), ploys: [quickWin] });
    expect(fallbackCard(done)).toBeNull();
    expect(fallbackCard(state({}))).toBeNull();
  });
});

describe("withoutFailedTurn", () => {
  const msg = (id: string, role: "user" | "assistant") => ({ id, role, parts: [] }) as UIMessage;

  it("drops the failed answer and any partial reply, so the card is back", () => {
    const messages = [msg("card", "assistant"), msg("tap", "user"), msg("partial", "assistant")];
    expect(withoutFailedTurn(messages).map((m) => m.id)).toEqual(["card"]);
    expect(withoutFailedTurn([msg("card", "assistant")]).map((m) => m.id)).toEqual(["card"]);
  });
});

describe("upcomingQuickWin (said on the card that starts it)", () => {
  it("names the path's deliverable on the one card it's still waiting on", () => {
    const s = state({ workspace: workspace({ website: site, goals: outbound }) });
    expect(upcomingQuickWin("target_customer", s)).toBe("outreach_sequence");
    expect(upcomingQuickWin("current_acquisition", s)).toBeNull();
  });

  it("names the landing page on 'what do you sell' for someone with no site", () => {
    const unsureNoSite = workspace({ website: { status: "none", url: null }, goals: { status: "unsure", intents: [], inUserWords: null, unmatched: null } });
    expect(upcomingQuickWin("business_model", state({ workspace: unsureNoSite }))).toBe("landing_page_draft");
  });

  it("says nothing once one is running, or before the goal picks one", () => {
    expect(upcomingQuickWin("target_customer", state({ workspace: workspace({ website: site, goals: outbound }), ploys: [quickWin] }))).toBeNull();
    expect(upcomingQuickWin("goal_detail", state({ workspace: workspace({ website: site }) }))).toBeNull();
  });
});
