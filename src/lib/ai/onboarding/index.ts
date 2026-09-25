import { convertToModelMessages, createUIMessageStream, Output, streamText } from "ai";
import type { Workspace } from "@/lib/db/types";
import { getDocs, getPloys, getWorkspace } from "@/lib/db/workspaces";
import { runQuickWin } from "@/lib/quick-wins/run";
import { quickWinToStart, startQuickWin } from "@/lib/quick-wins/start";
import { applyEntryUpdate } from "@/lib/onboarding/set-entry";
import { readAndProfileSite } from "@/lib/site/run";
import { models } from "../models";
import { extractEntryUpdate } from "./extract";
import type { OnboardingUIMessage } from "./messages";
import { recordProfileNotes } from "./profile-notes";
import { buildSystemPrompt } from "./prompt";
import { replySchema, writeReply } from "./reply";

export type { OnboardingUIMessage } from "./messages";

/**
 * Records whatever the user's latest message answered (website, goals, business)
 * and returns the updated entry. Failures (e.g. a rate limit) are logged, not
 * thrown: the reply matters more.
 */
async function recordEntryAnswers(workspace: Workspace, messages: OnboardingUIMessage[]) {
  try {
    const update = await extractEntryUpdate(workspace.entry, messages);
    if (!update.website && !update.goals && !update.business) return workspace.entry;
    const userTurns = messages.filter((m) => m.role === "user").length;
    return (await applyEntryUpdate(workspace.id, update, { userTurns })).entry;
  } catch (error) {
    console.error("Failed to record entry answers", error);
    return workspace.entry;
  }
}

/** Starts reading their site once we have a URL we haven't read yet. */
async function readSiteIfNew(workspace: Workspace, entry: Workspace["entry"], messages: OnboardingUIMessage[]) {
  const { status, url } = entry.website;
  if (status !== "has" || !url || workspace.crawl?.url === url) return;
  const afterMessageId = messages.findLast((m) => m.role === "user")?.id ?? null;
  await readAndProfileSite({ workspaceId: workspace.id, url, afterMessageId });
}

/**
 * One Getting Started turn. The reply streams right away while the user's
 * answers are recorded in parallel. (Recording first was tried: ~1.8s slower to
 * first token with no fewer re-asks.) Returns the UI message stream plus
 * `background`, work that outlives the reply (reading their site, profile notes, the first deliverable), for the
 * caller to keep alive. Shared by the chat route and the evals.
 */
export async function onboardingTurn({
  workspaceId,
  messages,
  onSaved,
  readSite = true,
}: {
  workspaceId: string;
  messages: OnboardingUIMessage[];
  onSaved: (messages: OnboardingUIMessage[]) => Promise<void>;
  /** Off in the entry eval, whose personas have made-up websites. */
  readSite?: boolean;
}) {
  const [workspace, docs, ploys] = await Promise.all([getWorkspace(workspaceId), getDocs(workspaceId), getPloys(workspaceId)]);
  const recording = recordEntryAnswers(workspace, messages);

  // Once we know enough, the first deliverable starts in its own task ploy.
  const userTurns = messages.filter((m) => m.role === "user").length;
  const recipe = quickWinToStart({ workspace, docs, ploys, userTurns });
  const started = recipe ? await startQuickWin(workspace, recipe) : null;
  const quickWin = started ?? ploys.find((p) => p.spec?.source === "quick_win") ?? null;

  const background = Promise.all([
    recording.then((entry) => (readSite ? readSiteIfNew(workspace, entry, messages) : undefined)),
    recordProfileNotes(workspaceId, messages),
    started && runQuickWin(workspaceId, started.id),
  ]);

  const stream = createUIMessageStream<OnboardingUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const result = streamText({
        model: models.chat,
        system: buildSystemPrompt({
          workspace,
          docs,
          quickWin: quickWin && { name: quickWin.title, state: started ? "starting" : quickWin.status === "done" ? "done" : "running" },
        }),
        messages: await convertToModelMessages(messages),
        providerOptions: models.chatOptions,
        output: Output.object({ schema: replySchema }),
      });
      if (started) writer.write({ type: "data-taskStarted", data: { ployId: started.id, title: started.title } });
      const { replies } = await writeReply(writer, result);
      if (replies.length) writer.write({ type: "data-replies", data: { options: replies.slice(0, 4) } });
      writer.write({ type: "finish" });
    },
    onEnd: async ({ messages }) => {
      await recording;
      await onSaved(messages);
    },
  });
  return { stream, background };
}
