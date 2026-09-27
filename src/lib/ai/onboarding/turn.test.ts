import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { UIMessageChunk } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Workspace } from "@/lib/db/types";
import { emptyProfileDocs } from "@/lib/docs/profile";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import type { EntryUpdate } from "@/lib/onboarding/set-entry";
import type { QuestionData } from "@/lib/onboarding/trail";
import type { OnboardingUIMessage } from "./messages";
import type { Turn } from "./reply";

// A whole Getting Started turn with its failures injected: the planner model
// failing or hanging, the answer failing to record, and a conversation saved by
// an earlier version. The database and background work are in-memory fakes.

const fake = vi.hoisted(() => ({
  planner: null as unknown,
  workspace: null as unknown as Workspace,
  docs: [] as Doc[],
  extract: null as null | (() => Promise<unknown>),
}));

vi.mock("@/lib/ai/models", () => ({
  models: {
    get planner() {
      return fake.planner;
    },
    plannerOptions: {},
    chat: "unused",
    extract: "unused",
    fast: "unused",
  },
}));
vi.mock("@/lib/db/workspaces", () => ({
  getWorkspace: vi.fn(async () => fake.workspace),
  getDocs: vi.fn(async () => fake.docs),
  getPloys: vi.fn(async () => []),
  getMapNodes: vi.fn(async () => []),
  getIntegrations: vi.fn(async () => []),
  updateWorkspace: vi.fn(async () => {}),
  patchProfileSections: vi.fn(async () => {}),
  createPloy: vi.fn(async (ploy: object) => ({ id: "p1", ...ploy })),
}));
vi.mock("@/lib/db/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/onboarding/set-entry", () => ({
  applyEntryUpdate: vi.fn(async (_id: string, update: EntryUpdate) => {
    const entry = fake.workspace.entry;
    if (update.website) entry.website = update.website;
    if (update.goals) entry.goals = update.goals;
    return { entry, problems: [] };
  }),
}));
vi.mock("@/lib/ai/onboarding/extract", () => ({
  extractEntryUpdate: vi.fn(async () => (fake.extract ? fake.extract() : { website: null, goals: null, business: null, answer: null })),
}));
vi.mock("@/lib/map/sync", () => ({ syncMap: vi.fn(async () => {}) }));
vi.mock("@/lib/site/run", () => ({
  readAndProfileSite: vi.fn(async () => {}),
  siteSettled: vi.fn(async () => true),
}));
vi.mock("@/lib/quick-wins/run", () => ({ runQuickWin: vi.fn(async () => {}) }));
vi.mock("./profile-notes", () => ({ recordProfileNotes: vi.fn(async () => {}) }));

const { onboardingTurn } = await import("./index");
const { logEvent } = await import("@/lib/db/events");
const { createPloy, patchProfileSections } = await import("@/lib/db/workspaces");

// ── Planner models ──────────────────────────────────────────────────────────

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

/** A planner that answers with `turn`, and remembers the prompt it was given. */
function plannerReturning(turn: Turn) {
  const calls: LanguageModelV4CallOptions[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push(options);
      const chunks: LanguageModelV4StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: JSON.stringify(turn) },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
  return { model, calls };
}

const failingPlanner = () =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("Gateway: team budget exceeded");
    },
  });

/** Never answers; gives up only when the turn aborts it. */
const hangingPlanner = () =>
  new MockLanguageModelV4({
    doStream: ({ abortSignal }) =>
      new Promise((_, reject) => abortSignal?.addEventListener("abort", () => reject(abortSignal.reason))),
  });

// ── Conversations ───────────────────────────────────────────────────────────

const card = (data: Partial<QuestionData> & Pick<QuestionData, "slot" | "question">): OnboardingUIMessage => ({
  id: `ask-${data.slot}`,
  role: "assistant",
  parts: [{ type: "data-question", data: { hint: null, chips: [], category: null, alt: null, offScript: false, ...data } }],
});
const tap = (slot: string, label: string, value: string): OnboardingUIMessage => ({
  id: `tap-${value}`,
  role: "user",
  metadata: { slot, value } as OnboardingUIMessage["metadata"],
  parts: [{ type: "text", text: label }],
});
const typed = (text: string): OnboardingUIMessage => ({ id: "typed", role: "user", parts: [{ type: "text", text }] });
/** The website card, answered: an earlier answer on the trail. */
const siteAnswered: OnboardingUIMessage[] = [
  card({ slot: "website", question: "What's your website?" }),
  { id: "site", role: "user", metadata: { slot: "website" }, parts: [{ type: "text", text: "acme.com" }] },
  { id: "site-reply", role: "assistant", parts: [{ type: "data-answered", data: { slot: "website", summary: "acme.com" } }] },
];

