// Onboarding funnel across real (non-eval) workspaces: how many runs reach each
// step, plus timings, paths, and what people asked for that Ploy doesn't cover.
//
//   npm run funnel

import { db } from "@/lib/supabase/admin";

type Event = { workspace_id: string; name: string; props: Record<string, unknown>; created_at: string };

const steps: { label: string; match: (e: Event) => boolean }[] = [
  // Any activity (some early workspaces predate the workspace_created event).
  { label: "Started onboarding", match: () => true },
  { label: "Answered the website question", match: (e) => e.name === "website_answered" },
  { label: "Answered the goals question", match: (e) => e.name === "goals_answered" },
  { label: "Path set (both answered)", match: (e) => e.name === "branch_resolved" },
  { label: "Picked a quick win or a goal", match: (e) => e.name === "question_answered" && ["goal", "quick_win"].includes(String(e.props.slot)) },
  { label: "First deliverable started", match: (e) => e.name === "quick_win_started" },
  { label: "First deliverable ready", match: (e) => e.name === "quick_win_done" },
  { label: "Started a task on the map", match: (e) => e.name === "level_started" },
  { label: "Connected a tool", match: (e) => e.name === "integration_connected" },
  { label: "Finished onboarding", match: (e) => e.name === "onboarding_status_changed" && e.props.status === "completed" },
];

const { data: real } = await db().from("workspaces").select("id").eq("is_eval", false);
const ids = new Set((real ?? []).map((w) => w.id));
const { data } = await db().from("events").select("workspace_id, name, props, created_at").order("created_at");
const events = ((data ?? []) as Event[]).filter((e) => ids.has(e.workspace_id));

const reached = (match: (e: Event) => boolean) => new Set(events.filter(match).map((e) => e.workspace_id)).size;
const total = reached(steps[0].match) || 1;

console.log(`Onboarding funnel (${total} workspaces with activity)\n`);
for (const step of steps) {
  const n = reached(step.match);
  const bar = "█".repeat(Math.round((n / total) * 30));
  console.log(`  ${step.label.padEnd(32)} ${String(n).padStart(4)}  ${String(Math.round((n / total) * 100)).padStart(3)}%  ${bar}`);
}

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (name: string) => events.filter((e) => e.name === name && typeof e.props.ms === "number").map((e) => e.props.ms as number);
const secs = (values: number[]) => (values.length ? `${(median(values) / 1000).toFixed(1)}s median (n=${values.length})` : "no data");
console.log(`\nSite read to profile:      ${secs(ms("site_read"))}`);
console.log(`First deliverable build:   ${secs(ms("quick_win_done"))}`);

const count = (values: unknown[]) =>
  Object.entries(values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [String(v)]: (acc[String(v)] ?? 0) + 1 }), {}))
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "none";
console.log(`Paths:                     ${count(events.filter((e) => e.name === "branch_resolved").map((e) => e.props.branch))}`);
console.log(`Turns to set the path:     ${count(events.filter((e) => e.name === "branch_resolved").map((e) => e.props.userTurns))}`);
console.log(`Sites that couldn't be read: ${events.filter((e) => e.name === "site_unreadable").length}`);
const answers = events.filter((e) => e.name === "question_answered");
console.log(`Answers by chip vs typed:  ${count(answers.map((e) => e.props.via))}`);
console.log(`Quick win picked at fork:  ${events.filter((e) => e.name === "quick_win_started" && e.props.picked).length}`);
const unmatched = events.filter((e) => e.name === "unmatched_intent").map((e) => `"${e.props.text}"`);
console.log(`Asked for, not covered:    ${unmatched.length ? unmatched.join("; ") : "none"}`);
