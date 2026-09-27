import type { DeepPartial, UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { contextItemIds, type ContextItemId } from "@/lib/catalog/context";
import type { OnboardingUIMessage } from "./messages";
import { sentenceFilter } from "./sentences";

// One planner turn, in one structured call: what to say, what it understood
// and the biggest gap (written before choosing, so the choice follows from
// them), then the next card or null to finish. The message streams into the
// chat first; the card goes up once it's complete. Nullable, not optional: the
// repo's schemas stay OpenAI strict-mode compatible.
const card = {
  question: z.string().describe("One plain-text sentence, 15 words or fewer, ending in '?'"),
  hint: z.string().nullable().describe("One short line under the question: what answering unlocks. Null if nothing useful."),
  chips: z
    .array(z.string())
    .describe(
      "Tappable answers. For items with listed options: pick 2-4 as '<option number>. <label>'. Otherwise 2-3 short answers (1-4 words) specific to this business, in their voice.",
    ),
};

const turnFields = {
  message: z
    .string()
    .describe("What you say before the card: statements only, no question marks. Markdown allowed. Usually empty."),
  understood: z.string().describe("One sentence: what this business sells, who it wants to reach, and what it wants to grow, as far as you know"),
  gap: z
    .string()
    .describe('The one missing or too-broad thing that would most change their first deliverable or map, naming the item; "none" if nothing would'),
};

export const turnSchema = z.object({
  ...turnFields,
  next: z
    .object({
      item: z.enum(contextItemIds).describe("The registry item this card asks about"),
      ...card,
    })
    .nullable()
    .describe("The next card, or null to finish the trail"),
});

/** The turn's schema, offering only the items the next card may ask about (settled ones can't be picked). */
export const turnSchemaFor = (items: readonly ContextItemId[]) =>
  z.object({
    ...turnFields,
    next: items.length
      ? z
          .object({
            item: z.enum(items as [ContextItemId, ...ContextItemId[]]).describe("The registry item this card asks about"),
            ...card,
          })
          .nullable()
          .describe("The next card, or null to finish the trail")
      : z.null().describe("Nothing is left to ask: null"),
  });

export type Turn = z.infer<typeof turnSchema>;

const TEXT_ID = "reply";

/**
 * Streams the turn's message into the chat a sentence at a time (stray
 * questions dropped), and returns the whole turn for the card. When the turn
 * has nothing to reply to, any message the model writes anyway is dropped.
 */
export async function writeMessage(
  writer: UIMessageStreamWriter<OnboardingUIMessage>,
  result: { partialOutputStream: AsyncIterable<DeepPartial<Turn>>; output: PromiseLike<Turn> },
  { reply = true }: { reply?: boolean } = {},
) {
  const message = sentenceFilter();
  let open = false;
  let done = false;
  const write = (delta: string) => {
    if (!delta || !reply) return;
    if (!open) writer.write({ type: "text-start", id: TEXT_ID });
    open = true;
    writer.write({ type: "text-delta", id: TEXT_ID, delta });
  };
  try {
    for await (const partial of result.partialOutputStream) {
      // Fields arrive in order: once the next field starts, the message is final.
      if (done) continue;
      if (partial.understood === undefined && partial.next === undefined) write(message.push(partial.message ?? ""));
      else {
        write(message.push(partial.message ?? "", true));
        done = true;
      }
    }
    const turn = await result.output;
    if (!done) write(message.push(turn.message, true));
    return turn;
  } finally {
    // Closed even when the model fails partway, so the chat never holds an open text part.
    if (open) writer.write({ type: "text-end", id: TEXT_ID });
  }
}
