import { describe, expect, it } from "vitest";
import type { Doc, Workspace } from "@/lib/db/types";
import { emptyProfileDocs } from "@/lib/docs/profile";
import {
  confidence,
  nextChoiceQuestions,
  nextCompositeQuestions,
  nextState,
  pickNext,
  readChip,
  readGoal,
  readStatus,
  readTouched,
  recordedFrom,
  touchId,
  turnQuestions,
  turnRequest,
  turnState,
  withConfidence,
  type Answers,
  type Decision,
  type TurnInput,
} from "./decisions";
import { emptyEntry } from "./entry";

const choice = (choice: string, probabilities?: Record<string, number>) => withConfidence({ type: "choice", choice, probabilities });
const yes = (probability: number) => withConfidence({ type: "boolean", probability });
const score = (score: number, probabilities?: Record<string, number>) => withConfidence({ type: "score", score, probabilities });

describe("confidence", () => {
  it("is 1 when all the probability is on one option, 0 when it's even", () => {
    expect(confidence({ type: "choice", choice: "a", probabilities: { a: 1, b: 0, c: 0 } })).toBe(1);
    expect(confidence({ type: "choice", choice: "a", probabilities: { a: 1 / 3, b: 1 / 3, c: 1 / 3 } })).toBeCloseTo(0);
  });

  it("is (n·pmax − 1)/(n − 1)", () => {
    // Three options, 0.91 on top: (2.73 − 1) / 2
    expect(confidence({ type: "choice", choice: "a", probabilities: { a: 0.91, b: 0.09, c: 0 } })).toBeCloseTo(0.865);
    expect(confidence({ type: "score", score: 1.8, probabilities: { "0": 0.03, "1": 0.14, "2": 0.83 } })).toBeCloseTo(0.745);
  });

  it("is |2p − 1| for a boolean", () => {
    expect(confidence({ type: "boolean", probability: 0.15 })).toBeCloseTo(0.7);
    expect(confidence({ type: "boolean", probability: 0.5 })).toBe(0);
  });

  it("counts missing probabilities as no confidence", () => {
    expect(confidence({ type: "choice", choice: "a" })).toBe(0);
  });
});

const chips = [
  { label: "Independent cafés", value: "Independent cafés" },
  { label: "Offices", value: "Offices" },
  { label: "Not sure yet", value: "unsure" },
];
const input: TurnInput = {
  item: "target_customer",
  question: "Who do you most want to reach?",
  chips,
  alt: null,
  previous: null,
  message: "mostly cafés",
  recorded: { website: "has a site: https://acme.com", goal: "Get more leads", whatTheyDo: "Coffee roaster", customers: null, channels: null, constraints: null, tools: null },
};

describe("turn questions", () => {
  const all = new Set<Decision>(["answer_status", "chip_match", "website_status", "goal_intent", "profile_touch"]);

  it("asks only what's in play", () => {
    const ids = Object.keys(turnQuestions(input, all));
    expect(ids).toContain("answer_status");
    expect(ids).toContain("chip_match");
    expect(ids).not.toContain("website_status"); // not the website question
    expect(ids).toContain(touchId("who-we-serve"));
    expect(Object.keys(turnQuestions(input, new Set(["chip_match"])))).toEqual(["chip_match"]);
    expect(turnQuestions({ ...input, chips: [] }, new Set(["chip_match"]))).toEqual({});
  });

  it("offers every chip plus all and none", () => {
    const q = turnQuestions(input, all).chip_match;
    expect(q.type === "choice" && Object.keys(q.criteria)).toEqual(["Independent cafés", "Offices", "Not sure yet", "all", "none"]);
  });

  it("keeps the state small: the card, the message, a line of what's recorded", () => {
    const state = turnState(input);
    expect(state.question_on_screen.chips).toEqual(["Independent cafés", "Offices", "Not sure yet"]);
    expect(state.user_latest_message).toBe("mostly cafés");
    expect(JSON.stringify(state).length).toBeLessThan(800);
  });
});

describe("reading answers", () => {
  it("reads the status with its confidence", () => {
    const answers: Answers = { answer_status: choice("unsure", { answered: 0.1, unsure: 0.9 }) };
    expect(readStatus(answers)).toEqual({ value: "unsure", confidence: expect.closeTo(0.8) });
  });

  it("maps a chip label back to the chip", () => {
    expect(readChip({ chip_match: choice("Offices", { Offices: 1 }) }, chips)?.value).toEqual(chips[1]);
    expect(readChip({ chip_match: choice("all", { all: 1 }) }, chips)?.value).toBe("all");
    expect(readChip({ chip_match: choice("none", { none: 1 }) }, chips)?.value).toBeNull();
  });

  it("turns goal probabilities into weights, with a second intent when it's meaningful", () => {
    const two = readGoal({ goal_intent: choice("get_more_leads", { get_more_leads: 0.6, run_outbound: 0.3, unsure: 0.1 }) });
    expect(two?.value).toEqual({
      status: "has",
      intents: [
        { id: "get_more_leads", weight: 0.6 },
        { id: "run_outbound", weight: 0.3 },
      ],
    });
    const one = readGoal({ goal_intent: choice("get_more_leads", { get_more_leads: 0.9, run_outbound: 0.05, unsure: 0.05 }) });
    expect(one?.value).toEqual({ status: "has", intents: [{ id: "get_more_leads", weight: 0.9 }] });
    expect(readGoal({ goal_intent: choice("not_covered", { not_covered: 0.95, get_more_leads: 0.05 }) })?.value).toEqual({
      status: "not_covered",
      intents: [],
    });
  });

  it("lists the profile sections a message touches", () => {
    expect(readTouched({})).toBeNull();
    const touched = readTouched({ [touchId("who-we-serve")]: yes(0.8), [touchId("tools")]: yes(0.2), [touchId("acquisition")]: yes(0.5) });
    expect(touched).toEqual(["business-overview#who-we-serve", "channels-and-tools#acquisition"]);
  });
});

