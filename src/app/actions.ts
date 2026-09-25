"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OnboardingStatus } from "@/lib/db/types";
import { createWorkspace, openWorkspace, setOnboardingStatus } from "@/lib/db/workspaces";

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
