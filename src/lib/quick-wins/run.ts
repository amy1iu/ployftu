import type { QuickWinId } from "@/lib/catalog/quick-wins";
import { logEvent } from "@/lib/db/events";
import { getPloy, saveDeliverableDoc, updatePloy } from "@/lib/db/workspaces";
import { generateDeliverable } from "./generate";
import { deliverableMarkdown } from "./markdown";
import type { PlanStep, TaskUIMessage } from "./types";

/** How long each plan step shows as running (the last one runs until the deliverable is ready). */
const STEP_MS = Number(process.env.DEMO_STEP_MS ?? 1800);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The kickoff message with its plan card's steps replaced. */
function withSteps(messages: TaskUIMessage[], steps: PlanStep[]): TaskUIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === "data-plan" ? { ...p, data: { steps } } : p)),
  }));
}

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
  const messages = ploy.messages as TaskUIMessage[];
  const plan = messages.flatMap((m) => m.parts).find((p) => p.type === "data-plan");
  const steps = plan?.type === "data-plan" ? plan.data.steps.map((s) => ({ ...s })) : [];

  const deliverable = generateDeliverable(workspaceId, recipeId);
  const show = () => updatePloy(ployId, { messages: withSteps(messages, steps) });
  for (const [i, step] of steps.entries()) {
    step.status = "running";
    await show();
    await (i === steps.length - 1 ? deliverable : sleep(STEP_MS));
    step.status = "done";
  }

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
  await updatePloy(ployId, { messages: [...withSteps(messages, steps), done], status: "done", unread: true });
  await logEvent(workspaceId, "quick_win_done", { recipeId, fallback, ms: Date.now() - started });
}
