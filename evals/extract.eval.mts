// Extraction precision eval: does recording the user's answers pick up exactly
// what each message says, and nothing it doesn't? Single-message cases. Then,
// for answers typed on the trail: did it answer the card, which chip it
// matches, a short faithful summary, and anything off-script.
//
//   npm run eval:extract

import type { UIMessage } from "ai";
import { extractEntryUpdate } from "@/lib/ai/onboarding/extract";
import type { AnsweredSlot, Chip } from "@/lib/onboarding/trail";
import { emptyEntry } from "@/lib/onboarding/entry";
import { greetingMessage } from "@/lib/onboarding/greeting";

const askGoals =
  "Nice, thanks. **Is there something specific you want to move in the next few months?** If not, I can suggest a starting point.";
const askBusiness = "No problem. **What does your business do, in a sentence?**";

type Expect = {
  website: "has" | "none" | "not_live" | null;
  goals: "has" | "unsure" | null;
  business: boolean;
  intent?: string[];
  unmatched?: boolean;
};

// The greeting is a message of its own (it asks through a question card).
const greeting = "greeting";

const cases: { assistant: string; user: string; expect: Expect }[] = [
  { assistant: greeting, user: "yes, acme.com", expect: { website: "has", goals: null, business: false } },
  { assistant: greeting, user: "harborviewdentalgroup.com", expect: { website: "has", goals: null, business: false } },
  { assistant: greeting, user: "Yes, our website is harborviewdentalgroup.com.", expect: { website: "has", goals: null, business: false } },
  { assistant: greeting, user: "instagram.com/lunaceramics is all I have", expect: { website: "has", goals: null, business: false } },
  { assistant: greeting, user: "I don't have a website yet", expect: { website: "none", goals: null, business: false } },
  { assistant: greeting, user: "It's not live yet", expect: { website: "not_live", goals: null, business: false } },
  { assistant: greeting, user: "no site, I run a mobile dog grooming business", expect: { website: "none", goals: null, business: true } },
  {
    assistant: greeting,
    user: "brightsmile-dental.com - scheduling software for dental clinics. we want more demo bookings",
    expect: { website: "has", goals: "has", business: true, intent: ["get_more_leads", "convert_site_visitors"] },
  },
  {
    assistant: greeting,
    user: "not sure what I need yet, a friend recommended you",
    expect: { website: null, goals: "unsure", business: false },
  },
  {
    assistant: greeting,
    user: "I want to start cold outreach to HR leaders to book demos of PeoplePulse, our employee survey software.",
    expect: { website: null, goals: "has", business: true, intent: ["run_outbound"] },
  },
  { assistant: askGoals, user: "Not sure yet, suggest something", expect: { website: null, goals: "unsure", business: false } },
  { assistant: askGoals, user: "honestly no idea", expect: { website: null, goals: "unsure", business: false } },
  { assistant: askGoals, user: "more leads", expect: { website: null, goals: "has", business: false, intent: ["get_more_leads"] } },
  {
    assistant: askGoals,
    user: "start cold emailing HR leaders",
    expect: { website: null, goals: "has", business: false, intent: ["run_outbound"] },
  },
  {
    assistant: askGoals,
    user: "we need to raise a seed round",
    expect: { website: null, goals: "has", business: false, unmatched: true },
  },
  { assistant: askGoals, user: "just grow", expect: { website: null, goals: "has", business: false } },
  { assistant: askBusiness, user: "I'm a plumber", expect: { website: null, goals: null, business: true } },
];

let passed = 0;
const latencies: number[] = [];
for (const c of cases) {
  const messages: UIMessage[] = [
    c.assistant === greeting ? greetingMessage() : { id: "a", role: "assistant", parts: [{ type: "text", text: c.assistant }] },
    { id: "u", role: "user", parts: [{ type: "text", text: c.user }] },
  ];
  const started = performance.now();
  const u = await extractEntryUpdate(emptyEntry, messages);
  latencies.push(performance.now() - started);
  const problems = [
    (u.website?.status ?? null) !== c.expect.website && `website ${u.website?.status ?? null}`,
    (u.goals?.status ?? null) !== c.expect.goals && `goals ${u.goals?.status ?? null}`,
    !!u.business?.whatTheyDo !== c.expect.business && `business ${JSON.stringify(u.business)}`,
    c.expect.intent && !c.expect.intent.includes(u.goals?.intents[0]?.id ?? "") && `intent ${u.goals?.intents[0]?.id}`,
    c.expect.unmatched && !u.goals?.unmatched && "unmatched not flagged",
  ].filter(Boolean);
  if (!problems.length) passed++;
  console.log(`${problems.length ? "✗" : "✓"} ${JSON.stringify(c.user).padEnd(70)} ${problems.join(", ")}`);
}

