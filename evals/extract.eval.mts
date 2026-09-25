// Extraction precision eval: does recording the user's answers pick up exactly
// what each message says, and nothing it doesn't? Single-message cases.
//
//   npm run eval:extract

import type { UIMessage } from "ai";
import { extractEntryUpdate } from "@/lib/ai/onboarding/extract";
import { emptyEntry } from "@/lib/onboarding/entry";
import { greetingMessage } from "@/lib/onboarding/greeting";

const askGoals =
  "Nice, thanks. **Is there something specific you want to move in the next few months?** If not, I can suggest a starting point.";
const askBusiness = "No problem. **What does your business do, in a sentence?**";
const greeting = greetingMessage().parts.map((p) => (p.type === "text" ? p.text : "")).join("");

type Expect = {
  website: "has" | "none" | "not_live" | null;
  goals: "has" | "unsure" | null;
  business: boolean;
  intent?: string[];
  unmatched?: boolean;
};

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
    { id: "a", role: "assistant", parts: [{ type: "text", text: c.assistant }] },
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

const rate = passed / cases.length;
const sorted = latencies.toSorted((a, b) => a - b);
console.log(`\n${passed}/${cases.length} exact (${(rate * 100).toFixed(0)}%), target ≥ 95%`);
console.log(`Latency p50 ${Math.round(sorted[Math.floor(sorted.length / 2)])}ms, p95 ${Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1])}ms`);
process.exit(rate >= 0.95 ? 0 : 1);
