"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { OnboardingStatus } from "@/lib/db/types";
import { integrationCategoryIds, type IntegrationCategory } from "@/lib/catalog/integrations";
import { logEvent } from "@/lib/db/events";
import {
  connectIntegration as saveIntegration,
  createPloy,
  createWorkspace,
  getPloy,
  getWorkspace,
  openWorkspace,
  setOnboardingStatus,
  updatePloy,
} from "@/lib/db/workspaces";
import { recordProfileNotes } from "@/lib/ai/onboarding/profile-notes";
import { runLevel, startLevel } from "@/lib/map/levels";
import { syncMap } from "@/lib/map/sync";
import { resetQuickWin, runQuickWin } from "@/lib/quick-wins/run";
import { replyInPloy } from "@/lib/tasks/reply";
import { confirmSiteProfile } from "@/lib/site/run";

// Single-user demo: no auth checks. Revalidating the layout swaps in the new
// workspace's snapshot without a visible reload.

export async function startFresh() {
  await createWorkspace();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchWorkspace(id: string) {
  await openWorkspace(id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateOnboardingStatus(workspaceId: string, status: OnboardingStatus) {
  await setOnboardingStatus(workspaceId, status);
}

export async function confirmProfile(workspaceId: string) {
  await confirmSiteProfile(workspaceId);
}

/** "Fix something" on the profile drafted from their site: apply their correction, then confirm the rest. */
export async function fixProfile(workspaceId: string, correction: string) {
  const { crawl } = await getWorkspace(workspaceId);
  await recordProfileNotes(workspaceId, [
    {
      id: "profile",
      role: "assistant",
      parts: [{ type: "text", text: `Here's what I picked up from your site: ${crawl?.summary?.oneLiner ?? ""} What should I fix?` }],
    },
    { id: "fix", role: "user", parts: [{ type: "text", text: correction }] },
  ]);
  await confirmSiteProfile(workspaceId);
  await logEvent(workspaceId, "profile_fixed");
  after(() => syncMap(workspaceId)); // what they sell or who they sell to can unlock tasks
}

export async function markPloyRead(ployId: string) {
  await updatePloy(ployId, { unread: false });
}

export async function sendPloyMessage(ployId: string, text: string) {
  await replyInPloy(ployId, text);
}

/** A ploy's title from its first message: the first sentence, cut at a word near 48 characters. */
function ployTitle(text: string) {
  const first = text.split(/(?<=[.?!])\s/)[0].trim();
  if (first.length <= 48) return first;
  const cut = first.slice(0, 48);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : 48)}…`;
}

/** Starts a chat ploy from a message (the You're set up card, Overview) and returns its id; Ploy's reply follows. */
export async function startPloy(workspaceId: string, text: string) {
  const message = text.trim().slice(0, 4000);
  if (!message) throw new Error("Say what you need first");
  const ploy = await createPloy({ workspace_id: workspaceId, title: ployTitle(message), spec: null, status: "idle", messages: [] });
  await logEvent(workspaceId, "ploy_started", { from: "message" });
  after(() => replyInPloy(ploy.id, message));
  return ploy.id;
}

/** Starts a level from the map and returns its task ploy's id (the work runs after the response). */
export async function startMapLevel(nodeId: string) {
  const ploy = await startLevel(nodeId);
  if (ploy.status === "running") after(() => runLevel(ploy.id));
  return ploy.id;
}

/** Mock OAuth: records that `tool` (any name, e.g. "Attio") provides a capability, so locked levels unlock. */
export async function connectIntegration(workspaceId: string, category: IntegrationCategory, tool: string) {
  const name = tool.trim().slice(0, 40);
  if (!integrationCategoryIds.includes(category) || !name) throw new Error("Pick a capability and a tool");
  await saveIntegration(workspaceId, category, name);
  await logEvent(workspaceId, "integration_connected", { category, tool: name });
}

/** Turns a recurring Ploybook on (live) or back off. Demo only: nothing actually runs on a schedule. */
export async function setPloybookLive(ployId: string, live: boolean) {
  const ploy = await getPloy(ployId);
  if (!ploy.spec || ploy.spec.trigger === "manual" || (ploy.status !== "done" && ploy.status !== "live"))
    throw new Error("Only a finished recurring Ploybook can be turned on");
  await updatePloy(ployId, { status: live ? "live" : "done" });
  await logEvent(ploy.workspace_id, live ? "ploybook_live" : "ploybook_paused", { specId: ploy.spec.id });
}

/** Runs a first deliverable again after it failed. */
export async function retryQuickWin(ployId: string) {
  await resetQuickWin(ployId);
  const ploy = await getPloy(ployId);
  after(() => runQuickWin(ploy.workspace_id, ployId));
}
