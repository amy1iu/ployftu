// Getting Started trail eval. Runs every persona through the real trail
// pipeline against a throwaway workspace, with an LLM playing the user (tapping
// chips or typing, as the persona would), then scores how quickly and
// accurately it matched their intent to the right capability.
//
//   npm run eval:entry                 all personas
//   npm run eval:entry -- a_terse d_*  filter by id (prefix* supported)
//   npm run eval:entry -- --keep       keep eval workspaces for inspection

import { mkdir, writeFile } from "node:fs/promises";
import { generateText, Output, readUIMessageStream, type UIMessageChunk } from "ai";
import { z } from "zod";
import { onboardingTurn, type OnboardingUIMessage } from "@/lib/ai/onboarding";
import { getSpec } from "@/lib/catalog";
import { contextItemIds, contextItems, type ContextItemId, type ContextState } from "@/lib/catalog/context";
import { getIntent, type IntentId } from "@/lib/catalog/intents";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import { createWorkspace, getDocs, getIntegrations, getMapNodes, getPloys, getWorkspace } from "@/lib/db/workspaces";
import { readSection } from "@/lib/docs/markdown";
import { syncMap } from "@/lib/map/sync";
import { entryBranch } from "@/lib/onboarding/entry";
import { greetingMessage } from "@/lib/onboarding/greeting";
import { answeredSlots, openQuestion, type AnsweredData, type AnsweredSlot, type QuestionData } from "@/lib/onboarding/trail";
import { db } from "@/lib/supabase/admin";
import { personas, type Persona } from "./personas";

const MAX_USER_TURNS = 8;
const CONCURRENCY = 4;
const simulatorModel = process.env.EVAL_SIMULATOR_MODEL ?? "openai/gpt-4o";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const filters = args.filter((a) => !a.startsWith("--"));
const selected = filters.length
  ? personas.filter((p) => filters.some((f) => (f.endsWith("*") ? p.id.startsWith(f.slice(0, -1)) : p.id === f)))
  : personas;

const part = <T,>(m: OnboardingUIMessage, type: string) =>
  (m.parts.find((p) => p.type === type) as { data: T } | undefined)?.data;
