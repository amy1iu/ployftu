import type { DeepPartial, UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { OnboardingUIMessage } from "./messages";
import { cleanQuestion, sentenceFilter } from "./sentences";

// Replies are structured so the format holds on any model: statements, then
// exactly one bolded question at the end, then reply chips.
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
 * Streams a structured reply into the chat as it's generated: the message a
 * sentence at a time (stray questions dropped), then the bold question once
 * it's complete. Returns the full reply so the caller can add the chips.
 */
export async function writeReply(
  writer: UIMessageStreamWriter<OnboardingUIMessage>,
  result: { partialOutputStream: AsyncIterable<DeepPartial<Reply>>; output: PromiseLike<Reply> },
) {
  const message = sentenceFilter();
  let wrote = false;
  let messageDone = false;
  let questionDone = false;
  const write = (delta: string) => {
    if (!delta) return;
    writer.write({ type: "text-delta", id: TEXT_ID, delta });
    wrote = true;
  };
  const finishMessage = (text: string) => {
    if (messageDone) return;
    write(message.push(text, true));
    messageDone = true;
  };
  const writeQuestion = (question: string | undefined) => {
    const text = cleanQuestion(question ?? "");
    if (questionDone || !text) return;
    write(`${wrote ? "\n\n" : ""}**${text}**`);
    questionDone = true;
  };

  writer.write({ type: "start" });
  writer.write({ type: "text-start", id: TEXT_ID });
  for await (const partial of result.partialOutputStream) {
    // Fields arrive in order: once the question starts the message is final,
    // and once the chips start the question is.
    if (partial.question === undefined) write(message.push(partial.message ?? ""));
    else finishMessage(partial.message ?? "");
    if (partial.replies) writeQuestion(partial.question);
  }
  const reply = await result.output;
  finishMessage(reply.message);
  writeQuestion(reply.question);
  writer.write({ type: "text-end", id: TEXT_ID });
  return reply;
}