describe("what to ask next", () => {
  const candidates = ["target_customer", "current_acquisition", "constraints", "tool"] as const;

  it("design 1: the likeliest candidate, unless nothing is likelier", () => {
    const answers: Answers = { next_info: choice("goal_detail", { goal_detail: 0.5, constraints: 0.3, target_customer: 0.1, nothing: 0.1 }) };
    // goal_detail isn't a candidate (already answered): the likeliest one that is.
    expect(pickNext(answers, "choice", candidates)?.value).toBe("constraints");
    const done: Answers = { next_info: choice("nothing", { nothing: 0.7, constraints: 0.2, tool: 0.1 }) };
    expect(pickNext(done, "choice", candidates)?.value).toBeNull();
  });

  it("design 2: the most valuable unknown candidate, or finish when none is worth it", () => {
    const answers: Answers = {
      known_target_customer: yes(0.9),
      value_target_customer: score(2),
      known_current_acquisition: yes(0.1),
      value_current_acquisition: score(1.2),
      known_constraints: yes(0.1),
      value_constraints: score(1.5),
      known_tool: yes(0.2),
      value_tool: score(0.5),
    };
    expect(pickNext(answers, "composite", candidates)?.value).toBe("constraints");
    const low = { ...answers, value_constraints: score(0.3), value_current_acquisition: score(0.6) };
    expect(pickNext(low, "composite", candidates)?.value).toBeNull();
  });

  it("design 2 asks a known and a value question per item", () => {
    const ids = Object.keys(nextCompositeQuestions());
    expect(ids).toContain("known_constraints");
    expect(ids).toContain("value_constraints");
    expect(ids).not.toContain("known_website");
  });

  it("says what's known, and what was just asked", () => {
    const known = { website: true, goal_detail: true, quick_win_offer: false, target_customer: false, business_model: true, current_acquisition: false, constraints: false, tool: false };
    const state = nextState({ recorded: input.recorded, known, asking: "target_customer", message: "cafés" });
    expect(state.already_known).toEqual(["goal_detail", "business_model"]);
    expect(state).toMatchObject({ just_asked: "target_customer", user_latest_message: "cafés" });
  });
});

describe("recordedFrom", () => {
  it("summarizes the entry and a line from each section", () => {
    const workspace = {
      entry: {
        ...emptyEntry,
        website: { status: "has", url: "https://acme.com" },
        goals: { status: "has", intents: [{ id: "run_outbound", weight: 1 }], inUserWords: "reach HR leaders", unmatched: null },
        tools: { email: "Gmail" },
      },
    } as Workspace;
    const docs = emptyProfileDocs() as unknown as Doc[];
    const recorded = recordedFrom(workspace, docs);
    expect(recorded).toMatchObject({ website: "has a site: https://acme.com", goal: 'Run outbound outreach "reach HR leaders"', whatTheyDo: null, tools: "email: Gmail" });
  });
});

describe("one request per turn", () => {
  const known = { website: true, goal_detail: true, quick_win_offer: false, target_customer: false, business_model: true, current_acquisition: false, constraints: false, tool: false };
  const next = { recorded: input.recorded, known, asking: "target_customer" as const, message: input.message };
  const decisions = new Set<Decision>(["answer_status", "chip_match", "goal_intent", "profile_touch"]);

  it("asks the message decisions and both next_info designs together, over one state", () => {
    const request = turnRequest({ input, decisions, next, designs: ["choice", "composite"] })!;
    const ids = Object.keys(request.questions);
    expect(ids.length).toBe(
      Object.keys(turnQuestions(input, decisions)).length + Object.keys(nextChoiceQuestions()).length + Object.keys(nextCompositeQuestions()).length,
    );
    expect(ids).toEqual(expect.arrayContaining(["answer_status", "chip_match", "next_info", "known_constraints"]));
    expect(request.state).toMatchObject({ question_on_screen: { text: input.question }, user_latest_message: "mostly cafés", not_known_yet: expect.any(Array) });
    expect(request.state).not.toHaveProperty("recorded_so_far");
  });

  it("asks only next_info for a chip tap, and nothing when there's nothing to ask", () => {
    const tap = turnRequest({ input: null, decisions, next: { ...next, message: null }, designs: ["choice"] })!;
    expect(Object.keys(tap.questions)).toEqual(["next_info"]);
    expect(tap.state).not.toHaveProperty("question_on_screen");
    expect(turnRequest({ input: null, decisions, next, designs: [] })).toBeNull();
  });
});