const text = (m: OnboardingUIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
const card = (q: { question: string; chips: { label: string }[] }) =>
  `${q.question}${q.chips.length ? ` [chips: ${q.chips.map((c) => c.label).join(" | ")}]` : " [type an answer]"}`;

/** The trail as the simulated user sees it. */
function transcript(messages: OnboardingUIMessage[]) {
  return messages
    .map((m) => {
      if (m.role === "user") return `You: ${text(m)}`;
      const q = part<QuestionData>(m, "data-question");
      const lines = [text(m) && `Ploy: ${text(m)}`];
      if (q?.alt)
        lines.push(`Ploy shows two cards. Quick win: ${card(q.alt)}  OR  ${q.slot === "goal_detail" ? "Bigger goal" : "Main card"}: ${card(q)}`);
      else if (q) lines.push(`Ploy asks: ${card(q)}`);
      return lines.filter(Boolean).join("\n");
    })
    .join("\n");
}

/** Hard facts the simulated user must not contradict, even when a chip suggests otherwise. */
function facts({ expect }: Persona) {
  const website = {
    has: `You have a website (${expect.domain}); give it when asked.`,
    none: "You have NO website at all, not even one in progress. Never claim or invent one.",
    not_live: "Your website exists but is NOT live yet. Never give a URL.",
  }[expect.website];
  const goals =
    expect.goals === "has"
      ? "You have a specific goal: the one in your persona. When offered a quick win or a bigger goal, answer the bigger goal card. Tap a goal chip only if it says what you want; otherwise type it in your own words."
      : "You genuinely don't know what to focus on. Never choose a specific goal; tap 'Not sure yet' or say you're not sure. When offered a quick win or a bigger goal, you may pick either.";
  return `${website}\n${goals}`;
}

const moveSchema = z.object({
  card: z.enum(["main", "quick_win"]).describe("Which card you're answering: quick_win only for the Quick win card"),
  chip: z.string().nullable().describe("A chip's exact label to tap it, or null to type"),
  text: z.string().nullable().describe("What you type, when not tapping a chip"),
});

async function simulateUser(persona: Persona, messages: OnboardingUIMessage[], asked: QuestionData) {
  const { output } = await generateText({
    model: simulatorModel,
    system: `You're role-playing a small-business owner going through Ploy's onboarding: short question cards, each with tappable chips and a text box.
Persona: ${persona.script}
Facts you must never contradict:
${facts(persona)}
Tap a chip when one says what you'd say; otherwise type a short reply (1-2 sentences) as this person would. If the persona says to type something specific, type it.`,
    prompt: `${transcript(messages)}\n\nYour move:`,
    output: Output.object({ schema: moveSchema }),
  });
  // In the app a chip belongs to its card, so find it on either one.
  const altChip = asked.alt?.chips.find((c) => c.label === output.chip);
  const onAlt = altChip ? true : output.card === "quick_win" && !!asked.alt;
  const slot: AnsweredSlot = onAlt && asked.alt ? asked.alt.slot : asked.slot;
  const chip = output.chip ? (altChip ?? asked.chips.find((c) => c.label === output.chip)) : undefined;
  return chip
    ? { text: chip.label, metadata: { slot, value: chip.value } }
    : { text: (output.text ?? output.chip ?? "").trim() || "not sure", metadata: { slot } };
}

/** The registry items a card asks about (the fork's two cards ask two). Older trails named them differently. */
const legacy: Record<string, ContextItemId> = { sell: "business_model", followup: "target_customer", goal: "goal_detail", fork: "goal_detail", quick_win: "quick_win_offer" };
const itemOf = (slot: string) => legacy[slot] ?? (slot as ContextItemId);
const itemsAsked = (q: QuestionData) => [itemOf(q.slot), ...(q.alt ? [itemOf(q.alt.slot)] : [])];

/** Which registry items are known right now. */
async function knownNow(workspaceId: string) {
  const [workspace, docs, ploys, integrations] = await Promise.all([
    getWorkspace(workspaceId),
    getDocs(workspaceId),
    getPloys(workspaceId),
    getIntegrations(workspaceId),
  ]);
  const state: ContextState = { workspace, docs, ploys, integrations };
  return new Set(contextItemIds.filter((id) => contextItems[id].known(state)));
}

/**
 * Runs one real step: times the next question and the whole turn (until the
 * stream finishes), and snapshots what was known when the question went up.
 */
async function runTurn(workspaceId: string, messages: OnboardingUIMessage[]) {
  const started = performance.now();
  let questionAt: number | null = null;
  let knownAtAsk: Promise<Set<ContextItemId>> | null = null;
  const { stream, background } = await onboardingTurn({ workspaceId, messages, onSaved: async () => {}, sideEffects: false });
  const timed = stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "data-question" && questionAt === null) {
          questionAt = performance.now() - started;
          knownAtAsk = knownNow(workspaceId);
        }
        controller.enqueue(chunk);
      },
    }),
  );
  let reply: OnboardingUIMessage | undefined;
  for await (const message of readUIMessageStream<OnboardingUIMessage>({ stream: timed })) reply = message;
  if (!reply) throw new Error("No reply");
  const turnMs = performance.now() - started;
  await background;
  return { reply, nextQuestionMs: questionAt, turnMs, knownAtAsk: knownAtAsk ? await knownAtAsk : null };
}

/** The first deliverables that fit the persona: its goal's (a landing page without a site), or the starter for "not sure". */
function expectedQuickWins({ expect }: Persona): QuickWinId[] {
  if (expect.goals === "unsure") return [expect.website === "has" ? "homepage_audit" : "landing_page_draft"];
  const picks = (expect.intents ?? []).map((id) => getIntent(id).quickWin);
  return picks.map((q) => (expect.website !== "has" && quickWins[q].needsWebsite ? "landing_page_draft" : q));
}

/**
 * The Ploybooks that should show up for the persona: the recorded goal's own
 * (if it's one the persona could mean; otherwise their first), or a starter
 * set for "not sure".
 */
