import type { QuickWinId } from "@/lib/catalog/quick-wins";
import { logEvent } from "@/lib/db/events";
import { getPloy, saveDeliverableDoc, updatePloy } from "@/lib/db/workspaces";
import { syncMap } from "@/lib/map/sync";
import { tickSteps } from "@/lib/tasks/ploy";
import type { TaskUIMessage } from "@/lib/tasks/types";
import { generateDeliverable } from "./generate";
import { deliverableMarkdown } from "./markdown";

/**
 * Does a quick win's work in its task ploy: ticks through the plan's steps
 * while the deliverable is written, then posts it, saves it to Docs, and marks
 * the ploy done and unread (the app shows a completion pop-up).
 */
export async function runQuickWin(workspaceId: string, ployId: string) {
  try {
    await doQuickWin(workspaceId, ployId);
  } catch (error) {
    console.error(`Quick win ${ployId} failed`, error);
    const ploy = await getPloy(ployId);
    const sorry: TaskUIMessage = {
      id: "error",
      role: "assistant",
      parts: [{ type: "text", text: "Something went wrong while building this, sorry." }],
    };
    await updatePloy(ployId, { messages: [...ploy.messages, sorry], status: "idle" });
  }
}

async function doQuickWin(workspaceId: string, ployId: string) {
  const started = Date.now();
  const ploy = await getPloy(ployId);
  const recipeId = ploy.spec!.id as QuickWinId;
  const deliverable = generateDeliverable(workspaceId, recipeId);
  void syncMap(workspaceId); // puts the first deliverable on the map
  const messages = await tickSteps(ployId, ploy.messages as TaskUIMessage[], deliverable);
  const { output, fallback } = await deliverable;
  const name = ploy.spec!.name;
  await saveDeliverableDoc(workspaceId, recipeId, name, deliverableMarkdown(recipeId, output));
  const done: TaskUIMessage = {
    id: "deliverable",
    role: "assistant",
    parts: [
      { type: "text", text: `Your ${name.toLowerCase()} is ready. I saved a copy to Docs.` },
      { type: "data-deliverable", data: { recipeId, output, docSlug: recipeId, fallback } },
    ],
  };
  await updatePloy(ployId, { messages: [...messages, done], status: "done", unread: true });
  await logEvent(workspaceId, "quick_win_done", { recipeId, fallback, ms: Date.now() - started });
  await syncMap(workspaceId); // the fog lifts once the first deliverable is done
}

/** Puts a failed quick win back to its starting plan so it can run again. */
export async function resetQuickWin(ployId: string) {
  const ploy = await getPloy(ployId);
  if (ploy.spec?.source !== "quick_win" || ploy.status !== "idle") throw new Error("Only a failed quick win can be retried");
  const messages = (ploy.messages as TaskUIMessage[])
    .filter((m) => m.id === "kickoff")
    .map((m) => ({
      ...m,
      parts: m.parts.map((p) =>
        p.type === "data-plan" ? { ...p, data: { steps: p.data.steps.map((s) => ({ ...s, status: "pending" as const })) } } : p,
      ),
    }));
  await updatePloy(ployId, { messages, status: "running" });
}
