import { agentTools } from "@/lib/catalog/agent-tools";
import type { PloybookSpec, Step } from "@/lib/catalog/ploybooks";
import { primitives } from "@/lib/catalog/primitives";
import { createPloy, updatePloy } from "@/lib/db/workspaces";
import type { PlanStep, TaskUIMessage } from "./types";

// What every task ploy shares, whether it's the first deliverable or a level
// started from the map: a kickoff with a plan card, and steps that tick through.

/** How long each plan step shows as running (the last one runs until the work is done). */
const STEP_MS = Number(process.env.DEMO_STEP_MS ?? 1800);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stepName = (step: Step) =>
  step.kind === "primitive" ? primitives[step.primitive].name : agentTools[step.tool].name;

/** Creates a task ploy that opens with its goal, why it's for them, and its plan. */
export async function createTaskPloy(workspaceId: string, spec: PloybookSpec, why: string) {
  const steps: PlanStep[] = spec.steps.map((step) => ({
    label: step.label,
    kind: step.kind,
    name: stepName(step),
    status: "pending",
  }));
  const kickoff: TaskUIMessage = {
    id: "kickoff",
    role: "assistant",
    parts: [
      { type: "text", text: [`**Goal:** ${spec.goal}`, why, "Here's how Ploy does it:"].filter(Boolean).join("\n\n") },
      { type: "data-plan", data: { steps } },
    ],
  };
  return createPloy({ workspace_id: workspaceId, title: spec.name, spec, status: "running", messages: [kickoff] });
}

/** The messages with the plan card's steps replaced. */
function withSteps(messages: TaskUIMessage[], steps: PlanStep[]): TaskUIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === "data-plan" ? { ...p, data: { steps } } : p)),
  }));
}

/**
 * Ticks the plan's steps through one by one (the last waits for `work`), and
 * returns the messages with every step done.
 */
export async function tickSteps(ployId: string, messages: TaskUIMessage[], work: Promise<unknown>) {
  const plan = messages.flatMap((m) => m.parts).find((p) => p.type === "data-plan");
  const steps = plan?.type === "data-plan" ? plan.data.steps.map((s) => ({ ...s })) : [];
  for (const [i, step] of steps.entries()) {
    step.status = "running";
    await updatePloy(ployId, { messages: withSteps(messages, steps) });
    await (i === steps.length - 1 ? work : sleep(STEP_MS));
    step.status = "done";
  }
  await work;
  return withSteps(messages, steps);
}
