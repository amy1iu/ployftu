import { createUIMessageStream, Output, streamText } from "ai";
import { quickWins } from "@/lib/catalog/quick-wins";
import { logEvent } from "@/lib/db/events";
import type { Ploy, Workspace } from "@/lib/db/types";
import { getDocs, getIntegrations, getMapNodes, getPloys, getWorkspace } from "@/lib/db/workspaces";
import { syncMap } from "@/lib/map/sync";
import { runQuickWin } from "@/lib/quick-wins/run";
import { quickWinToStart, startQuickWin } from "@/lib/quick-wins/start";
import { applyAnswer, type AppliedAnswer } from "@/lib/onboarding/answer";
import { upgradeTrail } from "@/lib/onboarding/legacy";
import {
  answeredSlots,
  fallbackCard,
  nextQuestion,
  openQuestion,
  quickWinReady,
  toQuestion,
  upcomingQuickWin,
  type TrailState,
} from "@/lib/onboarding/trail";
import { readAndProfileSite, siteSettled } from "@/lib/site/run";
import { models } from "../models";
import type { OnboardingUIMessage } from "./messages";
import { recordProfileNotes } from "./profile-notes";
import { askableItems, buildTrailPrompt, hasReply } from "./prompt";
import { turnSchemaFor, writeMessage, type Turn } from "./reply";

/** Past this the planner is abandoned and code puts up the card (p95 is ~3s). PLANNER_TIMEOUT_MS overrides it. */
const plannerTimeoutMs = () => Number(process.env.PLANNER_TIMEOUT_MS ?? 8000);

/** Realtime delivers new map rows a little after this stream would deliver the card. */
const REALTIME_BEAT_MS = 600;

/** How long the next card waits for this answer's tasks to reach the map (usually under a second after planning). */
const mapWaitMs = () => Number(process.env.MAP_WAIT_MS ?? 5000);

/** How long the card after the website waits for their site to be read (usually 15-20s). SITE_WAIT_MS overrides it. */
const siteWaitMs = () => Number(process.env.SITE_WAIT_MS ?? 20000);

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
 * card. Tapped chips are recorded without a model; the next card is planned
 * by the chat model in one structured call (which item to ask about, its
 * words, or finish), streaming its message first. Only the website card (always
 * first) and the cap are code's. Returns the UI message stream plus
 * `background`, work that outlives the step (reading their site, growing the
 * map, the first deliverable), for the caller to keep alive. Shared by the chat
 * route and the evals.
 */