function expectedTemplates({ expect }: Persona, recorded: IntentId | undefined): string[] {
  if (expect.goals === "unsure") return expect.website === "has" ? ["homepage_refresh", "brand_kit"] : ["landing_page_for_offer", "lead_list"];
  const intent = recorded && expect.intents?.includes(recorded) ? recorded : expect.intents?.[0];
  return intent ? [...getIntent(intent).templates] : [];
}

const words = (s: string) => s.trim().split(/\s+/).length;

async function runPersona(persona: Persona) {
  const workspace = await createWorkspace({ isEval: true });
  const messages: OnboardingUIMessage[] = [greetingMessage()];
  const timings: number[] = [];
  // Per user turn: wall time, whether it was a chip tap, and what was known when its question went up.
  const turns: { ms: number; chip: boolean; knownAtAsk: Set<ContextItemId> | null }[] = [];

  try {
    for (let turn = 1; turn <= MAX_USER_TURNS; turn++) {
      const asked = openQuestion(messages);
      if (!asked) break;
      const move = await simulateUser(persona, messages, asked);
      messages.push({ id: `u${turn}`, role: "user", parts: [{ type: "text", text: move.text }], metadata: move.metadata });
      const { reply, nextQuestionMs, turnMs, knownAtAsk } = await runTurn(workspace.id, messages);
      messages.push(reply);
      if (nextQuestionMs !== null) timings.push(nextQuestionMs);
      turns.push({ ms: turnMs, chip: move.metadata.value !== undefined, knownAtAsk });
    }

    await syncMap(workspace.id); // the eval skips side effects; place the tasks now
    const [final, docs, ploys, nodes] = await Promise.all([
      getWorkspace(workspace.id),
      getDocs(workspace.id),
      getPloys(workspace.id),
      getMapNodes(workspace.id),
    ]);
    const { entry } = final;
    const { expect } = persona;
    const doc = (slug: string) => docs.find((d) => d.slug === slug)!;

    // What the trail asked: every card, and whether its slot was already answered at the time.
    // reaskKnown: an item whose known() was already true when the card went up (the greeting's website card never is).
    const questions: { slot: string; question: string; chips: number; reask: boolean; reaskKnown: boolean }[] = [];
    let userTurn = 0;
    messages.forEach((m, i) => {
      if (m.role === "user") userTurn++;
      const q = part<QuestionData>(m, "data-question");
      if (!q) return;
      const before = new Set([...answeredSlots(messages.slice(0, i + 1))].map(itemOf));
      const items = itemsAsked(q);
      const known = i === 0 ? null : turns[userTurn - 1]?.knownAtAsk;
      questions.push({
        slot: q.slot,
        question: q.question,
        chips: q.chips.length,
        reask: items.some((s) => before.has(s)),
        reaskKnown: !!known && items.some((s) => known.has(s)),
      });
    });
    const answers = messages.flatMap((m) => {
      const a = part<AnsweredData>(m, "data-answered");
      return a ? [a] : [];
    });

    const quickWin = ploys.find((p) => p.spec?.source === "quick_win");
    const picked = answers.some((a) => itemOf(a.slot) === "quick_win_offer");
    const onMap = nodes.filter((n) => getSpec(n.spec_id)?.source === "template").map((n) => n.spec_id);
    const fit = expectedTemplates(persona, entry.goals.intents[0]?.id);

    const docChecks: Record<string, boolean> = {
      websiteSection:
        doc("business-overview").sections.website?.status === "confirmed" &&
        (expect.website === "has"
          ? !!expect.domain && (readSection(doc("business-overview").content_md, "Website") ?? "").includes(expect.domain)
          : !(readSection(doc("business-overview").content_md, "Website") ?? "").includes("http")),
      goalsSection: doc("goals-and-focus").sections.goals?.status === "confirmed",
    };

    // The planner's metrics: does it stop at the right time, re-ask what's known, get to the first win fast?
    const finished = !openQuestion(messages);
    const knownAtEnd = await knownNow(workspace.id);
    const told = (id: ContextItemId) => knownAtEnd.has(id) || answers.some((a) => itemOf(a.slot) === id);
    const userTurns = messages.filter((m) => m.role === "user");
    const startedAt = messages.findIndex((m) => !!part(m, "data-taskStarted"));
    const spike = {
      reaskedKnown: questions.filter((q) => q.reaskKnown).length,
      questionsToDone: finished ? questions.length : null,
      stoppedEarly: finished && !(told("goal_detail") && told("target_customer")),
      neverStopped: !finished,
      turnsToQuickWin: startedAt === -1 ? null : messages.slice(0, startedAt).filter((m) => m.role === "user").length,
      msPerTurn: { p50: Math.round(percentile(turns.map((t) => t.ms), 50)), p95: Math.round(percentile(turns.map((t) => t.ms), 95)) },
      chipTapMs: { p50: Math.round(percentile(turns.filter((t) => t.chip).map((t) => t.ms), 50)) },
    };

    return {
      id: persona.id,
      expected: expect.branch,
      branch: entryBranch(entry),
      finished,
      userTurns: userTurns.length,
      spike,
      questions,
      answers,
      quickWin: quickWin?.spec?.id ?? null,
      picked,
      onMap,
      fit,
      checks: {
        branch: entryBranch(entry) === expect.branch,
        websiteStatus: entry.website.status === expect.website,
        domain: expect.domain ? (entry.website.url ?? "").includes(expect.domain) : null,
        intent: expect.intents ? expect.intents.includes(entry.goals.intents[0]?.id) : null,
        unsupported: expect.unsupported ? !!entry.goals.unmatched : null,
        // A first win they picked themselves fits by definition; ours has to match their goal.
        // Goals Ploy doesn't cover have no expected first win.
        firstWin:
          picked || (expect.goals === "has" && !expect.intents)
            ? null
            : !!quickWin?.spec && expectedQuickWins(persona).includes(quickWin.spec.id as QuickWinId),
        unsureGetsAWin: expect.goals === "unsure" ? !!quickWin : null,
      },
      // Did the right capabilities surface? Share of the goal's Ploybooks on their map.
      taskRecall: fit.length ? fit.filter((id) => onMap.includes(id)).length / fit.length : null,
      docChecks,
      timings,
      turnTimings: turns.map((t) => ({ ms: Math.round(t.ms), chip: t.chip })),
      transcript: transcript(messages),
    };
  } finally {
    if (!keep) await db().from("workspaces").delete().eq("id", workspace.id);
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};
const rate = (values: (boolean | null)[]) => {
  const scored = values.filter((v): v is boolean => v !== null);
  return { rate: scored.length ? scored.filter(Boolean).length / scored.length : 1, n: scored.length };
};
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

console.log(`Running ${selected.length} personas…\n`);
const results = await pool(selected, CONCURRENCY, async (p) => {
  try {
    const r = await runPersona(p);
    const failed = Object.entries({ ...r.checks, ...r.docChecks }).filter(([, v]) => v === false).map(([k]) => k);
    console.log(
      `${failed.length ? "✗" : "✓"} ${p.id.padEnd(28)} path ${r.branch ?? "-"}/${r.expected}  ${r.questions.length} cards  win ${r.quickWin ?? "-"}${r.picked ? " (picked)" : ""}${failed.length ? `  failed: ${failed.join(", ")}` : ""}`,
    );
    return r;
  } catch (error) {
    console.log(`✗ ${p.id.padEnd(28)} ERROR ${String(error).split("\n")[0]}`);
    return null;
  }
});

const ok = results.filter((r) => r !== null);
const cards = ok.map((r) => r.questions.length);
const allQuestions = ok.flatMap((r) => r.questions);
const nextQuestion = ok.flatMap((r) => r.timings);
const metrics = [
  { name: "Path classified correctly", ...rate(ok.map((r) => r.checks.branch)), target: 0.95 },
  { name: "Top intent matches", ...rate(ok.map((r) => r.checks.intent)), target: 0.85 },
  { name: "Unsupported goals flagged", ...rate(ok.map((r) => r.checks.unsupported)), target: 1 },
  { name: "First win fits their goal (when we chose it)", ...rate(ok.map((r) => r.checks.firstWin)), target: 0.9 },
  { name: "'Not sure' still gets a first win", ...rate(ok.map((r) => r.checks.unsureGetsAWin)), target: 1 },
  (() => {
    const recall = ok.map((r) => r.taskRecall).filter((v): v is number => v !== null);
    return { name: "Goal's Ploybooks on their map (recall)", rate: mean(recall), n: recall.length, target: 0.8 };
  })(),
  { name: "Reaches the end of the trail", ...rate(ok.map((r) => r.finished)), target: 0.95 },
  { name: "Cards to finish (median)", value: percentile(cards, 50), max: 5 },
  { name: "Cards to finish (max)", value: Math.max(...cards), max: 6 },
  { name: "Questions of 15 words or fewer", ...rate(allQuestions.map((q) => words(q.question) <= 15)), target: 0.95 },
  { name: "2-5 chips (or free text by design)", ...rate(allQuestions.map((q) => (q.slot === "business_model" ? true : q.chips >= 2 && q.chips <= 5))), target: 0.95 },
  { name: "Re-asks an answered question", value: allQuestions.filter((q) => q.reask).length, max: 0 },
  { name: "Answers land in the right doc section", ...rate(ok.flatMap((r) => Object.values(r.docChecks))), target: 0.95 },
  { name: "Answer to next card p50 (ms)", value: Math.round(percentile(nextQuestion, 50)), max: 2000 },
  { name: "Answer to next card p95 (ms)", value: Math.round(percentile(nextQuestion, 95)), max: 4000 },
  { name: "Personas that errored", value: results.length - ok.length, max: 0 },
];

// The planner spike's metrics (reported, not gated).
const allTurns = ok.flatMap((r) => r.turnTimings);
const done = ok.map((r) => r.spike.questionsToDone).filter((v): v is number => v !== null);
const toWin = ok.map((r) => r.spike.turnsToQuickWin).filter((v): v is number => v !== null);
const spikeMetrics = {
  reaskedKnown: ok.reduce((n, r) => n + r.spike.reaskedKnown, 0),
  questionsToDone: { median: percentile(done, 50), mean: +mean(done).toFixed(2), n: done.length },
  stoppedEarly: ok.filter((r) => r.spike.stoppedEarly).length,
  neverStopped: ok.filter((r) => r.spike.neverStopped).length,
  turnsToQuickWin: { median: percentile(toWin, 50), mean: +mean(toWin).toFixed(2), n: toWin.length, never: ok.length - toWin.length },
  msPerTurn: { p50: Math.round(percentile(allTurns.map((t) => t.ms), 50)), p95: Math.round(percentile(allTurns.map((t) => t.ms), 95)) },
  chipTapMs: { p50: Math.round(percentile(allTurns.filter((t) => t.chip).map((t) => t.ms), 50)), n: allTurns.filter((t) => t.chip).length },
  personas: ok.length,
};

console.log("\nTrail gates");
let allPass = true;
for (const m of metrics) {
  const pass = "target" in m ? m.rate! >= m.target! : m.value! <= m.max!;
  allPass &&= pass;
  const shown = "target" in m ? `${(m.rate! * 100).toFixed(0)}% (n=${m.n})  target ≥ ${m.target! * 100}%` : `${m.value}  target ≤ ${m.max}`;
  console.log(`  ${pass ? "✓" : "✗"} ${m.name.padEnd(46)} ${shown}`);
}

console.log("\nPlanner metrics (not gated)");
for (const r of ok)
  console.log(
    `  ${r.id.padEnd(28)} reaskedKnown ${r.spike.reaskedKnown}  questionsToDone ${r.spike.questionsToDone ?? "-"}  stoppedEarly ${r.spike.stoppedEarly}  neverStopped ${r.spike.neverStopped}  turnsToQuickWin ${r.spike.turnsToQuickWin ?? "-"}  msPerTurn ${r.spike.msPerTurn.p50}/${r.spike.msPerTurn.p95}  chipTapMs ${r.spike.chipTapMs.p50}`,
  );
console.log(`  ALL ${JSON.stringify(spikeMetrics)}`);

await mkdir("evals/results", { recursive: true });
const file = `evals/results/entry-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(file, JSON.stringify({ metrics, spikeMetrics, results }, null, 2));
console.log(`\n${allPass ? "All gates pass." : "Some gates fail."} Full transcripts: ${file}`);
process.exit(allPass ? 0 : 1);
