import { db } from "@/lib/supabase/admin";

// Funnel events. Names: workspace_created, website_answered, goals_answered,
// branch_resolved, unmatched_intent, onboarding_status_changed.
export async function logEvent(workspaceId: string, name: string, props: Record<string, unknown> = {}) {
  const { error } = await db().from("events").insert({ workspace_id: workspaceId, name, props });
  if (error) console.error(`Failed to log event ${name}`, error);
}
