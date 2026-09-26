import { createUIMessageStream, Output, streamText } from "ai";
import type { Workspace } from "@/lib/db/types";
import { getDocs, getIntegrations, getMapNodes, getPloys, getWorkspace } from "@/lib/db/workspaces";
import { syncMap } from "@/lib/map/sync";
import { runQuickWin } from "@/lib/quick-wins/run";
import { quickWinToStart, startQuickWin } from "@/lib/quick-wins/start";
import { applyAnswer, type AppliedAnswer } from "@/lib/onboarding/answer";
import {
  answeredSlots,
  canRedo,
  followupChips,
  nextQuestion,
  openQuestion,
  questionFor,
  type QuestionData,
  type TrailMetadata,
} from "@/lib/onboarding/trail";
import { readAndProfileSite } from "@/lib/site/run";
import { models } from "../models";
import type { OnboardingUIMessage } from "./messages";
import { recordProfileNotes } from "./profile-notes";
import { buildTrailPrompt } from "./prompt";
import { replySchema, writeMessage } from "./reply";

export type { OnboardingUIMessage } from "./messages";

/** Starts reading their site once we have a URL we haven't read yet. */
async function readSiteIfNew(workspace: Workspace, messages: OnboardingUIMessage[]) {
  const { status, url } = workspace.entry.website;
  if (status !== "has" || !url || workspace.crawl?.url === url) return;
  const afterMessageId = messages.findLast((m) => m.role === "user")?.id ?? null;
  await readAndProfileSite({ workspaceId: workspace.id, url, afterMessageId });
}

const loadState = (workspaceId: string) =>
  Promise.all([
    getWorkspace(workspaceId),
    getDocs(workspaceId),
    getPloys(workspaceId),
    getMapNodes(workspaceId),
    getIntegrations(workspaceId),
  ]);

/**
 * One step of the Getting Started trail: record the user's answer to the card
 * on screen, start the first deliverable if it's time, and put up the next
 * card. Tapped chips need no model call, so most steps are near-instant; the
 * model only writes the follow-up (specific to their business) and replies to
 * anything off-script. Returns the UI message stream plus `background`, work
 * that outlives the step (reading their site, growing the map, the first
 * deliverable), for the caller to keep alive. Shared by the chat route and the evals.
 */
export async function onboardingTurn({
  workspaceId,
  messages,
  onSaved,
  sideEffects = true,
}: {
  workspaceId: string;
  messages: OnboardingUIMessage[];
  onSaved: (messages: OnboardingUIMessage[]) => Promise<void>;
  /** Reading their site and growing the map. Off in the entry eval, whose personas have made-up websites. */
  sideEffects?: boolean;
}) {
  const latest = messages.at(-1)?.role === "user" ? messages.at(-1)! : null;
  // Usually the card on screen; or, when they change an earlier answer, the question that asked for it.
  const meta = (latest?.metadata ?? {}) as TrailMetadata;
  const asked = meta.redo && meta.slot && canRedo(meta.slot) ? questionFor(messages, meta.slot) : openQuestion(messages);
  const userTurns = messages.filter((m) => m.role === "user").length;

  const before = await getWorkspace(workspaceId);
  const answer: AppliedAnswer | null =
    latest && asked ? await applyAnswer({ workspace: before, asked, message: latest, messages, userTurns }) : null;

  // Read what the answer changed.
  const [workspace, docs, ploys, mapNodes, integrations] = await loadState(workspaceId);
  const answered = new Set(answeredSlots(messages));
  if (answer?.slot) answered.add(answer.slot);

  // The first deliverable: the quick win they picked, or ours once we know enough.
  const recipe = answer?.quickWin ?? quickWinToStart({ workspace, docs, ploys, answered });
  const started = recipe ? await startQuickWin(workspace, recipe, { picked: !!answer?.quickWin }) : null;
  const next = nextQuestion({ workspace, docs, ploys: started ? [...ploys, started] : ploys, mapNodes, integrations, answered });

  const background = Promise.all([
    sideEffects && syncMap(workspaceId),
    sideEffects && readSiteIfNew(workspace, messages),
    latest && recordProfileNotes(workspaceId, messages),
    started && runQuickWin(workspaceId, started.id),
  ]);

  const said = latest && {
    open: !!asked,
    answered: !!answer?.slot,
    offScript: answer?.offScript ?? null,
    problems: answer?.problems ?? [],
  };
  // The model writes only what the code can't: a reply to what they said, or the follow-up.
  const needsWords = (!!said && (!said.answered || !!said.offScript)) || (!!next && (!next.question || !next.chips));

  const stream = createUIMessageStream<OnboardingUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      if (answer?.slot && answer.summary)
        writer.write({ type: "data-answered", data: { slot: answer.slot, summary: answer.summary } });
      if (started) writer.write({ type: "data-taskStarted", data: { ployId: started.id, title: started.title } });

      const words = needsWords
        ? await writeMessage(
            writer,
            streamText({
              model: models.chat,
              system: buildTrailPrompt({ workspace, docs, next, said }),
              messages: [{ role: "user", content: latest ? `The user's latest message: "${latestText(latest)}"` : "Begin." }],
              providerOptions: models.chatOptions,
              output: Output.object({ schema: replySchema }),
            }),
          )
        : null;

      if (next) {
        const question: QuestionData = {
          slot: next.slot,
          hint: next.hint,
          category: next.category,
          alt: next.alt,
          question: next.question ?? words?.question ?? "Who are your best customers?",
          chips: next.chips ?? followupChips(words?.replies ?? []),
          offScript: !!said?.offScript,
        };
        writer.write({ type: "data-question", data: question });
      }
      writer.write({ type: "finish" });
    },
    onEnd: async ({ messages }) => {
      await onSaved(messages);
    },
  });
  return { stream, background };
}

const latestText = (message: OnboardingUIMessage) =>
  message.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
