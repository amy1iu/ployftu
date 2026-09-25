import { convertToModelMessages, createUIMessageStream, Output, streamText } from "ai";
import type { Workspace } from "@/lib/db/types";
import { getDocs, getWorkspace } from "@/lib/db/workspaces";
import { applyEntryUpdate } from "@/lib/onboarding/set-entry";
import { models } from "../models";
import { extractEntryUpdate } from "./extract";
import type { OnboardingUIMessage } from "./messages";
import { buildSystemPrompt } from "./prompt";
import { replySchema, writeReply } from "./reply";

export type { OnboardingUIMessage } from "./messages";

/**
 * Records whatever the user's latest message answered (website, goals, business).
 * Failures (e.g. a rate limit) are logged, not thrown: the reply matters more.
 */
async function recordEntryAnswers(workspace: Workspace, messages: OnboardingUIMessage[]) {
  try {
    const update = await extractEntryUpdate(workspace.entry, messages);
    if (!update.website && !update.goals && !update.business) return;
    const userTurns = messages.filter((m) => m.role === "user").length;
    await applyEntryUpdate(workspace.id, update, { userTurns });
  } catch (error) {
    console.error("Failed to record entry answers", error);
  }
}

/**
 * One Getting Started turn, as a UI message stream. The reply streams right
 * away while the user's answers are recorded in parallel. (Recording first was
 * tried: ~1.8s slower to first token with no fewer re-asks.) Shared by the chat
 * route and the evals.
 */
export async function onboardingTurn({
  workspaceId,
  messages,
  onSaved,
}: {
  workspaceId: string;
  messages: OnboardingUIMessage[];
  onSaved: (messages: OnboardingUIMessage[]) => Promise<void>;
}) {
  const [workspace, docs] = await Promise.all([getWorkspace(workspaceId), getDocs(workspaceId)]);
  const recording = recordEntryAnswers(workspace, messages);

  return createUIMessageStream<OnboardingUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const result = streamText({
        model: models.chat,
        system: buildSystemPrompt({ workspace, docs }),
        messages: await convertToModelMessages(messages),
        providerOptions: models.chatOptions,
        output: Output.object({ schema: replySchema }),
      });
      const { replies } = await writeReply(writer, result);
      if (replies.length) writer.write({ type: "data-replies", data: { options: replies.slice(0, 4) } });
      writer.write({ type: "finish" });
    },
    onEnd: async ({ messages }) => {
      await recording;
      await onSaved(messages);
    },
  });
}
