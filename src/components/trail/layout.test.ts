import { describe, expect, it } from "vitest";
import type { OnboardingUIMessage } from "@/lib/ai/onboarding/messages";
import type { Ploy } from "@/lib/db/types";
import { buildRows } from "./layout";

// A trail that's been answered to the end: the website card, answered, and nothing after.
const finished: OnboardingUIMessage[] = [
  { id: "a1", role: "assistant", parts: [{ type: "data-question", data: { slot: "website", question: "What's your website?", hint: null, chips: [], category: null, alt: null, offScript: false } }] },
  { id: "u1", role: "user", metadata: { slot: "website" }, parts: [{ type: "text", text: "acme.com" }] },
  { id: "a2", role: "assistant", parts: [{ type: "data-answered", data: { slot: "website", summary: "acme.com" } }] },
];
const building = { spec: { source: "quick_win" }, status: "running" } as Ploy;
const last = (settled: boolean, quickWin?: Ploy) => buildRows(finished, { hasRead: false, quickWin, busy: false, settled }).at(-1);

describe("the end of the trail", () => {
  it("holds You're set up until the first win and its map have landed", () => {
    expect(last(false, building)).toEqual({ kind: "settling", key: "end", building: true });
    expect(last(false)).toEqual({ kind: "settling", key: "end", building: false });
  });

  it("shows You're set up last, once everything is in", () => {
    expect(last(true, { ...building, status: "done" } as Ploy)).toEqual({ kind: "end", key: "end" });
  });

  it("shows neither while a turn is still in flight", () => {
    expect(buildRows(finished, { hasRead: false, quickWin: undefined, busy: true, settled: false }).some((r) => r.key === "end")).toBe(false);
  });
});
