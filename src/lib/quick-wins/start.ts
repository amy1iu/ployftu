import { agentTools } from "@/lib/catalog/agent-tools";
import { getIntent } from "@/lib/catalog/intents";
import { primitives } from "@/lib/catalog/primitives";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import { logEvent } from "@/lib/db/events";
import type { Doc, Ploy, Workspace } from "@/lib/db/types";
import { createPloy } from "@/lib/db/workspaces";
import { defaultQuickWin, entryBranch, topIntent, type Entry } from "@/lib/onboarding/entry";
import type { PlanStep, TaskUIMessage } from "./types";

/**
 * The first deliverable starts once we know enough to make it good: the path is
 * set, we know what they sell, and they've answered one follow-up since.
 * Returns the recipe to start this turn, or null.
 */
export function quickWinToStart({
  workspace,
  docs,
  ploys,
  userTurns,
}: {
  workspace: Workspace;
  docs: Doc[];
  ploys: Ploy[];
  userTurns: number;
}): QuickWinId | null {
  const { entry } = workspace;
  if (!entryBranch(entry) || entry.resolvedAtTurn == null || userTurns <= entry.resolvedAtTurn) return null;
  if (ploys.some((p) => p.spec?.source === "quick_win")) return null;
  const knowsWhatTheySell = docs.find((d) => d.slug === "business-overview")?.sections["what-we-do"]?.status !== "empty";
  return knowsWhatTheySell ? defaultQuickWin(entry) : null;
}

function whyThisFirst(entry: Entry, recipeId: QuickWinId) {
  const branch = entryBranch(entry);
  if (branch === "B")
    return "You weren't sure where to start, and your homepage is the first thing every visitor sees, so it's the quickest place to find wins.";
  if (recipeId === "landing_page_draft" && entry.website.status !== "has")
    return "You don't have a live site yet, so a landing page is the foundation everything else builds on.";
  const intent = topIntent(entry);
  if (entry.goals.inUserWords) return `You told me: "${entry.goals.inUserWords.replace(/[.!]+$/, "")}." This is the fastest first step toward that.`;
  return intent ? `Your focus is to ${getIntent(intent).label.toLowerCase()}, and this is the fastest first step toward it.` : "";
}

const stepName = (step: (typeof quickWins)[QuickWinId]["spec"]["steps"][number]) =>
  step.kind === "primitive" ? primitives[step.primitive].name : agentTools[step.tool].name;

/** Creates the task ploy for a quick win with its kickoff message; runQuickWin does the work. */
export async function startQuickWin(workspace: Workspace, recipeId: QuickWinId) {
  const { spec } = quickWins[recipeId];
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
      { type: "text", text: `**Goal:** ${spec.goal}\n\n${whyThisFirst(workspace.entry, recipeId)}\n\nHere's how Ploy does it:` },
      { type: "data-plan", data: { steps } },
    ],
  };
  const ploy = await createPloy({
    workspace_id: workspace.id,
    title: spec.name,
    spec,
    status: "running",
    messages: [kickoff],
  });
  await logEvent(workspace.id, "quick_win_started", { recipeId, ployId: ploy.id });
  return ploy;
}
