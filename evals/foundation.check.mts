// Foundation checks (phase 1, gate 1): workspace seeding, isolation between
// runs, and Realtime latency. Uses throwaway eval workspaces.
//
//   npm run check:foundation

import { createClient } from "@supabase/supabase-js";
import { createWorkspace, loadSnapshot } from "@/lib/db/workspaces";
import { profileDocs } from "@/lib/docs/profile";
import { applyEntryUpdate } from "@/lib/onboarding/set-entry";
import { db } from "@/lib/supabase/admin";

const results: { name: string; pass: boolean; detail?: string }[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
};

const created: string[] = [];
try {
  // Seeding
  const a = await createWorkspace({ isEval: true });
  created.push(a.id);
  const seeded = await loadSnapshot(a.id);
  const onboarding = seeded.ploys.filter((p) => p.kind === "onboarding");
  check("New workspace has exactly one Getting Started ploy", onboarding.length === 1 && seeded.ploys.length === 1);
  check("Getting Started opens with the greeting", onboarding[0]?.messages[0]?.id === "greeting");
  check(
    "New workspace has the 4 profile docs, all sections empty",
    seeded.docs.length === profileDocs.length &&
      seeded.docs.every((d) => Object.values(d.sections).every((s) => s.status === "empty")),
  );
  check("Onboarding starts active with no entry answers", a.onboarding_status === "active" && a.entry.website.status === "unknown");

  // Isolation: a second run doesn't touch the first
  await applyEntryUpdate(
    a.id,
    { website: { status: "has", url: "acme.com" }, goals: null, business: { whatTheyDo: "Widgets", whoTheyServe: null } },
    { userTurns: 1 },
  );
  const before = await loadSnapshot(a.id);
  const b = await createWorkspace({ isEval: true });
  created.push(b.id);
  const [afterA, snapB] = await Promise.all([loadSnapshot(a.id), loadSnapshot(b.id)]);
  check(
    "Start fresh leaves the previous run untouched",
    JSON.stringify({ ...afterA, workspaces: [] }) === JSON.stringify({ ...before, workspaces: [] }),
  );
  check(
    "New run starts clean",
    snapB.workspace.entry.website.status === "unknown" &&
      snapB.docs.every((d) => Object.values(d.sections).every((s) => s.status === "empty")),
  );
  const leaked = [...snapB.ploys, ...snapB.docs, ...snapB.mapNodes].filter((r) => r.workspace_id !== b.id);
  check("A workspace's snapshot contains only its own rows", leaked.length === 0);
  check("Eval workspaces are hidden from the switcher", !snapB.workspaces.some((w) => created.includes(w.id)));

  // Realtime: server writes reach a browser-key subscriber quickly
  const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const pending = new Map<string, number>();
  const latencies: number[] = [];
  const channel = browser
    .channel(`check:${a.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "ploys", filter: `workspace_id=eq.${a.id}` }, (payload) => {
      const sent = pending.get((payload.new as { title: string }).title);
      if (sent) latencies.push(performance.now() - sent);
    });
  await new Promise<void>((resolve, reject) =>
    channel.subscribe((status) => (status === "SUBSCRIBED" ? resolve() : status === "CHANNEL_ERROR" && reject(new Error(status)))),
  );
  // SUBSCRIBED is acked slightly before the change binding is live; the app
  // subscribes at page load, long before any writes, so warm up first.
  await new Promise((r) => setTimeout(r, 1000));
  for (let i = 0; i < 10; i++) {
    const title = `realtime-check-${i}`;
    pending.set(title, performance.now());
    await db().from("ploys").insert({ workspace_id: a.id, kind: "task", title });
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1500));
  await browser.removeChannel(channel);
  const sorted = latencies.toSorted((x, y) => x - y);
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Infinity;
  check("Realtime delivers every change", latencies.length === 10, `${latencies.length}/10`);
  check("Realtime p95 under 1s", p95 < 1000, `p95 ${Math.round(p95)}ms, p50 ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)}ms`);
} finally {
  if (created.length) await db().from("workspaces").delete().in("id", created);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${failed ? `${failed} check(s) failed.` : "All foundation checks pass."}`);
process.exit(failed ? 1 : 0);
