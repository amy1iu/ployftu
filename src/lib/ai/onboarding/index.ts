import { createUIMessageStream, Output, streamText } from "ai";
import type { Workspace } from "@/lib/db/types";
import { logEvent } from "@/lib/db/events";
import { getDocs, getIntegrations, getMapNodes, getPloys, getWorkspace } from "@/lib/db/workspaces";
import { syncMap } from "@/lib/map/sync";
import { runQuickWin } from "@/lib/quick-wins/run";
import { quickWinToStart, startQuickWin } from "@/lib/quick-wins/start";
import { knownItems, type ContextItemId } from "@/lib/catalog/context";
import { normalizeUrl } from "@/lib/onboarding/entry";
import { applyAnswer, type AppliedAnswer } from "@/lib/onboarding/answer";
import {
  decisionIds,
  nextQuestions,
  nextState,
  pickNext,
  readChip,
  readGoal,
  readStatus,
  readTouched,
  readWebsite,
  recordedFrom,
  chipsOf,
  turnQuestions,
  turnState,
  type Decision,
  type NextDesign,
  type TurnInput,
} from "@/lib/onboarding/decisions";
import {
  answeredSlots,
  askable,
  canRedo,
  followupChips,
  isFork,
  nextQuestion,
  openQuestion,
  questionFor,
  slotOf,
  type NextQuestion,
  type QuestionData,
  type TrailMetadata,
  type TrailState,
} from "@/lib/onboarding/trail";
import { readAndProfileSite } from "@/lib/site/run";
import { ask, jevDecisions, jevShadow, nextDesign, type Asked } from "../jev";
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
  const redo = meta.redo && meta.slot && canRedo(slotOf(meta.slot));
  const asked = redo ? questionFor(messages, slotOf(meta.slot!)) : openQuestion(messages);
  const userTurns = messages.filter((m) => m.role === "user").length;

  // Jev's decisions (see ai/jev.ts): switched on one by one, or asked in shadow.
  // Both calls start now, in parallel with today's path.
  const decisions = jevDecisions();
  const shadow = jevShadow();
  const jev = decisions.size > 0 || shadow ? await startDecisions({ workspaceId, messages, latest, asked, decisions, shadow }) : null;
  const before = jev?.workspace ?? (await getWorkspace(workspaceId));
  const answer: AppliedAnswer | null =
    latest && asked
      ? await applyAnswer({
          workspace: before,
          asked,
          message: latest,
          messages,
          userTurns,
          decided: jev?.turn ? { answers: jev.turn.then((r) => r?.answers ?? null), decisions } : null,
        })
      : null;

  // Read what the answer changed.
  const [workspace, docs, ploys, mapNodes, integrations] = await loadState(workspaceId);
  const answered = new Set(answeredSlots(messages));
  if (answer?.slot) answered.add(answer.slot);

  // The first deliverable: the quick win they picked, or ours once we know enough.
  const recipe = answer?.quickWin ?? quickWinToStart({ workspace, docs, ploys, answered });
  const started = recipe ? await startQuickWin(workspace, recipe, { picked: !!answer?.quickWin }) : null;
  const trail: TrailState = { workspace, docs, ploys: started ? [...ploys, started] : ploys, mapNodes, integrations, answered };

  // What to ask next: the fixed order, or (next_info) Jev's pick among what's still askable.
  const design = nextDesign();
  const plan = decisions.has("next_info") ? await planNext(jev, design, { asked, answer, trail }) : undefined;
  const next = nextQuestion(trail, plan);

  const notes = !latest
    ? null
    : !decisions.has("profile_touch")
      ? recordProfileNotes(workspaceId, messages)
      : // Only when Jev says the message has facts for a section, and only for those. Chips are recorded exactly already.
        jev?.turn?.then((r) => {
          const touched = r ? readTouched(r.answers) : null;
          return touched === null ? recordProfileNotes(workspaceId, messages) : recordProfileNotes(workspaceId, messages, { sections: touched });
        });

  const background = Promise.all([
    sideEffects && syncMap(workspaceId),
    sideEffects && readSiteIfNew(workspace, messages),
    notes,
    started && runQuickWin(workspaceId, started.id),
    jev?.turn?.then((r) => r?.logged),
    jev?.next.then((r) => Promise.all(Object.values(r).map((x) => x?.logged))),
    shadow && jev && logShadow(workspaceId, jev, { asked, answer, trail, next, design }),
  ]);

  const said = latest && {
    open: !!asked,
    answered: !!answer?.slot,
    offScript: answer?.offScript ?? null,
    problems: answer?.problems ?? [],
    confirm: answer?.confirm ?? null,
  };
  // The model writes only what the code can't: a reply to what they said, or the follow-up.
  const needsWords = (!!said && (!said.answered || !!said.offScript || !!said.confirm)) || (!!next && (!next.question || !next.chips));

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

// ── Jev ────────────────────────────────────────────────────────────────────

type Started = {
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  /** Decisions about the typed message; null for chip taps and bare URLs, which need none. */
  turn: Promise<(Asked & { logged: Promise<void> }) | null> | null;
  input: TurnInput | null;
  /** next_info, per design. */
  next: Promise<Partial<Record<NextDesign, (Asked & { logged: Promise<void> }) | null>>>;
  known: Record<ContextItemId, boolean>;
};

