// Entry-flow eval (phase 1, gate 2 + 3). Runs every persona through the real
// Getting Started pipeline against a throwaway workspace, with an LLM playing
// the user, then scores the result against the phase 1 thresholds.
//
//   npm run eval:entry                 all personas
//   npm run eval:entry -- a_terse d_*  filter by id (prefix* supported)
//   npm run eval:entry -- --keep       keep eval workspaces for inspection

import { mkdir, writeFile } from "node:fs/promises";
import { generateText, Output, readUIMessageStream, type UIMessageChunk } from "ai";
import { z } from "zod";
import { onboardingTurn, type OnboardingUIMessage } from "@/lib/ai/onboarding";
import { getIntent } from "@/lib/catalog/intents";
import { createWorkspace, getDocs, getWorkspace } from "@/lib/db/workspaces";
import { readSection } from "@/lib/docs/markdown";
import { entryBranch } from "@/lib/onboarding/entry";
import { greetingMessage } from "@/lib/onboarding/greeting";
import { db } from "@/lib/supabase/admin";
import { personas, type Persona } from "./personas";

const MAX_USER_TURNS = 4;
const CONCURRENCY = 4;
// The simulated user and the judge.
const simulatorModel = process.env.EVAL_SIMULATOR_MODEL ?? "openai/gpt-4o";
const judgeModel = process.env.EVAL_JUDGE_MODEL ?? "openai/gpt-4o-mini";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const filters = args.filter((a) => !a.startsWith("--"));
const selected = filters.length
  ? personas.filter((p) => filters.some((f) => (f.endsWith("*") ? p.id.startsWith(f.slice(0, -1)) : p.id === f)))
  : personas;

const textOf = (m: OnboardingUIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
const chipsOf = (m: OnboardingUIMessage) =>
  m.parts.flatMap((p) => (p.type === "data-replies" ? p.data.options : []));

function transcript(messages: OnboardingUIMessage[]) {
  return messages
    .map((m) => {
      const chips = chipsOf(m);
      return `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m)}${chips.length ? `\n[reply chips: ${chips.join(" | ")}]` : ""}`;
    })
    .join("\n\n");
}

/** Hard facts the simulated user must not contradict, even when a reply chip suggests otherwise. */
function facts({ expect }: Persona) {
  const website = {
    has: `You have a website (${expect.domain}); give it when asked.`,
    none: "You have NO website at all, not even one in progress. Never claim or invent one.",
    not_live: "Your website exists but is NOT live yet. Never give a URL.",
  }[expect.website];
  const goals =
    expect.goals === "has"
      ? "You have a specific goal: the one in your persona. State it in your own words; don't swap it for the assistant's examples or chips."
      : "You genuinely don't know what to focus on. Never choose a specific goal, even if the assistant suggests options or offers chips; say you're not sure or ask for a suggestion.";
  return `${website}\n${goals}`;
}

async function simulateUser(persona: Persona, messages: OnboardingUIMessage[]) {
  const { text } = await generateText({
    model: simulatorModel,
    system: `You're role-playing a small-business owner in their first chat with Ploy, a marketing platform's onboarding assistant.
Persona: ${persona.script}
Facts you must never contradict:
${facts(persona)}
Reply as this person would, answering what the assistant asked. Keep it short (1-2 sentences) unless the persona says otherwise. Output only your message.`,
    prompt: `${transcript(messages)}\n\nYour reply:`,
  });
  return text.trim();
}

/** Runs one real turn and times the first streamed text. */
async function runTurn(workspaceId: string, messages: OnboardingUIMessage[]) {
  const started = performance.now();
  let firstText: number | null = null;
  const stream = await onboardingTurn({ workspaceId, messages, onSaved: async () => {} });
  const timed = stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "text-delta" && firstText === null) firstText = performance.now() - started;
        controller.enqueue(chunk);
      },
    }),
  );
  let reply: OnboardingUIMessage | undefined;
  for await (const message of readUIMessageStream<OnboardingUIMessage>({ stream: timed })) reply = message;
  if (!reply) throw new Error("No reply");
  return { reply, firstTextMs: firstText ?? performance.now() - started, totalMs: performance.now() - started };
}

const judgeSchema = z.object({
  reasked: z
    .boolean()
    .describe(
      "The assistant asked for something the user had already given: their website, their goal, or what the business does. Asking them to restate, confirm, or make an answer 'more specific' counts. New follow-up questions don't. After the user says they're not sure, suggesting concrete options and asking which fits is expected, not a re-ask; asking an open 'what's your goal?' again is.",
    ),
  reaskEvidence: z.string().nullable(),
  gaveGuidance: z
    .boolean()
    .describe(
      "Right after the user said they have no (live) website or aren't sure about goals, did the assistant's next message offer something concrete Ploy can do for them?",
    ),
  guidanceEvidence: z.string().nullable(),
});

/** Guidance only applies when the persona says "no site" or "not sure"; that's known from the persona, not judged. */
const needsGuidance = (p: Persona) => p.expect.website !== "has" || p.expect.goals === "unsure";

async function judge(persona: Persona, messages: OnboardingUIMessage[]) {
  const { output } = await generateText({
    model: judgeModel,
    system:
      "You grade onboarding conversations for a marketing platform. Be strict and literal. Answer from the transcript only.",
    prompt: transcript(messages),
    output: Output.object({ schema: judgeSchema }),
  });
  return { ...output, gaveGuidance: needsGuidance(persona) ? output.gaveGuidance : null };
}

const questionCount = (text: string) => (text.replace(/https?:\/\/\S+/g, "").match(/\?/g) ?? []).length;

