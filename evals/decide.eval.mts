// Decision eval: how well Jev makes the trail's typed decisions, next to
// today's gpt-4.1 extractor (and gpt-4.1-mini with the same schema), on a
// hand-labeled set of turns (evals/decide-set.json: typed messages from saved
// entry-eval transcripts plus synthetic hard cases), and how Jev's two
// next_info designs compare with the fixed question order.
//
//   npm run eval:decide                          everything
//   npm run eval:decide -- --only jev            just Jev (nearly free)
//   npm run eval:decide -- --only jev --limit 20 a subset
//   npm run eval:decide -- --filter tc_          cases whose id starts with tc_
//   npm run eval:decide -- --skip-next           turns only
//   --retries 15 --jev-concurrency 2             patience with Jev's rate limits
//   npm run eval:decide -- --rescore evals/results/decide-….json   re-score saved answers (no model calls)
//
// Needs no database. Jev calls retry on the gateway's rate-limit errors (the
// first-attempt failure rate is reported); latency is the successful attempt's.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { UIMessage } from "ai";
import { ask } from "@/lib/ai/jev";
import { extractEntryUpdate } from "@/lib/ai/onboarding/extract";
import { proposeNotes } from "@/lib/ai/onboarding/profile-notes";
import { knownItems, type ContextItemId } from "@/lib/catalog/context";
import type { IntentId } from "@/lib/catalog/intents";
import type { Doc, Integration, Ploy, Workspace } from "@/lib/db/types";
import { renderDoc } from "@/lib/docs/markdown";
import { noteSections, profileDocs, type SectionMeta } from "@/lib/docs/profile";
import {
  chipsOf,
  decisionIds,
  nextQuestions,
  nextState,
  pickNext,
  readChip,
  readStatus,
  readTouched,
  readWebsite,
  recordedFrom,
  touchId,
  turnQuestions,
  turnState,
  type Answers,
  type Decision,
  type NextDesign,
  type Recorded,
  type TurnInput,
} from "@/lib/onboarding/decisions";
import { emptyEntry, type Entry } from "@/lib/onboarding/entry";
import { askable, nextQuestion, soundsUnsure, type Chip, type TrailState } from "@/lib/onboarding/trail";

