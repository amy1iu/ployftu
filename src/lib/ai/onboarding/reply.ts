import type { DeepPartial, UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { contextItemIds } from "@/lib/catalog/context";
import type { OnboardingUIMessage } from "./messages";
import { sentenceFilter } from "./sentences";

// One planner turn, in one structured call: what to say, then the next card
// (which item to ask about, and its words) or null to finish. The message
// streams into the chat first; the card goes up once it's complete. Nullable,
// not optional: the repo's schemas stay OpenAI strict-mode compatible.
const card = {
  question: z.string().describe("One plain-text sentence, 15 words or fewer, ending in '?'"),
  hint: z.string().nullable().describe("One short line under the question: what answering unlocks. Null if nothing useful."),
  chips: z
    .array(z.string())
    .describe(
      "Tappable answers. For items with listed options: pick 2-4 as '<option number>. <label>'. Otherwise 2-3 short answers (1-4 words) specific to this business, in their voice.",
    ),
};

export const turnSchema = z.object({
  message: z
    .string()
    .describe("What you say before the card: statements only, no question marks. Markdown allowed. Usually empty."),
  next: z
    .object({
      item: z.enum(contextItemIds).describe("The registry item this card asks about"),
      ...card,
      alt: z
        .object(card)
        .nullable()
        .describe("A quick-win card offered alongside (chips from the quick win options), or null"),
    })
    .nullable()
    .describe("The next card, or null to finish the trail"),
});

export type Turn = z.infer<typeof turnSchema>;

const TEXT_ID = "reply";

/**
 * Streams the turn's message into the chat a sentence at a time (stray
 * questions dropped), and returns the whole turn for the card.
 */
export async function writeMessage(
  writer: UIMessageStreamWriter<OnboardingUIMessage>,
  result: { partialOutputStream: AsyncIterable<DeepPartial<Turn>>; output: PromiseLike<Turn> },
) {
  const message = sentenceFilter();
  let open = false;
  let done = false;
  const write = (delta: string) => {
    if (!delta) return;
    if (!open) writer.write({ type: "text-start", id: TEXT_ID });
    open = true;
    writer.write({ type: "text-delta", id: TEXT_ID, delta });
  };
  for await (const partial of result.partialOutputStream) {
    // Fields arrive in order: once the card starts (or is null), the message is final.
    if (done) continue;
    if (partial.next === undefined) write(message.push(partial.message ?? ""));
    else {
      write(message.push(partial.message ?? "", true));
      done = true;
    }
  }
  const turn = await result.output;
  if (!done) write(message.push(turn.message, true));
  if (open) writer.write({ type: "text-end", id: TEXT_ID });
  return turn;
}