// Answers typed on a trail card.
const audience = (...labels: string[]): Chip[] => [...labels.map((l) => ({ label: l, value: l })), { label: "Not sure yet", value: "unsure" }];
const goals: Chip[] = [
  { label: "Get more leads", value: "get_more_leads" },
  { label: "Run outbound outreach", value: "run_outbound" },
  { label: "Launch paid ads", value: "launch_paid_ads" },
  { label: "Not sure yet", value: "unsure" },
];
const email: Chip[] = [
  { label: "Gmail", value: "email:Gmail" },
  { label: "Outlook", value: "email:Outlook" },
  { label: "Skip for now", value: "skip" },
];
const quick: Chip[] = [
  { label: "Audit my homepage", value: "homepage_audit" },
  { label: "Write a cold email sequence", value: "outreach_sequence" },
  { label: "Find accounts like my best customers", value: "lookalike_accounts" },
];
const cafes = audience("Independent cafés", "Offices", "Restaurants and hotels");

type TrailCase = {
  slot: AnsweredSlot;
  question: string;
  chips: Chip[];
  user: string;
  /** matchedChip: a value, null for no match, or undefined for "either is fine". */
  expect: { answered: boolean; matchedChip?: string | null; offScript: boolean };
};
const trailCases: TrailCase[] = [
  { slot: "followup", question: "Who do you most want to reach out to?", chips: cafes, user: "mostly coffee shops, a few offices too", expect: { answered: true, offScript: false } },
  { slot: "followup", question: "Who do you most want to reach out to?", chips: cafes, user: "wait, can you also handle my bookkeeping?", expect: { answered: false, offScript: true } },
  { slot: "followup", question: "Who do you most want to reach out to?", chips: cafes, user: "cafés mainly. also can you run instagram ads?", expect: { answered: true, offScript: true } },
  { slot: "goal", question: "What do you most want to grow in the next few months?", chips: goals, user: "we want to run google ads", expect: { answered: true, matchedChip: "launch_paid_ads", offScript: false } },
  { slot: "goal", question: "What do you most want to grow in the next few months?", chips: goals, user: "honestly not sure", expect: { answered: true, matchedChip: "unsure", offScript: false } },
  { slot: "goal", question: "What do you most want to grow in the next few months?", chips: goals, user: "land more wholesale accounts with cafés", expect: { answered: true, offScript: false } },
  { slot: "tool", question: "Where do you send email from today?", chips: email, user: "we use gmail for everything", expect: { answered: true, matchedChip: "email:Gmail", offScript: false } },
  { slot: "tool", question: "Where do you send email from today?", chips: email, user: "Zoho Mail", expect: { answered: true, matchedChip: null, offScript: false } },
  { slot: "quick_win", question: "Want something useful in the next few minutes?", chips: quick, user: "can you check my homepage?", expect: { answered: true, matchedChip: "homepage_audit", offScript: false } },
  { slot: "quick_win", question: "Want something useful in the next few minutes?", chips: quick, user: "what does this cost?", expect: { answered: false, offScript: true } },
];

let trailPassed = 0;
console.log("\nTrail answers");
for (const c of trailCases) {
  const messages: UIMessage[] = [
    { id: "a", role: "assistant", parts: [{ type: "text", text: c.question }] },
    { id: "u", role: "user", parts: [{ type: "text", text: c.user }] },
  ];
  const started = performance.now();
  const { answer } = await extractEntryUpdate(emptyEntry, messages, { slot: c.slot, question: c.question, chips: c.chips });
  latencies.push(performance.now() - started);
  const problems = [
    !answer && "no answer",
    answer && answer.answered !== c.expect.answered && `answered ${answer.answered}`,
    answer && c.expect.matchedChip !== undefined && answer.matchedChip !== c.expect.matchedChip && `chip ${answer.matchedChip}`,
    answer && !!answer.offScript !== c.expect.offScript && `offScript ${answer.offScript}`,
    answer?.answered && (!answer.summary || answer.summary.split(/\s+/).length > 5) && `summary ${JSON.stringify(answer.summary)}`,
  ].filter(Boolean);
  if (!problems.length) trailPassed++;
  console.log(
    `${problems.length ? "✗" : "✓"} ${JSON.stringify(c.user).padEnd(56)} ${answer?.summary ? `→ ${answer.summary}` : ""}  ${problems.join(", ")}`,
  );
}

const rate = passed / cases.length;
const trailRate = trailPassed / trailCases.length;
const sorted = latencies.toSorted((a, b) => a - b);
console.log(`\nEntry answers: ${passed}/${cases.length} exact (${(rate * 100).toFixed(0)}%), target ≥ 95%`);
console.log(`Trail answers: ${trailPassed}/${trailCases.length} exact (${(trailRate * 100).toFixed(0)}%), target ≥ 90%`);
console.log(`Latency p50 ${Math.round(sorted[Math.floor(sorted.length / 2)])}ms, p95 ${Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1])}ms`);
process.exit(rate >= 0.95 && trailRate >= 0.9 ? 0 : 1);