type Gold = {
  answer_status: string[];
  chip_match: string[] | null;
  website_status: string[] | null;
  goal_intent: string[] | null;
  profile_touch: string[];
  profile_touch_optional: string[];
};
type Turn = Omit<TurnInput, "recorded"> & { id: string; source: string; recorded: Partial<Recorded>; gold: Gold };
type NextCase = {
  id: string;
  note: string;
  website: "has" | "none" | "not_live";
  goals: IntentId[] | "unsure" | null;
  sections: Record<string, [string, "inferred" | "confirmed"]>;
  answered: ContextItemId[];
  tools: Record<string, string>;
  quickWin: boolean;
  message: string | null;
  asking: ContextItemId | null;
  gold: string[];
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const only = flag("only")?.split(",") ?? ["jev", "gpt-4.1", "gpt-4.1-mini"];
const limit = Number(flag("limit") ?? Infinity);
const filter = flag("filter");
const skipNext = args.includes("--skip-next");
const skipTurns = args.includes("--skip-turns");

const set = JSON.parse(await readFile("evals/decide-set.json", "utf8")) as { turns: Turn[]; next: NextCase[] };
const turns = set.turns.filter((t) => !filter || t.id.startsWith(filter)).slice(0, limit);

// Gateway prices, $ per million tokens (Jev's output is free).
const prices: Record<string, { input: number; output: number }> = {
  jev: { input: 0.042, output: 0 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};
const gatewayModel: Record<string, string> = { "gpt-4.1": "openai/gpt-4.1", "gpt-4.1-mini": "openai/gpt-4.1-mini" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jev with retries on rate limits: the eval measures quality, and reports how often the first try failed. */
const retries = Number(flag("retries") ?? 15);
const jevConcurrency = Number(flag("jev-concurrency") ?? 2);
async function askJev(state: Parameters<typeof ask>[0], questions: Parameters<typeof ask>[1]) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const r = await ask(state, questions, { timeoutMs: 8000, label: "eval" });
    if (r) return { ...r, attempts: attempt + 1 };
    await sleep(Math.min(30000, 2000 * 2 ** attempt));
  }
  return null;
}

// ── What each method decided ───────────────────────────────────────────────

type Decided = {
  status: string | null;
  statusConfidence: number | null;
  chip: string | null;
  chipConfidence: number | null;
  website: string | null;
  websiteConfidence: number | null;
  goal: string | null;
  goalConfidence: number | null;
  touched: string[] | null;
  touchConfidence: Record<string, number> | null;
  ms: number;
  tokens: { input: number; output: number };
  attempts?: number;
  failed?: boolean;
};

const recordedOf = (t: Turn): Recorded => ({
  website: "not answered yet",
  goal: "not answered yet",
  whatTheyDo: null,
  customers: null,
  channels: null,
  constraints: null,
  tools: null,
  ...t.recorded,
});

const allMessageDecisions = new Set<Decision>(decisionIds.filter((d) => d !== "next_info"));
const labelOf = (chip: Chip | "all" | null) => (chip === "all" ? "all" : (chip?.label ?? "none"));

async function jevTurn(t: Turn): Promise<Decided> {
  const input: TurnInput = { ...t, recorded: recordedOf(t) };
  const r = await askJev(turnState(input), turnQuestions(input, allMessageDecisions));
  if (!r)
    return { status: null, statusConfidence: null, chip: null, chipConfidence: null, website: null, websiteConfidence: null, goal: null, goalConfidence: null, touched: null, touchConfidence: null, ms: 0, tokens: { input: 0, output: 0 }, failed: true };
  const a = r.answers;
  const status = readStatus(a);
  const chip = readChip(a, chipsOf(t));
  const site = readWebsite(a);
  const goal = a.goal_intent;
  return {
    status: status?.value ?? null,
    statusConfidence: status?.confidence ?? null,
    chip: chip ? labelOf(chip.value) : null,
    chipConfidence: chip?.confidence ?? null,
    website: site?.value ?? null,
    websiteConfidence: site?.confidence ?? null,
    goal: goal?.type === "choice" ? goal.choice : null,
    goalConfidence: goal?.confidence ?? null,
    touched: readTouched(a),
    touchConfidence: Object.fromEntries(noteSections.map(([slug, key]) => [`${slug}#${key}`, a[touchId(key)]?.confidence ?? 0])),
    ms: r.ms,
    tokens: { input: r.inputTokens, output: 0 },
    attempts: r.attempts,
  };
}

/** Today's path: the gpt-4.1 extractor's fields, mapped onto the same decisions, plus the profile-notes call. */
async function llmTurn(t: Turn, model: string): Promise<Decided> {
  const recorded = recordedOf(t);
  const entry: Entry = structuredClone(emptyEntry);
  const url = recorded.website.match(/https?:\/\/\S+/)?.[0] ?? null;
  if (url) entry.website = { status: "has", url };
  else if (recorded.website === "none") entry.website = { status: "none", url: null };
  else if (recorded.website === "not live") entry.website = { status: "not_live", url: null };
  if (recorded.goal !== "not answered yet") entry.goals = { status: "has", intents: [], inUserWords: recorded.goal, unmatched: null };

  const messages: UIMessage[] = [
    {
      id: "a",
      role: "assistant",
      parts: [
        ...(t.previous ? [{ type: "text" as const, text: t.previous }] : []),
        { type: "data-question", data: { question: t.question, alt: t.alt } } as UIMessage["parts"][number],
      ],
    },
    { id: "u", role: "user", parts: [{ type: "text", text: t.message }] },
  ];
  const tokens = { input: 0, output: 0 };
  const count = (u: { inputTokens?: number; outputTokens?: number } | null | undefined) => {
    tokens.input += u?.inputTokens ?? 0;
    tokens.output += u?.outputTokens ?? 0;
  };
  const started = performance.now();
  const extracted = await extractEntryUpdate(entry, messages, { slot: t.item, question: t.question, chips: chipsOf(t) }, { model, onUsage: count });
  const ms = Math.round(performance.now() - started);
  const notes = await proposeNotes({ said: t.message, assistant: t.previous, docs: [], model });
  count(notes.usage);

  const { answer } = extracted;
  const chip = answer?.matchedChip ? chipsOf(t).find((c) => c.value === answer.matchedChip) : undefined;
  // How applyTyped reads it today: "all of the above" by regex, unsure by goal status / chip / regex.
  const all = /\b(all of (the|them|those|these)|all (the )?above|every(one|body) (above|listed)|both)\b/i.test(t.message);
  const unsure = extracted.goals?.status === "unsure" || chip?.value === "unsure" || chip?.value === "skip" || soundsUnsure(t.message);
  const changed =
    !answer?.answered &&
    ((!!extracted.website && t.item !== "website" && entry.website.status !== "unknown") ||
      (!!extracted.goals && t.item !== "goal_detail" && entry.goals.status !== "unknown"));
  const status = changed ? "changed_earlier_answer" : unsure && !(answer?.answered && chip && chip.value !== "unsure") ? "unsure" : answer?.answered ? "answered" : answer?.offScript ? "off_script" : "not_answered";
  const goal = !extracted.goals
    ? null
    : extracted.goals.status === "unsure"
      ? "unsure"
      : (extracted.goals.intents.sort((a, b) => b.weight - a.weight)[0]?.id ?? (extracted.goals.unmatched ? "not_covered" : null));
  return {
    status,
    statusConfidence: null,
    chip: chip ? chip.label : all && t.item === "target_customer" ? "all" : "none",
    chipConfidence: null,
    website: extracted.website?.status ?? null,
    websiteConfidence: null,
    goal,
    goalConfidence: null,
    touched: [...new Set(notes.patches.map((p) => `${p.slug}#${p.key}`))],
    touchConfidence: null,
    ms,
    tokens,
  };
}

// ── Scoring ────────────────────────────────────────────────────────────────

/** Coarse answer status, what today's extractor can tell apart: record it, unsure, not an answer, a changed answer. */
const coarse = (s: string | null) =>
  s === "answered" || s === "partial" ? "record" : s === "unsure" ? "unsure" : s === "changed_earlier_answer" ? "changed" : "no_answer";

type Scored = { id: string; right: boolean; confidence: number | null; got: string | null; want: string[] };

function scoreTurns(method: string, rows: { t: Turn; d: Decided }[]) {
  const per: Record<string, Scored[]> = { answer_status: [], answer_status_coarse: [], chip_match: [], website_status: [], goal_intent: [], profile_touch: [] };
  let tp = 0, fp = 0, fn = 0;
  for (const { t, d } of rows) {
    if (d.failed) continue;
    const { gold } = t;
    if (method === "jev") per.answer_status.push({ id: t.id, right: gold.answer_status.includes(d.status ?? ""), confidence: d.statusConfidence, got: d.status, want: gold.answer_status });
    per.answer_status_coarse.push({ id: t.id, right: gold.answer_status.map(coarse).includes(coarse(d.status)), confidence: d.statusConfidence, got: d.status, want: gold.answer_status });
    if (gold.chip_match) per.chip_match.push({ id: t.id, right: gold.chip_match.includes(d.chip ?? "none"), confidence: d.chipConfidence, got: d.chip, want: gold.chip_match });
    if (gold.website_status) per.website_status.push({ id: t.id, right: gold.website_status.includes(d.website ?? ""), confidence: d.websiteConfidence, got: d.website, want: gold.website_status });
    if (gold.goal_intent) per.goal_intent.push({ id: t.id, right: gold.goal_intent.includes(d.goal ?? ""), confidence: d.goalConfidence, got: d.goal, want: gold.goal_intent });
    // profile_touch: exact set, ignoring the ambiguous sections; plus micro precision/recall.
    const key = (s: string) => s.split("#")[1];
    const got = new Set((d.touched ?? []).map(key).filter((k) => !gold.profile_touch_optional.includes(k)));
    const want = new Set(gold.profile_touch);
    const right = got.size === want.size && [...got].every((k) => want.has(k));
    for (const k of got) {
      if (want.has(k)) tp++;
      else fp++;
    }
    for (const k of want) if (!got.has(k)) fn++;
    const confidences = d.touchConfidence ? Object.entries(d.touchConfidence).filter(([s]) => !gold.profile_touch_optional.includes(key(s))).map(([, c]) => c) : [];
    per.profile_touch.push({ id: t.id, right, confidence: confidences.length ? Math.min(...confidences) : null, got: [...got].join(",") || "-", want: [...want] });
  }
  const summary = Object.fromEntries(
    Object.entries(per).map(([decision, xs]) => [
      decision,
      {
        n: xs.length,
        accuracy: xs.length ? xs.filter((x) => x.right).length / xs.length : null,
        calibration: calibration(xs),
        misses: xs.filter((x) => !x.right).map(({ id, got, want, confidence }) => ({ id, got, want, confidence: confidence === null ? null : Math.round(confidence * 100) / 100 })),
      },
    ]),
  );
  summary.profile_touch = { ...summary.profile_touch, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) } as (typeof summary)["profile_touch"];
  return summary;
}

