import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { upgradeSlot, upgradeTrail } from "./legacy";
import { answeredSlots, openQuestion } from "./trail";

const ask = (slot: string, alt: { slot: string } | null = null): UIMessage => ({
  id: `ask-${slot}`,
  role: "assistant",
  parts: [{ type: "data-question", data: { slot, question: "?", hint: null, chips: [], category: null, alt, offScript: false } }],
});
const answered = (slot: string): UIMessage => ({ id: `ans-${slot}`, role: "assistant", parts: [{ type: "data-answered", data: { slot, summary: "x" } }] });

describe("upgradeTrail", () => {
  it("renames the old trail's slots to registry ids", () => {
    expect(["sell", "followup", "goal", "quick_win", "fork", "website", "tool"].map(upgradeSlot)).toEqual([
      "business_model",
      "target_customer",
      "goal_detail",
      "quick_win_offer",
      "goal_detail",
      "website",
      "tool",
    ]);
    expect(upgradeSlot("nonsense")).toBeUndefined();
  });

  it("makes an old conversation readable: the fork, its answer, and the open card", () => {
    const old = [ask("fork", { slot: "quick_win" }), { id: "u", role: "user", metadata: { slot: "quick_win", value: "homepage_audit" }, parts: [] } as UIMessage, answered("quick_win"), ask("followup")];
    const upgraded = upgradeTrail(old);
    expect(answeredSlots(upgraded)).toEqual(new Set(["quick_win_offer"]));
    expect(openQuestion(upgraded)?.slot).toBe("target_customer");
    expect(upgraded[0].parts[0]).toMatchObject({ data: { slot: "goal_detail", alt: { slot: "quick_win_offer" } } });
    expect(upgraded[1].metadata).toEqual({ slot: "quick_win_offer", value: "homepage_audit" });
  });

  it("drops a user message's slot it can't place, and leaves new conversations as they are", () => {
    const [user] = upgradeTrail([{ id: "u", role: "user", metadata: { slot: "mystery" }, parts: [] } as UIMessage]);
    expect(user.metadata).toEqual({ slot: undefined });
    const current = [ask("target_customer"), answered("goal_detail")];
    expect(upgradeTrail(current)).toEqual(current);
  });
});