const goalCard = card({
  slot: "goal_detail",
  question: "What do you most want to grow in the next few months?",
  chips: [
    { label: "Get more leads", value: "get_more_leads" },
    { label: "Not sure yet", value: "unsure" },
  ],
});

async function run(messages: OnboardingUIMessage[], { sideEffects = false } = {}) {
  const { stream } = await onboardingTurn({ workspaceId: "w1", messages, onSaved: async () => {}, sideEffects });
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as UIMessageChunk);
  }
  const data = <T,>(type: string) => chunks.filter((c) => c.type === type).map((c) => (c as { data: T }).data);
  return {
    chunks,
    question: data<QuestionData>("data-question")[0] ?? null,
    answered: data<{ slot: string }>("data-answered")[0] ?? null,
    text: chunks.map((c) => (c.type === "text-delta" ? c.delta : "")).join(""),
    errors: chunks.filter((c) => c.type === "error"),
  };
}

beforeEach(() => {
  const entry: Entry = { ...structuredClone(emptyEntry), website: { status: "has", url: "https://acme.com" } };
  fake.workspace = { id: "w1", entry, crawl: null } as unknown as Workspace;
  fake.docs = emptyProfileDocs() as unknown as Doc[];
  fake.extract = null;
  vi.mocked(logEvent).mockClear();
  vi.mocked(patchProfileSections).mockClear();
});
afterEach(() => {
  delete process.env.PLANNER_TIMEOUT_MS;
});

const plannerErrors = () => vi.mocked(logEvent).mock.calls.filter(([, name, props]) => name === "turn_error" && props?.stage === "planner");

// ── Tests ───────────────────────────────────────────────────────────────────