const buckets = [
  { name: "<0.5", lo: 0, hi: 0.5 },
  { name: "0.5-0.9", lo: 0.5, hi: 0.9 },
  { name: ">=0.9", lo: 0.9, hi: 1.01 },
];
function calibration(xs: Scored[]) {
  if (xs.every((x) => x.confidence === null)) return null;
  return buckets.map((b) => {
    const inB = xs.filter((x) => x.confidence !== null && x.confidence >= b.lo && x.confidence < b.hi);
    return { bucket: b.name, n: inB.length, accuracy: inB.length ? inB.filter((x) => x.right).length / inB.length : null };
  });
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};

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

// ── next_info states ───────────────────────────────────────────────────────

function trailOf(c: NextCase): TrailState {
  const entry: Entry = structuredClone(emptyEntry);
  entry.website = { status: c.website, url: c.website === "has" ? "https://example.com" : null };
  if (c.goals === "unsure") entry.goals = { status: "unsure", intents: [], inUserWords: null, unmatched: null };
  else if (c.goals) entry.goals = { status: "has", intents: c.goals.map((id) => ({ id, weight: 1 })), inUserWords: null, unmatched: null };
  entry.tools = c.tools;
  const docs = profileDocs.map((doc) => {
    const body = (key: string) => c.sections[`${doc.slug}#${key}`];
    return {
      slug: doc.slug,
      title: doc.title,
      kind: "profile",
      content_md: renderDoc(doc.title, doc.sections.map((s) => ({ heading: s.heading, body: body(s.key)?.[0] ?? "" }))),
      sections: Object.fromEntries(
        doc.sections.map((s) => [s.key, { status: body(s.key)?.[1] ?? "empty", source: body(s.key) ? "user" : null, updatedAt: null } satisfies SectionMeta]),
      ),
    };
  }) as unknown as Doc[];
  const ploys = c.quickWin ? [{ spec: { source: "quick_win" }, status: "running" } as Ploy] : [];
  const workspace = { id: "eval", entry, crawl: null } as unknown as Workspace;
  return { workspace, docs, ploys, mapNodes: [], integrations: [] as Integration[], answered: new Set(c.answered) };
}