export async function onboardingTurn({
  workspaceId,
  messages: saved,
  onSaved,
  sideEffects = true,
}: {
  workspaceId: string;
  messages: OnboardingUIMessage[];
  onSaved: (messages: OnboardingUIMessage[]) => Promise<void>;
  /** Reading their site and growing the map. Off in the entry eval, whose personas have made-up websites. */
  sideEffects?: boolean;
}) {
  // Conversations saved by an earlier version name their cards differently.
  const messages = upgradeTrail(saved);
  const latest = messages.at(-1)?.role === "user" ? messages.at(-1)! : null;
  // The card on screen, which their message answers.
  const asked = openQuestion(messages);
  const userTurns = messages.filter((m) => m.role === "user").length;

  const before = await getWorkspace(workspaceId);
  // An answer that fails to record (the extractor or the database) isn't the end
  // of the turn: it counts as not answered, and the card comes back.
  const answer: AppliedAnswer | null =
    latest && asked
      ? await applyAnswer({ workspace: before, asked, message: latest, messages, userTurns }).catch(async (error) => {
          console.error("Failed to record an answer", error);
          await logEvent(workspaceId, "turn_error", { stage: "answer", slot: asked.slot, error: String(error).slice(0, 200) });
          return { slot: null, summary: null, offScript: null, quickWin: null, problems: ["It didn't save on our side."] };
        })
      : null;

  // Their site: start reading it now if it's new, and plan the next card from
  // it rather than a guess (the wait is below, inside the stream).
  const afterAnswer = await getWorkspace(workspaceId);
  const siteRead = sideEffects ? readSiteIfNew(afterAnswer, messages) : null;
  const siteUrl = afterAnswer.entry.website.status === "has" ? afterAnswer.entry.website.url : null;
  const siteDone = afterAnswer.crawl?.url === siteUrl && (afterAnswer.crawl?.status === "done" || afterAnswer.crawl?.status === "failed");
  const waitForSite = sideEffects && !!siteUrl && !siteDone;

  // The tasks this answer reveals: started now, alongside planning, and waited
  // for before the next card, so things land in order (answer, tasks, card).
  const mapSync = sideEffects ? syncMap(workspaceId) : null;

  // Work that outlives the turn. The first deliverable is only known once the
  // stream has decided it, so its run hangs off a promise the stream always settles.
  let settleTurn: (started: Ploy | null) => void = () => {};
  const turnDone = new Promise<Ploy | null>((resolve) => (settleTurn = resolve));
  const background = Promise.all([
    mapSync,
    siteRead,
    latest && recordProfileNotes(workspaceId, messages),
    turnDone.then((started) => started && runQuickWin(workspaceId, started.id)),
  ]);

  const said = latest && {
    open: !!asked,
    answered: !!answer?.slot,
    offScript: answer?.offScript ?? null,
    problems: answer?.problems ?? [],
  };

  const stream = createUIMessageStream<OnboardingUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      let started: Ploy | null = null;
      try {
        writer.write({ type: "start" });
        // Their answer lands right away; the next card may wait on their site.
        if (answer?.slot && answer.summary)
          writer.write({ type: "data-answered", data: { slot: answer.slot, summary: answer.summary } });
        if (waitForSite && siteUrl) await siteSettled(workspaceId, siteUrl, siteWaitMs()).catch(() => false);

        // Read what the answer (and their site) changed.
        const [workspace, docs, ploys, mapNodes, integrations] = await loadState(workspaceId);
        const answered = new Set(answeredSlots(messages));
        if (answer?.slot) answered.add(answer.slot);

        // The first deliverable: the quick win they picked, or ours once we know enough.
        // A quick win they picked starts unless one is already running, or (from a
        // stale card) it isn't ready: only ready ones are offered.
        const running = ploys.some((p) => p.spec?.source === "quick_win");
        const picked = !running && answer?.quickWin && quickWinReady(answer.quickWin, { workspace, docs }) ? answer.quickWin : null;
        const recipe = picked || quickWinToStart({ workspace, docs, ploys, answered });
        // One that fails to start is skipped this turn; the next turn tries again.
        started = recipe
          ? await startQuickWin(workspace, recipe, { picked: !!picked }).catch(async (error) => {
              console.error("Failed to start a quick win", error);
              await logEvent(workspaceId, "turn_error", { stage: "quick_win", recipe, error: String(error).slice(0, 200) });
              return null;
            })
          : null;
        if (started) writer.write({ type: "data-taskStarted", data: { ployId: started.id, title: started.title } });
        // A first deliverable just started goes on the map too (a second sync, queued after the first).
        const mapReady = sideEffects ? (started ? syncMap(workspaceId) : mapSync) : null;
        const state: TrailState = { workspace, docs, ploys: started ? [...ploys, started] : ploys, mapNodes, integrations, answered };
        const next = nextQuestion(state);

        // The model plans every card but the website; around that card and at the cap it only replies, when there's something to reply to.
        const planning = next === "plan";
        const reply = hasReply(said);
        let turn: Turn | null = null;
        let plannerFailed = false;
        if (planning || reply) {
          try {
            turn = await writeMessage(
              writer,
              streamText({
                model: models.planner,
                system: buildTrailPrompt({ state, docs, messages, said, planning }),
                messages: [{ role: "user", content: latest ? `The user's latest message: "${latestText(latest)}"` : "Begin." }],
                providerOptions: models.plannerOptions,
                output: Output.object({ schema: turnSchemaFor(askableItems(state, messages)) }),
                abortSignal: AbortSignal.timeout(plannerTimeoutMs()),
              }),
              { reply },
            );
          } catch (error) {
            // The planner failed or ran past its time: code puts up the card instead.
            plannerFailed = true;
            console.error("Planner failed", error);
            await logEvent(workspaceId, "turn_error", { stage: "planner", error: String(error).slice(0, 200) });
          }
        }

        // Without the planner: the same card again if this answer didn't land, else the next open item.
        const fallback = plannerFailed ? (asked && !answer?.slot ? asked : fallbackCard(state)) : null;
        if (plannerFailed && said && !said.answered) {
          writer.write({ type: "text-start", id: "fallback" });
          writer.write({ type: "text-delta", id: "fallback", delta: "Sorry, that didn't go through. Could you answer again?" });
          writer.write({ type: "text-end", id: "fallback" });
        }
        const question = plannerFailed ? (planning ? fallback : next) : planning ? toQuestion(turn?.next ?? null, state) : next;
        // A card code couldn't serve (e.g. a second quick win) finishes the trail instead; count how often.
        if (planning && turn?.next && !question) {
          console.warn(`Planner card dropped: ${turn.next.item}`);
          await logEvent(workspaceId, "planner_card_dropped", { item: turn.next.item });
        }
        // Their tasks land before the next card (or the end of the trail); a slow sync doesn't hold it for long.
        // New tasks reach the page over Realtime, a beat behind this stream, so the card waits that beat too.
        const added = mapReady ? await Promise.race([mapReady, new Promise<number>((r) => setTimeout(() => r(0), mapWaitMs()))]) : 0;
        if (added) await new Promise((r) => setTimeout(r, REALTIME_BEAT_MS));
        if (question) {
          // Say up front when this answer will start their first deliverable.
          const upcoming = upcomingQuickWin(question.slot, state);
          const unlocks = upcoming ? quickWins[upcoming].builds : null;
          writer.write({ type: "data-question", data: { ...question, unlocks, offScript: !!said?.offScript } });
        }
        writer.write({ type: "finish" });
      } finally {
        settleTurn(started);
      }
    },
    onEnd: async ({ messages }) => {
      await onSaved(messages);
    },
  });
  return { stream, background };
}

const latestText = (message: OnboardingUIMessage) =>
  message.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