async function runPersona(persona: Persona) {
  const workspace = await createWorkspace({ isEval: true });
  const messages: OnboardingUIMessage[] = [greetingMessage()];
  const timings: { firstTextMs: number; totalMs: number }[] = [];
  let resolvedAt: number | null = null;

  try {
    for (let turn = 1; turn <= MAX_USER_TURNS; turn++) {
      const text = await simulateUser(persona, messages);
      messages.push({ id: `u${turn}`, role: "user", parts: [{ type: "text", text }] });
      const { reply, ...timing } = await runTurn(workspace.id, messages);
      messages.push(reply);
      timings.push(timing);
      if (entryBranch((await getWorkspace(workspace.id)).entry)) {
        resolvedAt = turn;
        break;
      }
    }

    const [final, docs, verdict] = await Promise.all([getWorkspace(workspace.id), getDocs(workspace.id), judge(persona, messages)]);
    const { entry } = final;
    const { expect } = persona;
    const doc = (slug: string) => docs.find((d) => d.slug === slug)!;

    const docChecks: Record<string, boolean> = {
      websiteSection:
        doc("business-overview").sections.website?.status === "confirmed" &&
        (expect.website === "has"
          ? !!expect.domain && (readSection(doc("business-overview").content_md, "Website") ?? "").includes(expect.domain)
          : !(readSection(doc("business-overview").content_md, "Website") ?? "").includes("http")),
      goalsSection: doc("goals-and-focus").sections.goals?.status === "confirmed",
    };
    if (expect.goals === "has" && entry.goals.intents[0])
      docChecks.focusSection = (readSection(doc("goals-and-focus").content_md, "Focus areas") ?? "").includes(
        getIntent(entry.goals.intents[0].id).label,
      );

    const assistantTurns = messages.slice(1).filter((m) => m.role === "assistant");
    return {
      id: persona.id,
      expected: expect.branch,
      branch: entryBranch(entry),
      resolvedAt,
      website: entry.website,
      goals: entry.goals,
      checks: {
        branch: entryBranch(entry) === expect.branch,
        websiteStatus: entry.website.status === expect.website,
        domain: expect.domain ? (entry.website.url ?? "").includes(expect.domain) : null,
        intent: expect.intents ? expect.intents.includes(entry.goals.intents[0]?.id) : null,
        unsupported: expect.unsupported ? !!entry.goals.unmatched : null,
        noReask: !verdict.reasked,
        guidance: verdict.gaveGuidance,
      },
      docChecks,
      oneQuestion: assistantTurns.map((m) => questionCount(textOf(m)) <= 1),
      timings,
      verdict,
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

console.log(`Running ${selected.length} personas…\n`);
const results = await pool(selected, CONCURRENCY, async (p) => {
  try {
    const r = await runPersona(p);
    const failed = Object.entries({ ...r.checks, ...r.docChecks }).filter(([, v]) => v === false).map(([k]) => k);
    console.log(
      `${failed.length ? "✗" : "✓"} ${p.id.padEnd(28)} path ${r.branch ?? "-"}/${r.expected}  turns ${r.resolvedAt ?? "-"}${failed.length ? `  failed: ${failed.join(", ")}` : ""}`,
    );
    return r;
  } catch (error) {
    console.log(`✗ ${p.id.padEnd(28)} ERROR ${String(error).split("\n")[0]}`);
    return null;
  }
});

const ok = results.filter((r) => r !== null);
const turns = ok.map((r) => r.resolvedAt ?? Infinity);
const firstText = ok.flatMap((r) => r.timings.map((t) => t.firstTextMs));
const metrics = [
  { name: "Path classified correctly", ...rate(ok.map((r) => r.checks.branch)), target: 0.95 },
  { name: "User turns to resolve (median)", value: percentile(turns, 50), max: 2 },
  { name: "User turns to resolve (max)", value: Math.max(...turns), max: 4 },
  { name: "Re-asks something already answered", value: ok.filter((r) => !r.checks.noReask).length, max: 0 },
  { name: "One question per agent message", ...rate(ok.flatMap((r) => r.oneQuestion)), target: 0.95 },
  { name: "'No'/'not sure' gets a concrete suggestion", ...rate(ok.map((r) => r.checks.guidance)), target: 0.9 },
  { name: "Top intent matches", ...rate(ok.map((r) => r.checks.intent)), target: 0.85 },
  { name: "Unsupported goals flagged", ...rate(ok.map((r) => r.checks.unsupported)), target: 1 },
  { name: "Answers land in the right doc section", ...rate(ok.flatMap((r) => Object.values(r.docChecks))), target: 0.95 },
  { name: "Time to first token p50 (ms)", value: Math.round(percentile(firstText, 50)), max: 1500 },
  { name: "Time to first token p95 (ms)", value: Math.round(percentile(firstText, 95)), max: 3000 },
  { name: "Personas that errored", value: results.length - ok.length, max: 0 },
];

console.log("\nPhase 1 gates");
let allPass = true;
for (const m of metrics) {
  const pass = "target" in m ? m.rate! >= m.target! : m.value! <= m.max!;
  allPass &&= pass;
  const shown = "target" in m ? `${(m.rate! * 100).toFixed(0)}% (n=${m.n})  target ≥ ${m.target! * 100}%` : `${m.value}  target ≤ ${m.max}`;
  console.log(`  ${pass ? "✓" : "✗"} ${m.name.padEnd(44)} ${shown}`);
}

await mkdir("evals/results", { recursive: true });
const file = `evals/results/entry-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(file, JSON.stringify({ metrics, results }, null, 2));
console.log(`\n${allPass ? "All gates pass." : "Some gates fail."} Full transcripts: ${file}`);
process.exit(allPass ? 0 : 1);