async function runNext() {
  const designs: NextDesign[] = ["choice", "composite"];
  return pool(set.next, 2, async (c) => {
    const trail = trailOf(c);
    const candidates = askable(trail);
    const today = nextQuestion(trail)?.slot ?? "nothing";
    const state = nextState({ recorded: recordedFrom(trail.workspace, trail.docs as Doc[]), known: knownItems(trail), asking: c.asking, message: c.message });
    const jev: Record<string, { pick: string; ms: number; confidence: number } | null> = {};
    for (const d of designs) {
      const r = await askJev(state, nextQuestions(d));
      const pick = r && pickNext(r.answers as Answers, d, candidates);
      jev[d] = r && pick ? { pick: pick.value ?? "nothing", ms: r.ms, confidence: pick.confidence } : null;
    }
    return { id: c.id, note: c.note, gold: c.gold, candidates, today, choice: jev.choice, composite: jev.composite };
  });
}

// ── Run ────────────────────────────────────────────────────────────────────

const report: Record<string, unknown> = { at: new Date().toISOString(), turns: turns.length };

/** A method's scores, latency and cost from its rows, printed as a table. */
function summarize(method: string, rows: { t: Turn; d: Decided }[], wallMs: number) {
  const ok = rows.filter((r) => !r.d.failed);
  const ms = ok.map((r) => r.d.ms);
  const input = ok.reduce((s, r) => s + r.d.tokens.input, 0);
  const output = ok.reduce((s, r) => s + r.d.tokens.output, 0);
  const cost = (input * prices[method].input + output * prices[method].output) / 1e6;
  const scores = scoreTurns(method, rows);
  const firstTryFailed = method === "jev" ? ok.filter((r) => (r.d.attempts ?? 1) > 1).length : 0;
  const lines = [
    `\n${method}  (n=${ok.length}/${rows.length}${method === "jev" ? `, first try failed ${firstTryFailed}` : ""})  latency p50 ${percentile(ms, 50)}ms p95 ${percentile(ms, 95)}ms  cost/1k turns $${((cost / (ok.length || 1)) * 1000).toFixed(3)}`,
  ];
  for (const [decision, s] of Object.entries(scores)) {
    if (!s.n) continue;
    const cal = s.calibration ? "  cal " + s.calibration.map((b) => `${b.bucket}: ${b.n ? `${Math.round(b.accuracy! * 100)}% of ${b.n}` : "-"}`).join(" | ") : "";
    const pr = "precision" in s ? `  P ${Math.round((s as unknown as { precision: number }).precision * 100)}% R ${Math.round((s as unknown as { recall: number }).recall * 100)}%` : "";
    lines.push(`  ${decision.padEnd(22)} ${Math.round(s.accuracy! * 100)}% (n=${s.n})${pr}${cal}`);
  }
  console.log(lines.join("\n"));
  return {
    scores,
    latency: { p50: percentile(ms, 50), p95: percentile(ms, 95), over1500: ms.filter((x) => x > 1500).length },
    tokens: { input, output },
    costPer1kTurns: ok.length ? (cost / ok.length) * 1000 : null,
    failed: rows.length - ok.length,
    firstTryFailed,
    wallMs,
    rows: rows.map((r) => ({ id: r.t.id, ...r.d })),
  };
}