/**
 * Starts this turn's Jev calls from the state before the answer lands: one
 * about the typed message (small state: the card, the message, a line of
 * what's recorded), one about what to ask next (what's known). Two calls, not
 * one, because Jev gets distracted by state a question doesn't need.
 */
async function startDecisions({
  workspaceId,
  messages,
  latest,
  asked,
  decisions,
  shadow,
}: {
  workspaceId: string;
  messages: OnboardingUIMessage[];
  latest: OnboardingUIMessage | null;
  asked: QuestionData | null;
  decisions: ReadonlySet<Decision>;
  shadow: boolean;
}): Promise<Started> {
  const [workspace, docs, ploys, integrations] = await Promise.all([
    getWorkspace(workspaceId),
    getDocs(workspaceId),
    getPloys(workspaceId),
    getIntegrations(workspaceId),
  ]);
  const recorded = recordedFrom(workspace, docs);
  const known = knownItems({ workspace, docs, ploys, integrations });
  const message = latest ? latestText(latest) : "";
  const meta = (latest?.metadata ?? {}) as TrailMetadata;
  const tapped = meta.value !== undefined && !!asked && chipsOf(asked).some((c) => c.value === meta.value);

  // The message decisions in play: all of them in shadow, else the ones switched on.
  const inPlay = new Set<Decision>((shadow ? decisionIds : [...decisions]).filter((d) => d !== "next_info"));
  const previous = messages.findLast((m) => m.role === "assistant");
  const input: TurnInput | null =
    // Chip taps and a bare URL for the website are read exactly, with no model.
    latest && asked && !tapped && message && !(asked.slot === "website" && normalizeUrl(message))
      ? {
          item: asked.slot,
          question: asked.question,
          chips: asked.chips,
          alt: asked.alt && { question: asked.alt.question, chips: asked.alt.chips },
          previous: previous ? previous.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim() || null : null,
          message,
          recorded,
        }
      : null;
  const turn = input && inPlay.size ? ask(turnState(input), turnQuestions(input, inPlay), { workspaceId, label: "turn" }) : null;

  const designs: NextDesign[] = shadow ? ["choice", "composite"] : decisions.has("next_info") ? [nextDesign()] : [];
  const state = nextState({ recorded, known, asking: asked?.slot ?? null, message: latest ? message : null });
  const next = Promise.all(
    designs.map(async (d) => [d, asked ? await ask(state, nextQuestions(d), { workspaceId, label: `next_${d}` }) : null] as const),
  ).then((pairs) => Object.fromEntries(pairs));
  return { workspace, turn, input, next, known };
}

/**
 * Jev's pick for the next question, as a plan for nextQuestion: the same card
 * again when this message didn't answer it, nothing once the trail is over, or
 * undefined (the fixed order) when Jev didn't answer in time.
 */
async function planNext(
  jev: Started | null,
  design: NextDesign,
  { asked, answer, trail }: { asked: QuestionData | null; answer: AppliedAnswer | null; trail: TrailState },
): Promise<{ item: ContextItemId | null } | undefined> {
  if (!asked) return { item: null }; // the trail is done; they're chatting
  if (!answer?.slot) return { item: asked.slot };
  const result = (await jev?.next)?.[design];
  const pick = result && pickNext(result.answers, design, askable(trail));
  return pick ? { item: pick.value } : undefined;
}

/** Shadow mode: what Jev would have decided next to what today's path did, in one event. */
async function logShadow(
  workspaceId: string,
  jev: Started,
  {
    asked,
    answer,
    trail,
    next,
    design,
  }: { asked: QuestionData | null; answer: AppliedAnswer | null; trail: TrailState; next: NextQuestion | null; design: NextDesign },
) {
  const [turn, nexts] = await Promise.all([jev.turn, jev.next]);
  const answers = turn?.answers ?? {};
  const chips = asked ? chipsOf(asked) : [];
  const chip = readChip(answers, chips);
  const goal = readGoal(answers);
  const candidates = askable(trail);
  const fixed = nextQuestion(trail);
  await logEvent(workspaceId, "jev_shadow", {
    slot: asked?.slot ?? null,
    typed: !!jev.input,
    today: {
      answered: answer?.slot ?? null,
      summary: answer?.summary ?? null,
      offScript: !!answer?.offScript,
      quickWin: answer?.quickWin ?? null,
      next: fixed ? fixed.slot : null,
      shown: next ? next.slot : null,
    },
    jev: {
      ms: turn?.ms ?? null,
      status: readStatus(answers),
      chip: chip && { value: chip.value === "all" ? "all" : (chip.value?.label ?? null), confidence: chip.confidence },
      website: readWebsite(answers),
      goal,
      touched: readTouched(answers),
      next: Object.fromEntries(
        Object.entries(nexts).map(([d, r]) => [d, r ? { pick: pickNext(r.answers, d as NextDesign, candidates), ms: r.ms } : null]),
      ),
      design,
    },
    fork: asked ? isFork(asked) : false,
  });
}
