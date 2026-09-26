import { db } from "@/lib/supabase/admin";

// Funnel events. Names: workspace_created, website_answered, goals_answered,
// branch_resolved, unmatched_intent, onboarding_status_changed.
export async function logEvent(workspaceId: string, name: string, props: Record<string, unknown> = {}) {
  const { error } = await db().from("events").insert({ workspace_id: workspaceId, name, props });
  if (error) console.error(`Failed to log event ${name}`, error);
}

/** Several events in one insert (e.g. every decision of a turn). */
export async function logEvents(workspaceId: string, events: { name: string; props: Record<string, unknown> }[]) {
  if (!events.length) return;
  const { error } = await db().from("events").insert(events.map((e) => ({ workspace_id: workspaceId, ...e })));
  if (error) console.error(`Failed to log ${events.length} events`, error);
}