// --rescore <results.json>: score saved rows again (e.g. after fixing a label), without calling any model.
const rescore = flag("rescore");
if (rescore) {
  const saved = JSON.parse(await readFile(rescore, "utf8")) as Record<string, { rows?: ({ id: string } & Decided)[]; wallMs?: number }>;
  for (const method of Object.keys(prices)) {
    const rows = saved[method]?.rows;
    if (!rows) continue;
    const byId = new Map(set.turns.map((t) => [t.id, t]));
    report[method] = summarize(method, rows.filter((r) => byId.has(r.id)).map((d) => ({ t: byId.get(d.id)!, d })), saved[method].wallMs ?? 0);
  }
  if (saved.next) report.next = saved.next;
} else if (!skipTurns) {
  for (const method of only) {
    const started = performance.now();
    const rows = await pool(turns, method === "jev" ? jevConcurrency : 4, async (t) => {
      try {
        return { t, d: method === "jev" ? await jevTurn(t) : await llmTurn(t, gatewayModel[method]) };
      } catch (error) {
        console.log(`  ${method} ${t.id} ERROR ${String(error).split("\n")[0]}`);
        return { t, d: { failed: true } as Decided };
      }
    });
    report[method] = summarize(method, rows, Math.round(performance.now() - started));
  }
}

if (!rescore && !skipNext && only.includes("jev")) {
  const next = await runNext();
  const acc = (key: "today" | "choice" | "composite") => {
    const xs = next.map((r) => (key === "today" ? r.today : (r[key]?.pick ?? null)));
    const scored = next.filter((_, i) => xs[i] !== null);
    return { accuracy: scored.filter((r) => r.gold.includes(key === "today" ? r.today : r[key]!.pick)).length / (scored.length || 1), n: scored.length };
  };
  const ms = (key: "choice" | "composite") => next.map((r) => r[key]?.ms).filter((x): x is number => x !== undefined);
  report.next = {
    today: acc("today"),
    choice: { ...acc("choice"), p50: percentile(ms("choice"), 50), p95: percentile(ms("choice"), 95) },
    composite: { ...acc("composite"), p50: percentile(ms("composite"), 50), p95: percentile(ms("composite"), 95) },
    rows: next,
  };
  console.log(`\nnext_info (n=${next.length})`);
  for (const key of ["today", "choice", "composite"] as const) {
    const a = acc(key);
    console.log(`  ${key.padEnd(10)} ${Math.round(a.accuracy * 100)}% (n=${a.n})${key === "today" ? "" : `  p50 ${percentile(ms(key), 50)}ms p95 ${percentile(ms(key), 95)}ms`}`);
  }
  for (const r of next)
    if (![r.today, r.choice?.pick, r.composite?.pick].every((p) => p && r.gold.includes(p)))
      console.log(`    ${r.id.padEnd(32)} gold ${r.gold.join("|").padEnd(36)} today ${r.today.padEnd(18)} choice ${(r.choice?.pick ?? "-").padEnd(18)} composite ${r.composite?.pick ?? "-"}`);
}

await mkdir("evals/results", { recursive: true });
const file = `evals/results/decide-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(file, JSON.stringify(report, null, 2));
console.log(`\nFull results: ${file}`);