describe("onboarding turn, when things fail", () => {
  it("puts up the next card from code when the planner fails", async () => {
    fake.planner = failingPlanner();
    const turn = await run([goalCard, tap("goal_detail", "Get more leads", "get_more_leads")]);
    expect(turn.errors).toEqual([]);
    expect(turn.answered?.slot).toBe("goal_detail");
    // Without the planner, the next open item in the usual order: who they want to reach.
    expect(turn.question?.slot).toBe("target_customer");
    expect(turn.question?.question).toBe("Who are your best customers today?");
    // Answering it starts their first deliverable, so the card says so.
    expect(turn.question?.unlocks).toBe("a list of 10 look-alike accounts");
    expect(plannerErrors()).toHaveLength(1);
  });

  it("gives up on a planner that hangs, and still puts up a card", async () => {
    process.env.PLANNER_TIMEOUT_MS = "50";
    fake.planner = hangingPlanner();
    const started = Date.now();
    const turn = await run([goalCard, tap("goal_detail", "Get more leads", "get_more_leads")]);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(turn.question?.slot).toBe("target_customer");
    expect(plannerErrors()).toHaveLength(1);
  });

  it("asks again when an answer fails to record, and says why", async () => {
    fake.extract = async () => {
      throw new Error("extractor timed out");
    };
    const { model, calls } = plannerReturning({
      message: "That didn't save on our side.",
      understood: "A business with a website.",
      gap: "goal_detail: what they want to grow",
      next: { item: "goal_detail", question: "What do you most want to grow?", hint: null, chips: [], alt: null },
    });
    fake.planner = model;
    const turn = await run([goalCard, typed("we want more demo requests")]);
    expect(turn.errors).toEqual([]);
    expect(turn.answered).toBeNull();
    expect(turn.question?.slot).toBe("goal_detail");
    const system = JSON.stringify(calls[0].prompt);
    expect(system).toContain("couldn't be recorded: It didn't save on our side.");
    expect(vi.mocked(logEvent).mock.calls.some(([, name, props]) => name === "turn_error" && props?.stage === "answer")).toBe(true);
  });

  it("shows the same card again, with an apology, when both fail", async () => {
    fake.extract = async () => {
      throw new Error("extractor timed out");
    };
    fake.planner = failingPlanner();
    const turn = await run([goalCard, typed("we want more demo requests")]);
    expect(turn.errors).toEqual([]);
    expect(turn.question?.slot).toBe("goal_detail");
    expect(turn.question?.question).toBe(goalCard.parts[0].type === "data-question" ? goalCard.parts[0].data.question : "");
    expect(turn.text).toContain("didn't go through");
  });

  it("closes a reply the planner stopped partway through", async () => {
    fake.planner = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "t" });
            controller.enqueue({ type: "text-delta", id: "t", delta: '{"message":"Great. Now I need to ' });
            controller.error(new Error("connection reset"));
          },
        }),
      }),
    });
    const turn = await run([goalCard, tap("goal_detail", "Get more leads", "get_more_leads")]);
    const starts = turn.chunks.filter((c) => c.type === "text-start").length;
    const ends = turn.chunks.filter((c) => c.type === "text-end").length;
    expect(ends).toBe(starts);
    expect(turn.question?.slot).toBe("target_customer");
  });

  it("goes on without the quick win when it fails to start", async () => {
    fake.workspace.entry.goals = { status: "has", intents: [{ id: "get_more_leads", weight: 1 }], inUserWords: null, unmatched: null };
    vi.mocked(createPloy).mockRejectedValueOnce(new Error("database unavailable"));
    const { model } = plannerReturning({ message: "", understood: "A business.", gap: "none", next: null });
    fake.planner = model;
    const customers = card({ slot: "target_customer", question: "Who are your best customers today?", chips: [{ label: "Not sure yet", value: "unsure" }] });
    const turn = await run([...siteAnswered, customers, tap("target_customer", "Not sure yet", "unsure")]);
    expect(turn.errors).toEqual([]);
    expect(turn.chunks.some((c) => c.type === "data-taskStarted")).toBe(false);
    expect(vi.mocked(logEvent).mock.calls.some(([, name, props]) => name === "turn_error" && props?.stage === "quick_win")).toBe(true);
  });

  it("records what they typed, not the nearest suggestion", async () => {
    // The extractor sees no suggestions to match; even if it named one, their words stand.
    fake.extract = async () => ({
      website: null,
      goals: null,
      business: null,
      answer: { answered: true, matchedChip: "Freelancers", summary: "Local restaurants", offScript: null },
    });
    const { model } = plannerReturning({ message: "", understood: "A business.", gap: "none", next: null });
    fake.planner = model;
    const customers = card({
      slot: "target_customer",
      question: "Who are your best customers today?",
      chips: [
        { label: "Freelancers", value: "Freelancers" },
        { label: "Not sure yet", value: "unsure" },
      ],
    });
    const turn = await run([customers, typed("Local restaurants that do their own books")]);
    const { extractEntryUpdate } = await import("@/lib/ai/onboarding/extract");
    expect(vi.mocked(extractEntryUpdate).mock.calls.at(-1)?.[2]).toMatchObject({ slot: "target_customer", chips: [] });
    expect(turn.answered).toMatchObject({ slot: "target_customer", summary: "Local restaurants" });
    expect(vi.mocked(patchProfileSections).mock.calls[0][1]).toEqual([expect.objectContaining({ key: "who-we-serve", body: "Local restaurants" })]);
  });

  it("waits for their site before planning the next card, and plans from it", async () => {
    const { siteSettled } = await import("@/lib/site/run");
    vi.mocked(siteSettled).mockImplementationOnce(async () => {
      fake.workspace.crawl = {
        url: "https://acme.com",
        status: "done",
        summary: { oneLiner: "Acme sells roasted coffee to independent cafés." },
        opportunities: [],
      } as unknown as Workspace["crawl"];
      return true;
    });
    fake.workspace.entry.website = { status: "unknown", url: null };
    const { model, calls } = plannerReturning({
      message: "",
      understood: "Acme sells roasted coffee to cafés.",
      gap: "goal_detail: what they want to grow",
      next: { item: "goal_detail", question: "What do you most want to grow?", hint: null, chips: [], alt: null },
    });
    fake.planner = model;
    const website = card({ slot: "website", question: "What's your website?" });
    const turn = await run([website, typed("acme.com")], { sideEffects: true });
    expect(vi.mocked(siteSettled)).toHaveBeenCalledWith("w1", "https://acme.com", expect.any(Number));
    // Their answer lands first; the card comes after the wait, planned from the site.
    const answeredAt = turn.chunks.findIndex((c) => c.type === "data-answered");
    const questionAt = turn.chunks.findIndex((c) => c.type === "data-question");
    expect(answeredAt).toBeGreaterThanOrEqual(0);
    expect(answeredAt).toBeLessThan(questionAt);
    expect(JSON.stringify(calls[0].prompt)).toContain("Acme sells roasted coffee to independent cafés.");
    expect(turn.question?.slot).toBe("goal_detail");
  });

  it("plans anyway when their site takes too long", async () => {
    const { siteSettled } = await import("@/lib/site/run");
    vi.mocked(siteSettled).mockResolvedValueOnce(false);
    fake.workspace.entry.website = { status: "unknown", url: null };
    const { model, calls } = plannerReturning({
      message: "",
      understood: "A business with a site.",
      gap: "business_model: what they sell",
      next: { item: "goal_detail", question: "What do you most want to grow?", hint: null, chips: [], alt: null },
    });
    fake.planner = model;
    const turn = await run([card({ slot: "website", question: "What's your website?" }), typed("acme.com")], { sideEffects: true });
    expect(turn.errors).toEqual([]);
    expect(turn.question?.slot).toBe("goal_detail");
    expect(JSON.stringify(calls[0].prompt)).toContain("Not read yet.");
  });

  it("holds the first deliverable when the first answer covers everything, and says the next card starts it", async () => {
    fake.extract = async () => ({
      website: { status: "has", url: "https://cultureamp.com", evidence: "cultureamp.com" },
      goals: { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: "start cold outreach to HR leaders", unmatched: null, evidence: "cold outreach to HR leaders" },
      business: { whatTheyDo: "Employee survey software", whoTheyServe: "Mid-size companies", evidence: "employee survey software to mid-size companies" },
      answer: { answered: true, matchedChip: null, summary: "cultureamp.com", offScript: null },
    });
    // Everything the outreach sequence needs is known (who they reach, confirmed in their words).
    const { confirmedProfile } = await import("@/test/fixtures");
    fake.docs = confirmedProfile("offering", "audience");
    fake.workspace.entry.website = { status: "unknown", url: null };
    const { model, calls } = plannerReturning({
      message: "Nice to meet you.",
      understood: "Culture Amp sells employee survey software; outreach to HR leaders at mid-size companies.",
      gap: "current_acquisition: how they reach HR leaders today",
      next: { item: "current_acquisition", question: "How do you reach HR leaders today?", hint: null, chips: ["Conferences", "LinkedIn"], alt: null },
    });
    fake.planner = model;
    const website = card({ slot: "website", question: "What's your website?" });
    const turn = await run([website, typed("cultureamp.com. We sell employee survey software to mid-size companies. I want to start cold outreach to HR leaders.")]);
    expect(turn.chunks.some((c) => c.type === "data-taskStarted")).toBe(false);
    expect(turn.question).toMatchObject({ slot: "current_acquisition", unlocks: "a 3-step outreach sequence" });
    // Nothing to reply to: a message the model writes anyway is dropped.
    expect(turn.text).toBe("");
    expect(JSON.stringify(calls[0].prompt)).toContain("Don't finish on their first answer");
  });

  it("reads a conversation saved by an earlier version", async () => {
    fake.workspace.entry.goals = { status: "has", intents: [{ id: "get_more_leads", weight: 1 }], inUserWords: null, unmatched: null };
    const { model } = plannerReturning({ message: "", understood: "A business.", gap: "none", next: null });
    fake.planner = model;
    // The old trail's follow-up card, answered with a chip.
    const old = card({
      slot: "followup" as QuestionData["slot"],
      question: "Who are your best customers today?",
      chips: [{ label: "Independent cafés", value: "Independent cafés" }],
    });
    const turn = await run([old, tap("followup", "Independent cafés", "Independent cafés")]);
    expect(turn.errors).toEqual([]);
    expect(turn.answered?.slot).toBe("target_customer");
    expect(vi.mocked(patchProfileSections).mock.calls[0][1]).toEqual([expect.objectContaining({ key: "who-we-serve", body: "Independent cafés" })]);
  });
});
