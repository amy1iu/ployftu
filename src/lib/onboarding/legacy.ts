import type { UIMessage } from "ai";
import { contextItemIds, type ContextItemId } from "@/lib/catalog/context";

// Getting Started conversations saved before the context registry name their
// cards by the old fixed-order slots. The trail reads registry ids only, so an
// old conversation is renamed on the way in: where the chat is seeded, and at
// the start of every turn (the database keeps what was saved).

const renamed: Record<string, ContextItemId> = {
  sell: "business_model",
  followup: "target_customer",
  goal: "goal_detail",
  quick_win: "quick_win_offer",
  // The fork asked for a goal, with a quick win beside it.
  fork: "goal_detail",
};

/** A slot as the registry names it, or undefined when it isn't one the trail knows. */
export function upgradeSlot(slot: unknown): ContextItemId | undefined {
  if (typeof slot !== "string") return undefined;
  const id = renamed[slot] ?? slot;
  return (contextItemIds as readonly string[]).includes(id) ? (id as ContextItemId) : undefined;
}

type Card = { slot?: unknown; alt?: { slot?: unknown } | null };

/**
 * The conversation with every card, answer, and user message named by
 * registry ids. A user message whose card it can't place loses its slot, and
 * then answers whatever card is on screen.
 */
export function upgradeTrail<M extends UIMessage>(messages: M[]): M[] {
  return messages.map((message) => {
    const meta = message.metadata as { slot?: unknown } | undefined;
    return {
      ...message,
      ...(meta?.slot !== undefined ? { metadata: { ...meta, slot: upgradeSlot(meta.slot) } } : {}),
      parts: message.parts.map((part) => {
        if (part.type !== "data-question" && part.type !== "data-answered") return part;
        const data = (part as { data: Card }).data;
        const alt = data.alt && { ...data.alt, slot: upgradeSlot(data.alt.slot) ?? data.alt.slot };
        return { ...part, data: { ...data, slot: upgradeSlot(data.slot) ?? data.slot, ...(data.alt !== undefined ? { alt } : {}) } };
      }),
    };
  });
}
