import type { DeepPartial, UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { OnboardingUIMessage } from "./messages";
import { cleanQuestion, sentenceFilter } from "./sentences";

// Replies are structured so the format holds on any model: statements, then
// one question, then reply chips. On the trail, the statements stream into the
// chat and the question and chips go on the question card.
export const replySchema = z.object({
  message: z
    .string()
    .describe("What you say before your question: statements only, no question marks. Markdown allowed. Can be empty."),
  question: z.string().describe("Your one question to the user: a single plain-text sentence ending in '?'"),
  replies: z
    .array(z.string())
    .describe("2-4 short answers (2-6 words) the user could tap, in their voice. Empty if nothing fits."),
});

export type Reply = z.infer<typeof replySchema>;

const TEXT_ID = "reply";

/**
 * Streams the reply's message into the chat a sentence at a time (stray
 * questions dropped), and returns the whole reply for the question card.
 */
export async function writeMessage(
  writer: UIMessageStreamWriter<OnboardingUIMessage>,
  result: { partialOutputStream: AsyncIterable<DeepPartial<Reply>>; output: PromiseLike<Reply> },
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
    // Fields arrive in order: once the question starts, the message is final.
    if (done) continue;
    if (partial.question === undefined) write(message.push(partial.message ?? ""));
    else {
      write(message.push(partial.message ?? "", true));
      done = true;
    }
  }
  const reply = await result.output;
  if (!done) write(message.push(reply.message, true));
  if (open) writer.write({ type: "text-end", id: TEXT_ID });
  return { ...reply, question: cleanQuestion(reply.question) };
}
