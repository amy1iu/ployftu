"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { OnboardingStatus } from "@/lib/db/types";
import { integrationCategoryIds, type IntegrationCategory } from "@/lib/catalog/integrations";
import { logEvent } from "@/lib/db/events";
import {
  connectIntegration as saveIntegration,
  createWorkspace,
  getPloy,
  openWorkspace,
  setOnboardingStatus,
  updatePloy,
} from "@/lib/db/workspaces";
import { runLevel, startLevel } from "@/lib/map/levels";
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

export async function markPloyRead(ployId: string) {
  await updatePloy(ployId, { unread: false });
}

export async function sendPloyMessage(ployId: string, text: string) {
  await replyInPloy(ployId, text);
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
