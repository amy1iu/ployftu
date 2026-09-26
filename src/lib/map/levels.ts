import { getSpec } from "@/lib/catalog";
import { primitives } from "@/lib/catalog/primitives";
import { logEvent } from "@/lib/db/events";
import {
  getDocs,
  getIntegrations,
  getMapNode,
  getMapNodes,
  getPloy,
  getPloys,
  linkNodePloy,
  updatePloy,
} from "@/lib/db/workspaces";
import { createTaskPloy, tickSteps } from "@/lib/tasks/ploy";
import type { TaskUIMessage } from "@/lib/tasks/types";
import { nodeState } from "./state";

const triggerLines = {
  manual: "It runs whenever you start it.",
  schedule: "It runs on a schedule, so once it's on you don't have to think about it.",
  event: "It runs automatically whenever its trigger happens (like a new lead coming in).",
};

/**
 * Starts a level from the map: its task ploy opens with the plan, and the
 * node lights up. Returns the ploy; run it with runLevel. Ploybooks don't
 * really run in this demo, so the work is a scripted preview.
 */
export async function startLevel(nodeId: string) {
  const node = await getMapNode(nodeId);
  if (node.ploy_id) return getPloy(node.ploy_id);

  const [ploys, integrations, mapNodes, docs] = await Promise.all([
    getPloys(node.workspace_id),
    getIntegrations(node.workspace_id),
    getMapNodes(node.workspace_id),
    getDocs(node.workspace_id),
  ]);
  const { state, lockReason } = nodeState(node, { ploys, integrations, mapNodes, docs });
  if (state !== "available") throw new Error(`Level isn't available: ${lockReason ?? state}`);

  const spec = getSpec(node.spec_id)!;
  const ploy = await createTaskPloy(node.workspace_id, { ...spec, name: node.title }, node.reason ?? "");
  await linkNodePloy(node.id, ploy.id);
  await logEvent(node.workspace_id, "level_started", { specId: spec.id, ployId: ploy.id });
  return ploy;
}

/** Ticks through the Ploybook's steps, then shows what it would set up. */
export async function runLevel(ployId: string) {
  const ploy = await getPloy(ployId);
  const spec = ploy.spec!;
  const messages = await tickSteps(ployId, ploy.messages as TaskUIMessage[], Promise.resolve());
  const setup = spec.steps
    .map((step) => `- **${step.kind === "primitive" ? primitives[step.primitive].name : "Research"}**: ${step.label}`)
    .join("\n");
  const done: TaskUIMessage = {
    id: "summary",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `Here's what this Ploybook sets up:\n\n${setup}\n\n${triggerLines[spec.trigger]} Everything it makes shows up in your Docs and Ploys.`,
      },
    ],
  };
  await updatePloy(ployId, { messages: [...messages, done], status: "done", unread: true });
  await logEvent(ploy.workspace_id, "level_done", { specId: spec.id });
}
